import 'dart:convert';
import 'dart:typed_data';

/// CSV import/export of workout plans, same format as the IronBandit web app:
///
///     plan_name,exercise_name,order_index,notes
///
/// `notes` may be missing, unknown columns are rejected. Every cell is text
/// only; exported cells never start a spreadsheet formula.
const csvColumns = ['plan_name', 'exercise_name', 'order_index', 'notes'];
const _requiredColumns = ['plan_name', 'exercise_name', 'order_index'];

const maxCsvBytes = 1024 * 1024;
const maxCsvRows = 2000;
const maxNameLength = 255;
const maxNotesLength = 500;
const maxPlansPerImport = 20;
const maxItemsPerPlan = 200;
const maxOrderIndex = 10000;

const _formulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];

/// Letters/digits (umlauts too) plus the punctuation of real exercise names
/// ("Trizeps-Pushdown", "Rudern (vorgebeugt)", "Push/Pull").
final _nameAllowed = RegExp(r"^[\p{L}\p{N}_ \-.,()&/+'’!°%]+$", unicode: true);

enum CsvError {
  empty,
  tooBig,
  binary,
  notUtf8,
  unreadable,
  missingColumns,
  unknownColumns,
  duplicateColumns,
  tooManyRows,
  tooManyPlans,
  noValidRows,
}

/// The file as a whole can't be used; [arg] names columns or limits.
class CsvRejected implements Exception {
  const CsvRejected(this.error, [this.arg = '']);

  final CsvError error;
  final String arg;

  @override
  String toString() => 'CsvRejected($error, $arg)';
}

enum RowProblem {
  planNameEmpty,
  planNameTooLong,
  planNameInvalid,
  exerciseNameEmpty,
  exerciseNameTooLong,
  exerciseNameInvalid,
  orderNotNumber,
  orderOutOfRange,
  notesTooLong,
  tooManyItems,
}

class RowError {
  const RowError(this.line, this.problem);

  final int line;
  final RowProblem problem;
}

class CsvRow {
  const CsvRow(this.line, this.exerciseName, this.orderIndex, this.notes);

  final int line;
  final String exerciseName;
  final int orderIndex;
  final String notes;
}

class CsvPlan {
  const CsvPlan(this.name, this.rows);

  final String name;

  /// Sorted by order_index, ties in file order.
  final List<CsvRow> rows;
}

class ParsedCsv {
  const ParsedCsv(this.plans, this.errors);

  final List<CsvPlan> plans;
  final List<RowError> errors;
}

/// Protective ' before cells that would otherwise start a formula.
String neutralizeCell(Object? value) {
  final text = '${value ?? ''}';
  return text.isNotEmpty && _formulaPrefixes.contains(text[0]) ? "'$text" : text;
}

/// Import side: drops control characters and our own export protection,
/// trims, and protects again.
String defuseCell(String value) {
  var text = value.replaceAll(RegExp(r'[\x00-\x1F\x7F]'), '');
  if (text.length >= 2 && text[0] == "'" && _formulaPrefixes.contains(text[1])) text = text.substring(1);
  text = text.trim();
  return neutralizeCell(text);
}

String _quote(String s) => RegExp(r'[",\n\r]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;

/// Plans in the import format; [plans] = (name, [(exercise, order, notes)]).
String writePlanCsv(List<(String, List<(String, int, String?)>)> plans) {
  final out = StringBuffer('${csvColumns.join(',')}\n');
  for (final (plan, items) in plans) {
    for (final (exercise, order, notes) in items) {
      out.write(
        '${[_quote(neutralizeCell(plan)), _quote(neutralizeCell(exercise)), '$order', _quote(neutralizeCell(notes))].join(',')}\n',
      );
    }
  }
  return out.toString();
}

/// Sample file with two plans.
String samplePlanCsv({required bool german}) => writePlanCsv(
  german
      ? [
          (
            'Push Day',
            [
              ('Bankdrücken', 1, 'Aufwärmsatz nicht vergessen'),
              ('Schulterdrücken', 2, null),
              ('Trizeps-Pushdown', 3, 'langsam ablassen'),
            ],
          ),
          ('Pull Day', [('Klimmzüge', 1, null), ('Rudern vorgebeugt', 2, null), ('Bizeps-Curls', 3, null)]),
        ]
      : [
          (
            'Push Day',
            [
              ('Bench Press', 1, "Don't skip the warm-up set"),
              ('Overhead Press', 2, null),
              ('Triceps Pushdown', 3, 'lower slowly'),
            ],
          ),
          ('Pull Day', [('Pull-ups', 1, null), ('Bent-over Row', 2, null), ('Biceps Curls', 3, null)]),
        ],
);

/// Checks size and content type; returns the text.
String decodeCsv(Uint8List data) {
  if (data.isEmpty) throw const CsvRejected(CsvError.empty);
  if (data.length > maxCsvBytes) throw const CsvRejected(CsvError.tooBig, '${maxCsvBytes ~/ 1024}');
  const magic = [
    [0x50, 0x4B, 0x03, 0x04], // zip/xlsx
    [0xD0, 0xCF, 0x11, 0xE0], // office
    [0x25, 0x50, 0x44, 0x46], // pdf
    [0x89, 0x50, 0x4E, 0x47], // png
    [0xFF, 0xD8, 0xFF], // jpeg
    [0x1F, 0x8B], // gzip
  ];
  for (final m in magic) {
    if (data.length >= m.length && List.generate(m.length, (i) => data[i] == m[i]).every((b) => b)) {
      throw const CsvRejected(CsvError.binary);
    }
  }
  final String text;
  try {
    text = utf8.decode(data);
  } on FormatException {
    throw const CsvRejected(CsvError.notUtf8);
  }
  if (text.contains('\x00')) throw const CsvRejected(CsvError.binary);
  return text.startsWith('﻿') ? text.substring(1) : text;
}

/// RFC 4180 records with the line number each record starts on.
List<(int, List<String>)> readCsvRecords(String text) {
  final records = <(int, List<String>)>[];
  var row = <String>[];
  final cell = StringBuffer();
  var line = 1, start = 1;
  var quoted = false, wasQuoted = false;
  var i = 0;
  void endCell() {
    row.add(cell.toString());
    cell.clear();
    wasQuoted = false;
  }

  void endRow() {
    endCell();
    records.add((start, row));
    row = <String>[];
    start = line;
  }

  while (i < text.length) {
    final ch = text[i];
    if (quoted) {
      if (ch == '"') {
        if (i + 1 < text.length && text[i + 1] == '"') {
          cell.write('"');
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch == '\n') line++;
        cell.write(ch);
      }
    } else if (ch == '"') {
      if (cell.isNotEmpty || wasQuoted) throw const CsvRejected(CsvError.unreadable);
      quoted = wasQuoted = true;
    } else if (ch == ',') {
      endCell();
    } else if (ch == '\r' || ch == '\n') {
      if (ch == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++;
      line++;
      endRow();
    } else {
      if (wasQuoted) throw const CsvRejected(CsvError.unreadable);
      cell.write(ch);
    }
    i++;
  }
  if (quoted) throw const CsvRejected(CsvError.unreadable);
  if (cell.isNotEmpty || row.isNotEmpty || wasQuoted) endRow();
  return records;
}

RowProblem? _checkName(String value, RowProblem empty, RowProblem tooLong, RowProblem invalid) {
  if (value.isEmpty) return empty;
  if (value.length > maxNameLength) return tooLong;
  if (!_nameAllowed.hasMatch(value)) return invalid;
  return null;
}

/// Parses the decoded text. Broken rows land in [ParsedCsv.errors], so the
/// valid ones can still be imported; [CsvRejected] when the file as a whole
/// is unusable.
ParsedCsv parsePlanCsv(String text) {
  final records = readCsvRecords(text);
  if (records.isEmpty) throw const CsvRejected(CsvError.empty);
  final columns = records.first.$2.map((h) => h.trim().toLowerCase()).toList();
  final missing = _requiredColumns.where((c) => !columns.contains(c)).toList();
  if (missing.isNotEmpty) throw CsvRejected(CsvError.missingColumns, missing.join(', '));
  final unknown = columns.where((c) => c.isNotEmpty && !csvColumns.contains(c)).toList();
  if (unknown.isNotEmpty) throw CsvRejected(CsvError.unknownColumns, unknown.take(5).join(', '));
  if (columns.toSet().length != columns.length) throw const CsvRejected(CsvError.duplicateColumns);
  final idx = {for (final c in csvColumns) c: columns.indexOf(c)};

  final plans = <String, List<CsvRow>>{};
  final errors = <RowError>[];
  var dataRows = 0;
  for (final (line, row) in records.skip(1)) {
    if (row.every((c) => c.trim().isEmpty)) continue;
    if (++dataRows > maxCsvRows) throw const CsvRejected(CsvError.tooManyRows, '$maxCsvRows');
    String cell(String name) {
      final pos = idx[name]!;
      return pos < 0 || pos >= row.length ? '' : row[pos];
    }

    final plan = defuseCell(cell('plan_name'));
    final exercise = defuseCell(cell('exercise_name'));
    final problem =
        _checkName(plan, RowProblem.planNameEmpty, RowProblem.planNameTooLong, RowProblem.planNameInvalid) ??
        _checkName(
          exercise,
          RowProblem.exerciseNameEmpty,
          RowProblem.exerciseNameTooLong,
          RowProblem.exerciseNameInvalid,
        );
    if (problem != null) {
      errors.add(RowError(line, problem));
      continue;
    }
    final rawOrder = defuseCell(cell('order_index'));
    var order = 0; // without a value the file order counts
    if (rawOrder.isNotEmpty) {
      final n = int.tryParse(rawOrder);
      if (n == null) {
        errors.add(RowError(line, RowProblem.orderNotNumber));
        continue;
      }
      if (n < 0 || n > maxOrderIndex) {
        errors.add(RowError(line, RowProblem.orderOutOfRange));
        continue;
      }
      order = n;
    }
    final notes = defuseCell(cell('notes'));
    if (notes.length > maxNotesLength) {
      errors.add(RowError(line, RowProblem.notesTooLong));
      continue;
    }
    final bucket = plans.putIfAbsent(plan, () => []);
    if (plans.length > maxPlansPerImport) throw const CsvRejected(CsvError.tooManyPlans, '$maxPlansPerImport');
    if (bucket.length >= maxItemsPerPlan) {
      errors.add(RowError(line, RowProblem.tooManyItems));
      continue;
    }
    bucket.add(CsvRow(line, exercise, order, notes));
  }
  if (plans.isEmpty && errors.isEmpty) throw const CsvRejected(CsvError.noValidRows);
  return ParsedCsv([
    for (final MapEntry(key: name, value: rows) in plans.entries)
      if (rows.isNotEmpty)
        CsvPlan(name, [
          for (final (_, r)
              in (rows.indexed.toList()..sort((a, b) {
                final c = a.$2.orderIndex.compareTo(b.$2.orderIndex);
                return c != 0 ? c : a.$1.compareTo(b.$1);
              })))
            r,
        ]),
  ], errors);
}
