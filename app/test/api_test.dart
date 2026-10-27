import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:ironbandit/data/api.dart';
import 'package:ironbandit/data/db.dart';
import 'package:ironbandit/data/models.dart';
import 'package:ironbandit/data/plan_csv.dart';
import 'package:sqlite3/sqlite3.dart';

void main() {
  late DateTime now;
  late Api api;

  setUp(() {
    now = DateTime(2026, 10, 28, 18); // a Wednesday
    api = Api(prepare(sqlite3.openInMemory()), clock: () => now);
  });

  Future<Exercise> ex(String name, {bool cardio = false}) =>
      api.createExercise(ExerciseInput(name: name, category: cardio ? 'Cardio' : 'Push', isCardio: cardio));

  Future<LogEntry> logSets(Exercise e, DateTime day, List<(int, double?)> sets) async {
    var log = await api.addLog(e.id, day);
    for (final (reps, kg) in sets) {
      log = await api.addSet(log.id, reps, kg);
    }
    return log;
  }

  test('starter exercises are added once, in the device language', () async {
    api.seedExercises(german: true);
    final list = await api.exercises();
    expect(list.map((e) => e.name), contains('Bankdrücken'));
    for (final e in list) {
      await api.deleteExercise(e.id);
    }
    api.seedExercises(german: true);
    expect(await api.exercises(), isEmpty);
  });

  test('exercise names are unique, renaming renames the history', () async {
    final bench = await ex('Bench');
    await expectLater(ex('bench'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 409)));
    await logSets(bench, now, [(8, 60)]);
    await api.updateExercise(bench.id, const ExerciseInput(name: 'Bench Press'));
    expect((await api.logs(now)).single.exerciseName, 'Bench Press');
  });

  test('sets are numbered, deleting renumbers, totals add up', () async {
    final bench = await ex('Bench');
    var log = await logSets(bench, now, [(10, 50), (8, 60), (6, 70)]);
    expect(log.sets.map((s) => s.setNumber), [1, 2, 3]);
    log = await api.deleteSet(log.id, log.sets.first.id);
    expect(log.sets.map((s) => (s.setNumber, s.reps)), [(1, 8), (2, 6)]);
    log = await api.updateSet(log.id, log.sets.last.id, 5, 72.5);
    final run = await api.addLog((await ex('Run', cardio: true)).id, now);
    await api.setCardio(run.id, 30, 5.2);
    final t = await api.totals(now);
    expect((t.entries, t.sets, t.volumeKg, t.durationMin), (2, 2, 842.5, 30.0));
    expect((await api.logs(now)).last.isCardio, isTrue);
  });

  test('deleting an exercise keeps the history and drops it from plans', () async {
    final bench = await ex('Bench');
    final row = await ex('Row');
    await api.savePlan(null, 'Push', [(bench.id, 'slow'), (row.id, null)]);
    await logSets(bench, now, [(5, 100)]);
    expect(await api.plansWithExercise(bench.id), 1);
    await api.deleteExercise(bench.id);
    final log = (await api.logs(now)).single;
    expect((log.exerciseId, log.exerciseName, log.sets.length), (null, 'Bench', 1));
    expect((await api.plans()).single.items.map((i) => i.exercise.name), ['Row']);
  });

  test('last sets come from the latest earlier training', () async {
    final bench = await ex('Bench');
    await logSets(bench, DateTime(2026, 10, 20), [(10, 50)]);
    await logSets(bench, DateTime(2026, 10, 24), [(8, 60), (8, 60)]);
    final today = await api.addLog(bench.id, now);
    final last = await api.lastSets(bench.id, excludeLogId: today.id);
    expect((last.day, last.sets.length), (DateTime(2026, 10, 24), 2));
  });

  test('note per exercise, empty removes it', () async {
    final bench = await ex('Bench');
    await api.setExerciseNote(bench.id, ' seat 4 ');
    expect((await api.exercise(bench.id)).note, 'seat 4');
    await api.setExerciseNote(bench.id, '  ');
    expect((await api.exercise(bench.id)).note, isNull);
  });

  test('workout: start, join, done, finish', () async {
    final bench = await ex('Bench');
    final row = await ex('Row');
    final push = await api.savePlan(null, 'Push', [(bench.id, null)]);
    final pull = await api.savePlan(null, 'Pull', [(row.id, null)]);
    var w = await api.startPlan(push);
    now = now.add(const Duration(minutes: 5));
    w = await api.startPlan(pull);
    expect((w.name, w.entries.length), ('Push + Pull', 2));
    final extra = await api.addLog((await ex('Dips')).id, now);
    w = (await api.activeWorkout())!;
    expect(w.entries.last.log.id, extra.id);
    await api.setEntryDone(w.id, w.entries.first.log.id, true);
    expect((await api.activeWorkout())!.doneCount, 1);
    now = now.add(const Duration(minutes: 40));
    w = await api.finishWorkout(w.id);
    expect(w.durationSec, 45 * 60);
    expect(await api.activeWorkout(), isNull);
    expect((await api.workouts(now)).single.id, w.id);
  });

  test('cancelling a workout removes only empty exercises', () async {
    final bench = await ex('Bench');
    final row = await ex('Row');
    final plan = await api.savePlan(null, 'Full', [(bench.id, null), (row.id, null)]);
    final w = await api.startPlan(plan);
    await api.addSet(w.entries.first.log.id, 5, 80);
    expect(await api.cancelWorkout(w.id), 1);
    expect((await api.logs(now)).single.exerciseName, 'Bench');
    expect(await api.activeWorkout(), isNull);
  });

  test('an old unfinished workout counts as abandoned', () async {
    final plan = await api.savePlan(null, 'P', [((await ex('Bench')).id, null)]);
    await api.startPlan(plan);
    now = now.add(const Duration(hours: 13));
    expect(await api.activeWorkout(), isNull);
  });

  test('week: trained days, goal and volume against last week', () async {
    final bench = await ex('Bench');
    await logSets(bench, DateTime(2026, 10, 20), [(10, 50)]); // last week
    await logSets(bench, DateTime(2026, 10, 26), [(10, 60)]); // Monday
    await logSets(bench, now, [(10, 60)]);
    await api.addLog(bench.id, DateTime(2026, 10, 29)); // empty: not a workout
    await api.setWeeklyGoal(3);
    final w = await api.week();
    expect(w.days.first.date, DateTime(2026, 10, 26));
    expect([for (final d in w.days) d.trained], [true, false, true, false, false, false, false]);
    expect((w.sessions, w.goal, w.volumeKg, w.prevVolumeKg, w.prevSessions), (2, 3, 1200.0, 500.0, 1));
    expect(w.volumeChangePct, 140);
  });

  test('stagnation needs 3 sessions without any progress', () async {
    final bench = await ex('Bench');
    final squat = await ex('Squat');
    for (final (i, d) in [1, 8, 15].indexed) {
      await logSets(bench, DateTime(2026, 10, d), [(8, 80)]);
      await logSets(squat, DateTime(2026, 10, d), [(8 + i, 100)]); // more reps = progress
    }
    final s = await api.stagnating();
    expect(s.map((e) => (e.exerciseName, e.weeks, e.byWeight, e.value)), [('Bench', 2, true, 80.0)]);
  });

  test('weight: one value per day, trend over 7 days', () async {
    await api.logWeight(82, day: DateTime(2026, 10, 18));
    await api.logWeight(81.5);
    await api.logWeight(81.2);
    final h = await api.weightHistory();
    expect((h.entries.length, h.latest, h.start, h.trend), (2, 81.2, 82.0, -0.8));
  });

  test('plan CSV round trip creates missing exercises', () async {
    final bench = await ex('Bench');
    await api.savePlan(null, 'Push', [(bench.id, '=SUM(A1)'), ((await ex('Dips')).id, null)]);
    final csv = await api.exportPlansCsv();
    expect(csv, contains("'=SUM(A1)"));
    await api.deletePlan((await api.plans()).single.id);
    await api.deleteExercise((await api.exercises()).firstWhere((e) => e.name == 'Dips').id);
    final parsed = parsePlanCsv(csv);
    expect(await api.unknownExercises(parsed), {'Dips'});
    expect(await api.importPlans(parsed), 1);
    final plan = (await api.plans()).single;
    expect([for (final i in plan.items) (i.exercise.name, i.notes)], [('Bench', "'=SUM(A1)"), ('Dips', null)]);
  });

  test('backup restores everything and keeps the device theme', () async {
    final bench = await ex('Bench');
    final plan = await api.savePlan(null, 'Push', [(bench.id, null)]);
    final w = await api.startPlan(plan);
    await api.addSet(w.entries.single.log.id, 5, 100);
    await api.logWeight(80);
    await api.setRestSeconds(120);
    await api.setThemeMode('dark');
    final backup = await api.exportBackup();
    expect(utf8.decode(backup), isNot(contains('"theme"')));

    await api.deleteAllData(german: false);
    expect(await api.logs(now), isEmpty);
    expect(api.themeMode, 'dark');
    expect((await api.exercises()).map((e) => e.name), contains('Bench Press'));

    await api.setThemeMode('light');
    await api.importBackup(backup);
    expect((await api.logs(now)).single.sets.single.weightKg, 100);
    expect((await api.activeWorkout())!.entries.length, 1);
    expect((await api.settings()).restSeconds, 120);
    expect(api.themeMode, 'light');
  });

  test('invalid or newer backups are rejected without changes', () async {
    await ex('Bench');
    for (final (bytes, status) in [
      (utf8.encode('nope'), 422),
      (utf8.encode('{"format":"macrobandit-backup"}'), 422),
      (utf8.encode('{"format":"$backupFormat","schemaVersion":${schemaVersion + 1}}'), 426),
      (utf8.encode('{"format":"$backupFormat","sets":[{"id":1,"log_id":99,"set_number":1,"reps":1}]}'), 422),
    ]) {
      await expectLater(
        api.importBackup(bytes),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', status)),
      );
    }
    expect((await api.exercises()).single.name, 'Bench');
  });

  test('CSV export neutralizes formulas', () async {
    await logSets(await ex('=Evil'), now, [(5, 10)]);
    expect(utf8.decode(await api.exportCsv(german: true)), contains("'=Evil"));
  });

  test('history CSV of the web app is imported once', () async {
    await ex('Bankdrücken');
    const web =
        '=== BENUTZERDATEN ===\r\n'
        'Benutzername,E-Mail,Registriert am,Wochenziel (Workouts)\r\n'
        'geri,g@example.org,01.05.2026 10:00,5\r\n'
        '\r\n'
        '=== TRAININGSTAGEBUCH ===\r\n'
        'Datum,Übung,Satz,Wiederholungen,Gewicht (kg),Dauer (min),Distanz (km),Notizen\r\n'
        '27.10.2026,Bankdrücken,1,10,60.0,,,\r\n'
        '27.10.2026,Bankdrücken,2,8,62.5,,,\r\n'
        '27.10.2026,Laufen,,,,30.0,5.2,\r\n'
        "27.10.2026,'=Evil,1,5,,,,\r\n"
        '20.10.2026,Bankdrücken,1,10,57.5,,,\r\n'
        '\r\n'
        '=== GEWICHTSVERLAUF ===\r\n'
        'Datum,Gewicht (kg)\r\n'
        '27.10.2026,81.5\r\n'
        '20.10.2026,82.0\r\n';
    final r = await api.importHistoryCsv(utf8.encode(web));
    expect((r.logs, r.sets, r.weights, r.newExercises, r.skipped), (4, 4, 2, 2, 0));
    final day = await api.logs(DateTime(2026, 10, 27));
    expect(day.map((l) => (l.exerciseName, l.sets.length, l.isCardio)), [
      ('Bankdrücken', 2, false),
      ('Laufen', 0, true),
      ('=Evil', 1, false),
    ]);
    expect(day.first.sets.last.weightKg, 62.5);
    expect((day[1].durationMin, day[1].distanceKm), (30.0, 5.2));
    expect((await api.settings()).weeklyGoal, 5);
    expect((await api.importHistoryCsv(utf8.encode(web))).logs, 0);
    // this app's own export reads back too
    final again = await api.importHistoryCsv(await api.exportCsv(german: false));
    expect((again.logs, again.skipped), (0, 4));
    await expectLater(
      api.importHistoryCsv(utf8.encode('plan_name,exercise_name,order_index\n')),
      throwsA(isA<ApiException>()),
    );
  });

  test('search folding', () {
    expect(foldText('Rudergerät Übung ß'), 'rudergerat ubung s');
  });
}
