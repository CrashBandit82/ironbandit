import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

/// Schema of the local database. Bump [schemaVersion] and add a step to
/// [_migrate] for every change.
const schemaVersion = 1;

const _schemaV1 = [
  '''CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )''',
  // note: the user's lasting note for the exercise ("seat level 4")
  '''CREATE TABLE exercises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    equipment TEXT,
    muscle_group TEXT,
    is_cardio INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    use_count INTEGER NOT NULL DEFAULT 0
  )''',
  // exercise_name is kept, so the history survives deleting the exercise
  '''CREATE TABLE logs (
    id INTEGER PRIMARY KEY,
    day TEXT NOT NULL,
    exercise_id INTEGER REFERENCES exercises (id) ON DELETE SET NULL,
    exercise_name TEXT NOT NULL,
    duration_min REAL,
    distance_km REAL,
    created_at TEXT NOT NULL
  )''',
  'CREATE INDEX logs_day ON logs (day)',
  'CREATE INDEX logs_exercise ON logs (exercise_id)',
  '''CREATE TABLE sets (
    id INTEGER PRIMARY KEY,
    log_id INTEGER NOT NULL REFERENCES logs (id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL
  )''',
  'CREATE INDEX sets_log ON sets (log_id)',
  // a plan is only exercises and their order; numbers exist only on sets
  '''CREATE TABLE templates (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  )''',
  '''CREATE TABLE template_items (
    id INTEGER PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates (id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    notes TEXT
  )''',
  // one workout from "start plan" to "finish"; finished_at NULL while running
  '''CREATE TABLE workouts (
    id INTEGER PRIMARY KEY,
    name TEXT,
    day TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_sec INTEGER
  )''',
  '''CREATE TABLE workout_entries (
    id INTEGER PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    log_id INTEGER NOT NULL REFERENCES logs (id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )''',
  '''CREATE TABLE weights (
    id INTEGER PRIMARY KEY,
    day TEXT NOT NULL UNIQUE,
    kg REAL NOT NULL
  )''',
];

/// Opens (and creates or migrates) the app database in the app's private
/// directory.
Future<Database> openAppDatabase() async {
  final dir = await getApplicationSupportDirectory();
  return prepare(sqlite3.open('${dir.path}/ironbandit.db'));
}

/// Enables foreign keys and brings the schema to [schemaVersion].
Database prepare(Database db) {
  db.execute('PRAGMA foreign_keys = ON');
  _migrate(db);
  return db;
}

void _migrate(Database db) {
  final from = db.userVersion;
  if (from == schemaVersion) return;
  db.execute('BEGIN');
  try {
    if (from < 1) _schemaV1.forEach(db.execute);
    db.userVersion = schemaVersion;
    db.execute('COMMIT');
  } on Object {
    db.execute('ROLLBACK');
    rethrow;
  }
}
