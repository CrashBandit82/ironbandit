import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:sqlite3/sqlite3.dart';

import 'db.dart';
import 'history_csv.dart';
import 'models.dart';
import 'plan_csv.dart';

/// Error of a backup or CSV import; [status] 422 = invalid, 426 = from a newer app.
class ApiException implements Exception {
  ApiException(this.status, [this.detail]);

  final int status;
  final String? detail;

  @override
  String toString() => 'ApiException($status, $detail)';
}

const backupFormat = 'ironbandit-backup';
const backupVersion = 1;

/// A running workout older than this counts as abandoned.
const workoutMaxAge = Duration(hours: 12);

/// Starter exercises (name de, name en, category, equipment, cardio), added
/// once to an empty database in the device language.
const _defaultExercises = [
  ('Bankdrücken', 'Bench Press', 'Push', 'Barbell', false),
  ('Schulterdrücken', 'Overhead Press', 'Push', 'Barbell', false),
  ('Liegestütze', 'Push-ups', 'Push', 'Bodyweight', false),
  ('Dips', 'Dips', 'Push', 'Bodyweight', false),
  ('Trizeps-Pushdown', 'Triceps Pushdown', 'Push', 'Machine', false),
  ('Klimmzüge', 'Pull-ups', 'Pull', 'Bodyweight', false),
  ('Latzug', 'Lat Pulldown', 'Pull', 'Machine', false),
  ('Rudern vorgebeugt', 'Bent-over Row', 'Pull', 'Barbell', false),
  ('Kreuzheben', 'Deadlift', 'Pull', 'Barbell', false),
  ('Bizeps-Curls', 'Biceps Curls', 'Pull', 'Dumbbell', false),
  ('Kniebeugen', 'Squats', 'Legs', 'Barbell', false),
  ('Beinpresse', 'Leg Press', 'Legs', 'Machine', false),
  ('Ausfallschritte', 'Lunges', 'Legs', 'Dumbbell', false),
  ('Wadenheben', 'Calf Raises', 'Legs', 'Machine', false),
  ('Rumänisches Kreuzheben', 'Romanian Deadlift', 'Legs', 'Barbell', false),
  ('Plank', 'Plank', 'Core', 'Bodyweight', false),
  ('Crunches', 'Crunches', 'Core', 'Bodyweight', false),
  ('Russian Twists', 'Russian Twists', 'Core', 'Bodyweight', false),
  ('Laufen', 'Running', 'Cardio', null, true),
  ('Radfahren', 'Cycling', 'Cardio', null, true),
  ('Rudergerät', 'Rowing Machine', 'Cardio', 'Machine', true),
  ('Springseil', 'Jump Rope', 'Cardio', 'Bodyweight', true),
];

const _equipmentDe = {
  'Barbell': 'Langhantel',
  'Dumbbell': 'Kurzhantel',
  'Bodyweight': 'Körpergewicht',
  'Machine': 'Maschine',
};

/// Lower case without accents, for searching ("Rudergerat" finds "Rudergerät").
String foldText(String s) {
  const from = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿß';
  const to = 'aaaaaaceeeeiiiinooooouuuuyys';
  final b = StringBuffer();
  for (final ch in s.toLowerCase().split('')) {
    final i = from.indexOf(ch);
    b.write(i < 0 ? ch : to[i]);
  }
  return b.toString();
}

/// All data of the app, stored on this device. Nothing goes over the network.
///
/// Methods are async so the UI does not care where the data comes from.
class Api {
  Api(this._db, {this.filesDir, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final Database _db;

  /// Private app directory for the profile picture.
  final String? filesDir;
  final DateTime Function() _clock;

  static String date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static DateTime _day(String s) {
    final p = s.split('-').map(int.parse).toList();
    return DateTime(p[0], p[1], p[2]);
  }

  DateTime get _today {
    final n = _clock();
    return DateTime(n.year, n.month, n.day);
  }

  static double _round(double v) => (v * 10).round() / 10;

  static double? _dn(Object? v) => (v as num?)?.toDouble();

  static String? _clean(String? s) => s == null || s.trim().isEmpty ? null : s.trim();

  void _transaction(void Function() body) {
    _db.execute('BEGIN');
    try {
      body();
      _db.execute('COMMIT');
    } on Object {
      _db.execute('ROLLBACK');
      rethrow;
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────

  String? _setting(String key) {
    final r = _db.select('SELECT value FROM settings WHERE key = ?', [key]);
    return r.isEmpty ? null : r.first['value'] as String;
  }

  void _setSetting(String key, String? value) {
    if (value == null) {
      _db.execute('DELETE FROM settings WHERE key = ?', [key]);
    } else {
      _db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  Future<Settings> settings() async => Settings(
    weeklyGoal: int.tryParse(_setting('weekly_goal') ?? '') ?? 4,
    restSeconds: int.tryParse(_setting('rest_seconds') ?? '') ?? 90,
    restNotify: _setting('rest_notify') != '0',
  );

  Future<void> setWeeklyGoal(int goal) async => _setSetting('weekly_goal', '${goal.clamp(1, 14)}');

  Future<void> setRestSeconds(int seconds) async => _setSetting('rest_seconds', '${seconds.clamp(15, 600)}');

  Future<void> setRestNotify(bool on) async => _setSetting('rest_notify', on ? '1' : '0');

  /// Theme of this device: "system", "light" or "dark".
  String get themeMode => _setting('theme') ?? 'system';

  // ── Profile ────────────────────────────────────────────────────────────

  Future<Profile> profile() async {
    final avatar = _setting('avatar');
    return Profile(
      name: _setting('username') ?? '',
      avatarPath: avatar == null || filesDir == null ? null : '$filesDir/$avatar',
    );
  }

  Future<Profile> setName(String name) async {
    _setSetting('username', name.trim().isEmpty ? null : name.trim());
    return profile();
  }

  /// Stores the picture under a new name, so image caches never show the old one.
  Future<Profile> setAvatar(Uint8List bytes, String extension) async {
    final name = 'avatar-${_clock().millisecondsSinceEpoch}.$extension';
    await File('$filesDir/$name').writeAsBytes(bytes, flush: true);
    final old = _setting('avatar');
    _setSetting('avatar', name);
    if (old != null) await _deleteFile(old);
    return profile();
  }

  Future<Profile> deleteAvatar() async {
    final old = _setting('avatar');
    _setSetting('avatar', null);
    if (old != null) await _deleteFile(old);
    return profile();
  }

  Future<void> _deleteFile(String name) async {
    try {
      await File('$filesDir/$name').delete();
    } on FileSystemException {
      // already gone
    }
  }

  Future<void> setThemeMode(String mode) async => _setSetting('theme', mode);

  /// Adds the starter exercises once (not again after the user deleted them).
  void seedExercises({required bool german}) {
    if (_setting('seeded') != null) return;
    _transaction(() {
      if (_db.select('SELECT 1 FROM exercises LIMIT 1').isEmpty) {
        for (final (de, en, category, equipment, cardio) in _defaultExercises) {
          _db.execute('INSERT INTO exercises (name, category, equipment, is_cardio) VALUES (?, ?, ?, ?)', [
            german ? de : en,
            category,
            german ? _equipmentDe[equipment] : equipment,
            cardio ? 1 : 0,
          ]);
        }
      }
      _setSetting('seeded', '1');
    });
  }

  // ── Exercises ──────────────────────────────────────────────────────────

  static Exercise _exercise(Row r) => Exercise(
    id: r['id'] as int,
    name: r['name'] as String,
    category: r['category'] as String?,
    equipment: r['equipment'] as String?,
    muscleGroup: r['muscle_group'] as String?,
    isCardio: r['is_cardio'] == 1,
    note: r['note'] as String?,
    useCount: r['use_count'] as int,
  );

  /// Most used first, then by name.
  Future<List<Exercise>> exercises() async =>
      _db.select('SELECT * FROM exercises ORDER BY use_count DESC, name COLLATE NOCASE').map(_exercise).toList();

  Exercise _exerciseById(int id) {
    final r = _db.select('SELECT * FROM exercises WHERE id = ?', [id]);
    if (r.isEmpty) throw ApiException(404);
    return _exercise(r.first);
  }

  Future<Exercise> exercise(int id) async => _exerciseById(id);

  /// Throws [ApiException] 409 when another exercise has the same name.
  void _checkName(String name, int? id) {
    final r = _db.select('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id IS NOT ?', [name, id]);
    if (r.isNotEmpty) throw ApiException(409);
  }

  Future<Exercise> createExercise(ExerciseInput e) async {
    final name = e.name.trim();
    _checkName(name, null);
    _db.execute('INSERT INTO exercises (name, category, equipment, muscle_group, is_cardio) VALUES (?, ?, ?, ?, ?)', [
      name,
      e.category,
      _clean(e.equipment),
      _clean(e.muscleGroup),
      e.isCardio ? 1 : 0,
    ]);
    return _exerciseById(_db.lastInsertRowId);
  }

  /// Renaming also renames the exercise in the history.
  Future<Exercise> updateExercise(int id, ExerciseInput e) async {
    final name = e.name.trim();
    _checkName(name, id);
    _transaction(() {
      _db.execute(
        'UPDATE exercises SET name = ?, category = ?, equipment = ?, muscle_group = ?, is_cardio = ? WHERE id = ?',
        [name, e.category, _clean(e.equipment), _clean(e.muscleGroup), e.isCardio ? 1 : 0, id],
      );
      _db.execute('UPDATE logs SET exercise_name = ? WHERE exercise_id = ?', [name, id]);
    });
    return _exerciseById(id);
  }

  /// Number of plans the exercise is in (shown before deleting).
  Future<int> plansWithExercise(int id) async =>
      _db.select('SELECT COUNT(DISTINCT template_id) n FROM template_items WHERE exercise_id = ?', [id]).first['n']
          as int;

  /// Removes the exercise from plans; the history keeps its name.
  Future<void> deleteExercise(int id) async => _db.execute('DELETE FROM exercises WHERE id = ?', [id]);

  /// Empty text removes the note.
  Future<void> setExerciseNote(int id, String note) async =>
      _db.execute('UPDATE exercises SET note = ? WHERE id = ?', [_clean(note), id]);

  /// Sets of the last earlier training of the exercise, as a hint while logging.
  Future<LastSets> lastSets(int exerciseId, {int? excludeLogId}) async {
    final r = _db.select(
      'SELECT l.id, l.day FROM logs l WHERE l.exercise_id = ? AND l.id IS NOT ? '
      'AND EXISTS (SELECT 1 FROM sets s WHERE s.log_id = l.id) ORDER BY l.day DESC, l.created_at DESC, l.id DESC LIMIT 1',
      [exerciseId, excludeLogId],
    );
    if (r.isEmpty) return const LastSets(null, []);
    return LastSets(_day(r.first['day'] as String), _sets(r.first['id'] as int));
  }

  // ── Logs and sets ──────────────────────────────────────────────────────

  List<WorkoutSet> _sets(int logId) => [
    for (final s in _db.select('SELECT * FROM sets WHERE log_id = ? ORDER BY set_number', [logId]))
      WorkoutSet(
        id: s['id'] as int,
        setNumber: s['set_number'] as int,
        reps: s['reps'] as int,
        weightKg: _dn(s['weight_kg']),
      ),
  ];

  LogEntry _logFromRow(Row r) => LogEntry(
    id: r['id'] as int,
    day: _day(r['day'] as String),
    exerciseId: r['exercise_id'] as int?,
    exerciseName: r['exercise_name'] as String,
    isCardio: r['is_cardio'] == 1,
    durationMin: _dn(r['duration_min']),
    distanceKm: _dn(r['distance_km']),
    sets: _sets(r['id'] as int),
  );

  static const _logSelect =
      'SELECT l.*, COALESCE(e.is_cardio, 0) is_cardio FROM logs l LEFT JOIN exercises e ON e.id = l.exercise_id';

  Future<LogEntry> log(int id) async {
    final r = _db.select('$_logSelect WHERE l.id = ?', [id]);
    if (r.isEmpty) throw ApiException(404);
    return _logFromRow(r.first);
  }

  /// Entries of a day in the order they were added.
  Future<List<LogEntry>> logs(DateTime day) async =>
      _db.select('$_logSelect WHERE l.day = ? ORDER BY l.id', [date(day)]).map(_logFromRow).toList();

  Future<DayTotals> totals(DateTime day) async {
    final logs = await this.logs(day);
    return DayTotals(
      entries: logs.length,
      sets: logs.fold(0, (n, l) => n + l.sets.length),
      volumeKg: _round(logs.fold(0.0, (v, l) => v + l.volume)),
      durationMin: _round(logs.fold(0.0, (v, l) => v + (l.durationMin ?? 0))),
    );
  }

  int _insertLog(Exercise e, DateTime day) {
    _db.execute('INSERT INTO logs (day, exercise_id, exercise_name, created_at) VALUES (?, ?, ?, ?)', [
      date(day),
      e.id,
      e.name,
      _clock().toUtc().toIso8601String(),
    ]);
    final id = _db.lastInsertRowId;
    _db.execute('UPDATE exercises SET use_count = use_count + 1 WHERE id = ?', [e.id]);
    return id;
  }

  /// New empty entry; on today it joins the running workout.
  Future<LogEntry> addLog(int exerciseId, DateTime day) async {
    final e = _exerciseById(exerciseId);
    late int id;
    _transaction(() {
      id = _insertLog(e, day);
      final w = _activeWorkoutId();
      if (w != null && date(day) == date(_today)) _addEntry(w, id);
    });
    return log(id);
  }

  Future<void> deleteLog(int id) async => _db.execute('DELETE FROM logs WHERE id = ?', [id]);

  Future<LogEntry> setCardio(int logId, double? durationMin, double? distanceKm) async {
    _db.execute('UPDATE logs SET duration_min = ?, distance_km = ? WHERE id = ?', [durationMin, distanceKm, logId]);
    return log(logId);
  }

  Future<LogEntry> addSet(int logId, int reps, double? weightKg) async {
    _db.execute(
      'INSERT INTO sets (log_id, set_number, reps, weight_kg) '
      'VALUES (?, (SELECT COALESCE(MAX(set_number), 0) + 1 FROM sets WHERE log_id = ?), ?, ?)',
      [logId, logId, reps, weightKg],
    );
    return log(logId);
  }

  Future<LogEntry> updateSet(int logId, int setId, int reps, double? weightKg) async {
    _db.execute('UPDATE sets SET reps = ?, weight_kg = ? WHERE id = ? AND log_id = ?', [reps, weightKg, setId, logId]);
    return log(logId);
  }

  /// The following sets move up, so the numbers stay 1, 2, 3 …
  Future<LogEntry> deleteSet(int logId, int setId) async {
    _transaction(() {
      _db.execute('DELETE FROM sets WHERE id = ? AND log_id = ?', [setId, logId]);
      final ids = _db.select('SELECT id FROM sets WHERE log_id = ? ORDER BY set_number', [logId]);
      for (final (i, r) in ids.indexed) {
        _db.execute('UPDATE sets SET set_number = ? WHERE id = ?', [i + 1, r['id']]);
      }
    });
    return log(logId);
  }

  // ── Plans ──────────────────────────────────────────────────────────────

  Future<List<Plan>> plans() async => [
    for (final t in _db.select('SELECT * FROM templates ORDER BY name COLLATE NOCASE'))
      Plan(
        id: t['id'] as int,
        name: t['name'] as String,
        items: [
          for (final r in _db.select(
            'SELECT e.*, i.notes item_notes FROM template_items i JOIN exercises e ON e.id = i.exercise_id '
            'WHERE i.template_id = ? ORDER BY i.position',
            [t['id']],
          ))
            PlanItem(exercise: _exercise(r), notes: r['item_notes'] as String?),
        ],
      ),
  ];

  /// [items] = (exercise id, notes) in order. Returns the plan id.
  Future<int> savePlan(int? id, String name, List<(int, String?)> items) async {
    var planId = id;
    _transaction(() {
      if (planId == null) {
        _db.execute('INSERT INTO templates (name) VALUES (?)', [name.trim()]);
        planId = _db.lastInsertRowId;
      } else {
        _db.execute('UPDATE templates SET name = ? WHERE id = ?', [name.trim(), planId]);
        _db.execute('DELETE FROM template_items WHERE template_id = ?', [planId]);
      }
      for (final (i, (exerciseId, notes)) in items.indexed) {
        _db.execute('INSERT INTO template_items (template_id, exercise_id, position, notes) VALUES (?, ?, ?, ?)', [
          planId,
          exerciseId,
          i + 1,
          _clean(notes),
        ]);
      }
    });
    return planId!;
  }

  Future<void> deletePlan(int id) async => _db.execute('DELETE FROM templates WHERE id = ?', [id]);

  // ── Workouts ───────────────────────────────────────────────────────────

  String _now() => _clock().toUtc().toIso8601String();

  int? _activeWorkoutId() {
    final r = _db.select(
      'SELECT id FROM workouts WHERE finished_at IS NULL AND started_at >= ? ORDER BY started_at DESC LIMIT 1',
      [_clock().subtract(workoutMaxAge).toUtc().toIso8601String()],
    );
    return r.isEmpty ? null : r.first['id'] as int;
  }

  void _addEntry(int workoutId, int logId) => _db.execute(
    'INSERT INTO workout_entries (workout_id, log_id, position) '
    'VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM workout_entries WHERE workout_id = ?))',
    [workoutId, logId, workoutId],
  );

  Workout _workout(Row w) => Workout(
    id: w['id'] as int,
    name: w['name'] as String?,
    startedAt: DateTime.parse(w['started_at'] as String).toLocal(),
    finishedAt: w['finished_at'] == null ? null : DateTime.parse(w['finished_at'] as String).toLocal(),
    durationSec: w['duration_sec'] as int?,
    entries: [
      for (final r in _db.select(
        'SELECT l.*, COALESCE(e.is_cardio, 0) is_cardio, we.done FROM workout_entries we JOIN logs l ON l.id = we.log_id '
        'LEFT JOIN exercises e ON e.id = l.exercise_id WHERE we.workout_id = ? ORDER BY we.position',
        [w['id']],
      ))
        WorkoutEntry(log: _logFromRow(r), done: r['done'] == 1),
    ],
  );

  /// The running workout, null when none is running.
  Future<Workout?> activeWorkout() async {
    final id = _activeWorkoutId();
    if (id == null) return null;
    return _workout(_db.select('SELECT * FROM workouts WHERE id = ?', [id]).first);
  }

  /// Creates one empty entry per plan exercise for today; values are only
  /// logged live during the workout. A second plan joins the running workout.
  Future<Workout> startPlan(int planId) async {
    final t = _db.select('SELECT name FROM templates WHERE id = ?', [planId]);
    if (t.isEmpty) throw ApiException(404);
    final name = t.first['name'] as String;
    _transaction(() {
      var w = _activeWorkoutId();
      if (w == null) {
        _db.execute('INSERT INTO workouts (name, day, started_at) VALUES (?, ?, ?)', [name, date(_today), _now()]);
        w = _db.lastInsertRowId;
      } else {
        final old = _db.select('SELECT name FROM workouts WHERE id = ?', [w]).first['name'] as String?;
        if (old != null && !old.split(' + ').contains(name)) {
          _db.execute('UPDATE workouts SET name = ? WHERE id = ?', ['$old + $name', w]);
        }
      }
      for (final r in _db.select(
        'SELECT e.* FROM template_items i JOIN exercises e ON e.id = i.exercise_id WHERE i.template_id = ? ORDER BY i.position',
        [planId],
      )) {
        _addEntry(w, _insertLog(_exercise(r), _today));
      }
    });
    return (await activeWorkout())!;
  }

  Future<void> setEntryDone(int workoutId, int logId, bool done) async => _db.execute(
    'UPDATE workout_entries SET done = ? WHERE workout_id = ? AND log_id = ?',
    [done ? 1 : 0, workoutId, logId],
  );

  /// Stores the duration. Finishing twice changes nothing.
  Future<Workout> finishWorkout(int id) async {
    final r = _db.select('SELECT * FROM workouts WHERE id = ?', [id]);
    if (r.isEmpty) throw ApiException(404);
    if (r.first['finished_at'] == null) {
      final started = DateTime.parse(r.first['started_at'] as String);
      final now = _clock().toUtc();
      _db.execute('UPDATE workouts SET finished_at = ?, duration_sec = ? WHERE id = ?', [
        now.toIso8601String(),
        now.difference(started).inSeconds.clamp(0, 1 << 31),
        id,
      ]);
    }
    return _workout(_db.select('SELECT * FROM workouts WHERE id = ?', [id]).first);
  }

  /// Drops the workout and its exercises that got no values; logged sets stay.
  /// Returns the number of removed empty exercises.
  Future<int> cancelWorkout(int id) async {
    var removed = 0;
    _transaction(() {
      for (final r in _db.select(
        'SELECT l.id FROM workout_entries we JOIN logs l ON l.id = we.log_id WHERE we.workout_id = ? '
        'AND l.duration_min IS NULL AND l.distance_km IS NULL AND NOT EXISTS (SELECT 1 FROM sets s WHERE s.log_id = l.id)',
        [id],
      )) {
        _db.execute('DELETE FROM logs WHERE id = ?', [r['id']]);
        removed++;
      }
      _db.execute('DELETE FROM workouts WHERE id = ?', [id]);
    });
    return removed;
  }

  /// Finished workouts of a day (for their duration).
  Future<List<Workout>> workouts(DateTime day) async => _db
      .select('SELECT * FROM workouts WHERE day = ? AND finished_at IS NOT NULL ORDER BY started_at', [date(day)])
      .map(_workout)
      .toList();

  // ── Statistics ─────────────────────────────────────────────────────────

  double _volumeBetween(DateTime from, DateTime to) => _round(
    _dn(
      _db.select(
        'SELECT COALESCE(SUM(s.reps * s.weight_kg), 0) v FROM sets s JOIN logs l ON l.id = s.log_id '
        'WHERE l.day BETWEEN ? AND ? AND s.weight_kg IS NOT NULL',
        [date(from), date(to)],
      ).first['v'],
    )!,
  );

  Set<String> _trainedDays(DateTime from, DateTime to) => {
    for (final r in _db.select(
      'SELECT DISTINCT l.day FROM logs l WHERE l.day BETWEEN ? AND ? AND (l.duration_min IS NOT NULL '
      'OR l.distance_km IS NOT NULL OR EXISTS (SELECT 1 FROM sets s WHERE s.log_id = l.id))',
      [date(from), date(to)],
    ))
      r['day'] as String,
  };

  /// This week (Monday to Sunday) against the same days of last week. A day
  /// with any logged
  /// value is one workout.
  Future<WeekStats> week() async {
    final start = _today.subtract(Duration(days: _today.weekday - 1));
    final end = start.add(const Duration(days: 6));
    final prevStart = start.subtract(const Duration(days: 7));
    // same days of last week, so a week in progress is not compared with a full one
    final prevEnd = prevStart.add(Duration(days: _today.weekday - 1));
    final trained = _trainedDays(start, end);
    return WeekStats(
      days: [
        for (var i = 0; i < 7; i++)
          WeekDay(
            DateTime(start.year, start.month, start.day + i),
            trained.contains(date(DateTime(start.year, start.month, start.day + i))),
          ),
      ],
      sessions: trained.length,
      goal: (await settings()).weeklyGoal,
      volumeKg: _volumeBetween(start, end),
      prevVolumeKg: _volumeBetween(prevStart, prevEnd),
      prevSessions: _trainedDays(prevStart, prevEnd).length,
    );
  }

  static const stagnationMinSessions = 3;
  static const stagnationWindow = 4;

  /// Exercises whose last sessions show progress in no way: neither more
  /// weight, nor more reps, nor more volume. Longest first.
  Future<List<Stagnation>> stagnating() async {
    final byExercise = <int, (String, List<(DateTime, double?, int, double)>)>{};
    for (final r in _db.select(
      'SELECT l.id, l.day, l.exercise_id, l.exercise_name FROM logs l WHERE l.exercise_id IS NOT NULL '
      'ORDER BY l.day, l.created_at, l.id',
    )) {
      final sets = _sets(r['id'] as int);
      if (sets.isEmpty) continue;
      final weights = sets.map((s) => s.weightKg).whereType<double>();
      final entry = (
        _day(r['day'] as String),
        weights.isEmpty ? null : weights.reduce((a, b) => a > b ? a : b),
        sets.fold(0, (n, s) => n + s.reps),
        _round(sets.fold(0.0, (v, s) => v + s.reps * (s.weightKg ?? 0))),
      );
      final g = byExercise.putIfAbsent(r['exercise_id'] as int, () => (r['exercise_name'] as String, []));
      g.$2.add(entry);
    }
    bool improved(List<num?> series) {
      final base = series.first;
      return base != null && series.skip(1).any((v) => v != null && v > base);
    }

    final result = <Stagnation>[];
    for (final (name, sessions) in byExercise.values) {
      final window = sessions.length > stagnationWindow
          ? sessions.sublist(sessions.length - stagnationWindow)
          : sessions;
      if (window.length < stagnationMinSessions) continue;
      final weight = [for (final w in window) w.$2];
      final reps = [for (final w in window) w.$3];
      final volume = [for (final w in window) w.$4];
      if (improved(weight) || improved(reps) || improved(volume)) continue;
      final byWeight = weight.every((w) => w != null);
      final days = window.last.$1.difference(window.first.$1).inDays;
      result.add(
        Stagnation(
          exerciseName: name,
          sessions: window.length,
          weeks: days > 0 ? (days / 7).round().clamp(1, 1 << 20) : 1,
          byWeight: byWeight,
          value: byWeight ? weight.last! : volume.last,
        ),
      );
    }
    result.sort((a, b) => b.weeks.compareTo(a.weeks));
    return result;
  }

  // ── Weight ─────────────────────────────────────────────────────────────

  Future<WeightHistory> weightHistory({int days = 90}) async {
    final entries = [
      for (final r in _db.select('SELECT * FROM weights WHERE day >= ? ORDER BY day', [
        date(_today.subtract(Duration(days: days))),
      ]))
        WeightEntry(r['id'] as int, _dn(r['kg'])!, _day(r['day'] as String)),
    ];
    double? trend;
    final weekAgo = _today.subtract(const Duration(days: 7));
    final recent = entries.where((e) => !e.date.isBefore(weekAgo)).toList();
    final older = entries.where((e) => e.date.isBefore(weekAgo)).toList();
    if (recent.isNotEmpty && older.isNotEmpty) trend = _round(recent.last.kg - older.last.kg);
    return WeightHistory(
      entries: entries,
      latest: entries.isEmpty ? null : entries.last.kg,
      start: entries.isEmpty ? null : entries.first.kg,
      trend: trend,
    );
  }

  /// One value per day: a second entry on the same day replaces the first.
  Future<void> logWeight(double kg, {DateTime? day}) async => _db.execute(
    'INSERT INTO weights (day, kg) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET kg = excluded.kg',
    [date(day ?? _today), kg],
  );

  Future<void> updateWeight(int id, double kg) async => _db.execute('UPDATE weights SET kg = ? WHERE id = ?', [kg, id]);

  Future<void> deleteWeight(int id) async => _db.execute('DELETE FROM weights WHERE id = ?', [id]);

  // ── Plan CSV ───────────────────────────────────────────────────────────

  Future<String> exportPlansCsv() async => writePlanCsv([
    for (final p in await plans())
      (p.name, [for (final (i, item) in p.items.indexed) (item.exercise.name, i + 1, item.notes)]),
  ]);

  /// Names of the exercises in [csv] that don't exist yet (created on import).
  Future<Set<String>> unknownExercises(ParsedCsv csv) async {
    final known = {for (final r in _db.select('SELECT name FROM exercises')) (r['name'] as String).toLowerCase()};
    return {
      for (final p in csv.plans)
        for (final r in p.rows)
          if (!known.contains(r.exerciseName.toLowerCase())) r.exerciseName,
    };
  }

  /// Names of plans in [csv] that exist already.
  Future<Set<String>> existingPlans(ParsedCsv csv) async {
    final names = {for (final r in _db.select('SELECT name FROM templates')) (r['name'] as String).toLowerCase()};
    return {
      for (final p in csv.plans)
        if (names.contains(p.name.toLowerCase())) p.name,
    };
  }

  /// Creates every plan of [csv] (all or nothing); unknown exercises are created.
  Future<int> importPlans(ParsedCsv csv) async {
    _transaction(() {
      final ids = {
        for (final r in _db.select('SELECT id, name FROM exercises ORDER BY id DESC'))
          (r['name'] as String).toLowerCase(): r['id'] as int,
      };
      for (final p in csv.plans) {
        _db.execute('INSERT INTO templates (name) VALUES (?)', [p.name]);
        final planId = _db.lastInsertRowId;
        for (final (i, row) in p.rows.indexed) {
          var exerciseId = ids[row.exerciseName.toLowerCase()];
          if (exerciseId == null) {
            _db.execute('INSERT INTO exercises (name) VALUES (?)', [row.exerciseName]);
            exerciseId = ids[row.exerciseName.toLowerCase()] = _db.lastInsertRowId;
          }
          _db.execute('INSERT INTO template_items (template_id, exercise_id, position, notes) VALUES (?, ?, ?, ?)', [
            planId,
            exerciseId,
            i + 1,
            _clean(row.notes),
          ]);
        }
      }
    });
    return csv.plans.length;
  }

  // ── Export / backup ────────────────────────────────────────────────────

  static String _csv(Object? v) {
    var s = '${v ?? ''}';
    // no formulas when opened in a spreadsheet
    if (s.isNotEmpty && '=+-@'.contains(s[0]) && double.tryParse(s) == null) s = "'$s";
    return RegExp(r'[",\n\r]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;
  }

  /// Training history (one line per set) and body weight as CSV.
  Future<Uint8List> exportCsv({required bool german}) async {
    final lines = <List<Object?>>[
      [german ? '=== TRAINING ===' : '=== TRAINING ==='],
      german
          ? ['Datum', 'Übung', 'Satz', 'Wiederholungen', 'Gewicht (kg)', 'Dauer (min)', 'Distanz (km)']
          : ['Date', 'Exercise', 'Set', 'Reps', 'Weight (kg)', 'Duration (min)', 'Distance (km)'],
      for (final r in _db.select(
        'SELECT l.day, l.exercise_name, s.set_number, s.reps, s.weight_kg, l.duration_min, l.distance_km '
        'FROM logs l LEFT JOIN sets s ON s.log_id = l.id ORDER BY l.day DESC, l.id, s.set_number',
      ))
        [r['day'], r['exercise_name'], r['set_number'], r['reps'], r['weight_kg'], r['duration_min'], r['distance_km']],
      [],
      [german ? '=== KÖRPERGEWICHT ===' : '=== BODY WEIGHT ==='],
      german ? ['Datum', 'Gewicht (kg)'] : ['Date', 'Weight (kg)'],
      for (final r in _db.select('SELECT * FROM weights ORDER BY day DESC')) [r['day'], r['kg']],
    ];
    return utf8.encode(lines.map((l) => l.map(_csv).join(',')).join('\r\n'));
  }

  /// Adds the history of a CSV export (web app or this app) to the data.
  /// Days that already have an entry for an exercise are skipped, so a second
  /// import adds nothing twice; missing exercises are created. Throws
  /// [ApiException] 422 when the file is no such export.
  Future<HistoryImport> importHistoryCsv(Uint8List bytes) async {
    final String text;
    try {
      text = decodeCsv(bytes);
    } on CsvRejected {
      throw ApiException(422);
    }
    final parsed = parseHistoryCsv(text);
    if (parsed == null) throw ApiException(422);
    var logs = 0, sets = 0, weights = 0, skipped = 0, created = 0;
    _transaction(() {
      final ids = {
        for (final r in _db.select('SELECT id, name FROM exercises ORDER BY id DESC'))
          (r['name'] as String).toLowerCase(): r['id'] as int,
      };
      final existing = {
        for (final r in _db.select('SELECT day, exercise_name FROM logs'))
          '${r['day']}|${(r['exercise_name'] as String).toLowerCase()}',
      };
      final ordered = [...parsed.logs.indexed]
        ..sort((a, b) {
          final c = a.$2.day.compareTo(b.$2.day);
          return c != 0 ? c : a.$1.compareTo(b.$1);
        });
      for (final (_, l) in ordered) {
        final key = '${date(l.day)}|${l.exerciseName.toLowerCase()}';
        if (existing.contains(key)) {
          skipped++;
          continue;
        }
        var exerciseId = ids[l.exerciseName.toLowerCase()];
        if (exerciseId == null) {
          final cardio = parsed.logs.where((x) => x.exerciseName == l.exerciseName).every((x) => x.sets.isEmpty);
          _db.execute('INSERT INTO exercises (name, category, is_cardio) VALUES (?, ?, ?)', [
            l.exerciseName,
            cardio ? 'Cardio' : null,
            cardio ? 1 : 0,
          ]);
          exerciseId = ids[l.exerciseName.toLowerCase()] = _db.lastInsertRowId;
          created++;
        }
        _db.execute(
          'INSERT INTO logs (day, exercise_id, exercise_name, duration_min, distance_km, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [date(l.day), exerciseId, l.exerciseName, l.durationMin, l.distanceKm, _now()],
        );
        final logId = _db.lastInsertRowId;
        for (final (i, (reps, kg)) in l.sets.indexed) {
          _db.execute('INSERT INTO sets (log_id, set_number, reps, weight_kg) VALUES (?, ?, ?, ?)', [
            logId,
            i + 1,
            reps,
            kg,
          ]);
        }
        _db.execute('UPDATE exercises SET use_count = use_count + 1 WHERE id = ?', [exerciseId]);
        logs++;
        sets += l.sets.length;
      }
      for (final (day, kg) in parsed.weights) {
        _db.execute('INSERT INTO weights (day, kg) VALUES (?, ?) ON CONFLICT (day) DO NOTHING', [date(day), kg]);
        weights += _db.updatedRows;
      }
      final goal = parsed.weeklyGoal;
      if (goal != null && goal > 0) _setSetting('weekly_goal', '${goal.clamp(1, 14)}');
    });
    return HistoryImport(logs: logs, sets: sets, weights: weights, newExercises: created, skipped: skipped);
  }

  /// Parents first; deleting goes in reverse order.
  static const _tables = [
    'settings',
    'exercises',
    'logs',
    'sets',
    'templates',
    'template_items',
    'workouts',
    'workout_entries',
    'weights',
  ];

  /// Settings of this device that a backup neither carries nor replaces
  /// (the profile picture is a file on this device).
  static const _deviceSettings = {'theme', 'avatar'};

  /// Whole database as JSON.
  Future<Uint8List> exportBackup() async {
    final data = <String, Object?>{
      'format': backupFormat,
      'version': backupVersion,
      'schemaVersion': schemaVersion,
      'exportedAt': _clock().toUtc().toIso8601String(),
      for (final t in _tables)
        t: [
          for (final r in _db.select('SELECT * FROM $t ORDER BY 1'))
            if (t != 'settings' || !_deviceSettings.contains(r['key'])) Map<String, Object?>.of(r),
        ],
    };
    return utf8.encode(const JsonEncoder.withIndent(' ').convert(data));
  }

  /// Checks a backup and returns when it was made; throws [ApiException] 422/426.
  DateTime? checkBackup(Uint8List bytes) => _parseBackup(bytes).$2;

  (Map<String, dynamic>, DateTime?) _parseBackup(Uint8List bytes) {
    final Object? json;
    try {
      json = jsonDecode(utf8.decode(bytes));
    } on FormatException {
      throw ApiException(422);
    }
    if (json is! Map<String, dynamic> || json['format'] != backupFormat) throw ApiException(422);
    if ((json['schemaVersion'] as int? ?? 0) > schemaVersion) throw ApiException(426);
    return (json, DateTime.tryParse('${json['exportedAt']}'));
  }

  Map<String, String> _keepDeviceSettings() => {
    for (final k in _deviceSettings)
      if (_setting(k) != null) k: _setting(k)!,
  };

  /// Replaces all data with the backup. All or nothing.
  Future<void> importBackup(Uint8List bytes) async {
    final (json, _) = _parseBackup(bytes);
    final keep = _keepDeviceSettings();
    try {
      _transaction(() {
        for (final t in _tables.reversed) {
          _db.execute('DELETE FROM $t');
        }
        for (final t in _tables) {
          final columns = {for (final r in _db.select('PRAGMA table_info($t)')) r['name'] as String};
          for (final row in ((json[t] as List<dynamic>?) ?? const []).cast<Map<String, dynamic>>()) {
            final keys = row.keys.where(columns.contains).toList();
            if (keys.isEmpty || (t == 'settings' && _deviceSettings.contains(row['key']))) continue;
            _db.execute('INSERT INTO $t (${keys.join(', ')}) VALUES (${List.filled(keys.length, '?').join(', ')})', [
              for (final k in keys) row[k],
            ]);
          }
        }
        keep.forEach(_setSetting);
        if (_db.select('PRAGMA foreign_key_check').isNotEmpty) throw ApiException(422);
      });
    } on SqliteException {
      throw ApiException(422);
    } on TypeError {
      throw ApiException(422);
    }
  }

  /// Deletes everything on this device; the starter exercises come back.
  Future<void> deleteAllData({required bool german}) async {
    await deleteAvatar();
    final keep = _keepDeviceSettings();
    _transaction(() {
      for (final t in _tables.reversed) {
        _db.execute('DELETE FROM $t');
      }
      keep.forEach(_setSetting);
    });
    seedExercises(german: german);
  }
}
