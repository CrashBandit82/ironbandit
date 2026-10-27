import 'plan_csv.dart';

/// One exercise on one day from a history CSV.
class CsvLog {
  CsvLog(this.day, this.exerciseName);

  final DateTime day;
  final String exerciseName;
  final sets = <(int, double?)>[];
  double? durationMin;
  double? distanceKm;
}

class ParsedHistory {
  const ParsedHistory(this.logs, this.weights, this.weeklyGoal);

  final List<CsvLog> logs;
  final List<(DateTime, double)> weights;
  final int? weeklyGoal;
}

/// Reads the CSV export of the IronBandit web app ("=== TRAININGSTAGEBUCH ===",
/// "=== GEWICHTSVERLAUF ===") and of this app ("=== TRAINING ===",
/// "=== KÖRPERGEWICHT ===" / "=== BODY WEIGHT ==="). Both have the columns
/// date, exercise, set, reps, weight, duration, distance in this order.
/// Returns null when the text is no such export.
ParsedHistory? parseHistoryCsv(String text) {
  final List<(int, List<String>)> records;
  try {
    records = readCsvRecords(text);
  } on CsvRejected {
    return null;
  }
  final logs = <CsvLog>[];
  final weights = <(DateTime, double)>[];
  int? goal;
  String? section;
  var header = false;
  var found = false;
  for (final (_, row) in records) {
    final first = row.isEmpty ? '' : _unprotect(row.first.trim());
    if (first.startsWith('===')) {
      final name = first.replaceAll('=', '').trim().toUpperCase();
      section = switch (name) {
        'BENUTZERDATEN' => 'user',
        'TRAININGSTAGEBUCH' || 'TRAINING' => 'training',
        'GEWICHTSVERLAUF' || 'KÖRPERGEWICHT' || 'BODY WEIGHT' => 'weight',
        _ => null,
      };
      found |= section == 'training' || section == 'weight';
      header = true;
      continue;
    }
    if (row.every((c) => c.trim().isEmpty)) continue;
    if (header) {
      // column names; the user section names the weekly goal column
      header = false;
      if (section == 'user') section = 'user:${row.indexWhere((c) => c.startsWith('Wochenziel'))}';
      continue;
    }
    String cell(int i) => i < row.length ? _unprotect(row[i].trim()) : '';
    if (section != null && section.startsWith('user:')) {
      final i = int.parse(section.substring(5));
      if (i >= 0) goal = int.tryParse(cell(i));
    } else if (section == 'weight') {
      final day = _date(cell(0));
      final kg = _num(cell(1));
      if (day != null && kg != null && kg > 0) weights.add((day, kg));
    } else if (section == 'training') {
      final day = _date(cell(0));
      final name = cell(1);
      if (day == null || name.isEmpty) continue;
      var log = logs.isEmpty ? null : logs.last;
      final reps = int.tryParse(cell(3));
      // a new entry starts with another day, exercise or set 1
      if (log == null ||
          log.day != day ||
          log.exerciseName != name ||
          (reps != null && cell(2) == '1' && log.sets.isNotEmpty)) {
        log = CsvLog(day, name);
        logs.add(log);
      }
      if (reps != null && reps > 0) log.sets.add((reps, _num(cell(4))));
      log.durationMin ??= _num(cell(5));
      log.distanceKm ??= _num(cell(6));
    }
  }
  return found ? ParsedHistory(logs, weights, goal) : null;
}

/// Drops the protective ' of an exported cell that would start a formula.
String _unprotect(String s) => s.length > 1 && s[0] == "'" && '=+-@'.contains(s[1]) ? s.substring(1) : s;

double? _num(String s) {
  final v = double.tryParse(s.replaceAll(',', '.'));
  return v == null || v <= 0 ? null : v;
}

/// "27.10.2026" (web app) or "2026-10-27" (this app).
DateTime? _date(String s) {
  final de = RegExp(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$').firstMatch(s);
  if (de != null) return DateTime(int.parse(de[3]!), int.parse(de[2]!), int.parse(de[1]!));
  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
  if (iso != null) return DateTime(int.parse(iso[1]!), int.parse(iso[2]!), int.parse(iso[3]!));
  return null;
}
