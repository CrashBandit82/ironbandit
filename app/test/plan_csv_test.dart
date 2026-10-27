import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:ironbandit/data/plan_csv.dart';

void main() {
  test('sample parses into two ordered plans', () {
    final p = parsePlanCsv(samplePlanCsv(german: true));
    expect(p.errors, isEmpty);
    expect(p.plans.map((x) => x.name), ['Push Day', 'Pull Day']);
    expect(p.plans.first.rows.map((r) => r.exerciseName), ['Bankdrücken', 'Schulterdrücken', 'Trizeps-Pushdown']);
  });

  test('order_index sorts, ties keep file order, quoted cells work', () {
    final p = parsePlanCsv(
      'plan_name,exercise_name,order_index,notes\r\n'
      'A,Squat,2,\r\n'
      'A,"Row, bent",1,"say ""hi""\nline 2"\r\n'
      'A,Curl,,\r\n',
    );
    expect(p.plans.single.rows.map((r) => (r.exerciseName, r.notes)), [
      ('Curl', ''),
      ('Row, bent', 'say "hi"line 2'),
      ('Squat', ''),
    ]);
  });

  test('bad rows are reported with their line, the rest stays', () {
    final p = parsePlanCsv(
      'plan_name,exercise_name,order_index\n'
      'A,Squat,1\n'
      ',Row,2\n'
      'A,Bad=Name,3\n'
      'A,Curl,x\n'
      'A,Dip,99999\n',
    );
    expect(p.plans.single.rows.single.exerciseName, 'Squat');
    expect(p.errors.map((e) => (e.line, e.problem)), [
      (3, RowProblem.planNameEmpty),
      (4, RowProblem.exerciseNameInvalid),
      (5, RowProblem.orderNotNumber),
      (6, RowProblem.orderOutOfRange),
    ]);
  });

  test('formulas are defused on import, export protection is not doubled', () {
    expect(defuseCell("'=1+1"), "'=1+1");
    expect(defuseCell('=1+1'), "'=1+1");
    expect(defuseCell(' Bench\x00 '), 'Bench');
  });

  test('whole-file problems', () {
    expect(
      () => parsePlanCsv('plan_name,exercise_name\nA,B\n'),
      throwsA(isA<CsvRejected>().having((e) => e.arg, 'arg', 'order_index')),
    );
    expect(
      () => parsePlanCsv('plan_name,exercise_name,order_index,sets\n'),
      throwsA(isA<CsvRejected>().having((e) => e.error, 'error', CsvError.unknownColumns)),
    );
    expect(() => parsePlanCsv('a,"b\n'), throwsA(isA<CsvRejected>()));
    expect(() => decodeCsv(utf8.encode('')), throwsA(isA<CsvRejected>()));
    expect(() => decodeCsv(Uint8List.fromList([0x50, 0x4B, 0x03, 0x04, 1])), throwsA(isA<CsvRejected>()));
    expect(() => decodeCsv(Uint8List.fromList([0xC3, 0x28])), throwsA(isA<CsvRejected>()));
    expect(decodeCsv(Uint8List.fromList([0xEF, 0xBB, 0xBF, 0x61])), 'a');
  });
}
