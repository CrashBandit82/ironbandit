/// Plain data classes of the app. Days are local dates without time.
library;

const categories = ['Push', 'Pull', 'Legs', 'Core', 'Cardio'];

class Exercise {
  const Exercise({
    required this.id,
    required this.name,
    this.category,
    this.equipment,
    this.muscleGroup,
    this.isCardio = false,
    this.note,
    this.useCount = 0,
  });

  final int id;
  final String name;
  final String? category;
  final String? equipment;
  final String? muscleGroup;
  final bool isCardio;

  /// Lasting note of the user ("seat level 4"), shown at every workout.
  final String? note;
  final int useCount;
}

/// Input for creating or editing an exercise.
class ExerciseInput {
  const ExerciseInput({required this.name, this.category, this.equipment, this.muscleGroup, this.isCardio = false});

  final String name;
  final String? category;
  final String? equipment;
  final String? muscleGroup;
  final bool isCardio;
}

class WorkoutSet {
  const WorkoutSet({required this.id, required this.setNumber, required this.reps, this.weightKg});

  final int id;
  final int setNumber;
  final int reps;
  final double? weightKg;
}

/// One exercise on one day with its sets (strength) or duration/distance (cardio).
class LogEntry {
  const LogEntry({
    required this.id,
    required this.day,
    required this.exerciseId,
    required this.exerciseName,
    required this.isCardio,
    this.durationMin,
    this.distanceKm,
    this.sets = const [],
  });

  final int id;
  final DateTime day;

  /// Null when the exercise was deleted later.
  final int? exerciseId;
  final String exerciseName;
  final bool isCardio;
  final double? durationMin;
  final double? distanceKm;
  final List<WorkoutSet> sets;

  bool get isEmpty => sets.isEmpty && durationMin == null && distanceKm == null;

  double get volume => sets.fold(0, (v, s) => v + s.reps * (s.weightKg ?? 0));
}

class DayTotals {
  const DayTotals({required this.entries, required this.sets, required this.volumeKg, required this.durationMin});

  final int entries;
  final int sets;
  final double volumeKg;
  final double durationMin;
}

class PlanItem {
  const PlanItem({required this.exercise, this.notes});

  final Exercise exercise;
  final String? notes;
}

class Plan {
  const Plan({required this.id, required this.name, required this.items});

  final int id;
  final String name;
  final List<PlanItem> items;
}

class WorkoutEntry {
  const WorkoutEntry({required this.log, required this.done});

  final LogEntry log;
  final bool done;
}

/// A workout started from one or more plans.
class Workout {
  const Workout({
    required this.id,
    required this.name,
    required this.startedAt,
    this.finishedAt,
    this.durationSec,
    this.entries = const [],
  });

  final int id;
  final String? name;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final int? durationSec;
  final List<WorkoutEntry> entries;

  int get doneCount => entries.where((e) => e.done).length;
}

class LastSets {
  const LastSets(this.day, this.sets);

  final DateTime? day;
  final List<WorkoutSet> sets;
}

class WeekDay {
  const WeekDay(this.date, this.trained);

  final DateTime date;
  final bool trained;
}

class WeekStats {
  const WeekStats({
    required this.days,
    required this.sessions,
    required this.goal,
    required this.volumeKg,
    required this.prevVolumeKg,
    required this.prevSessions,
  });

  final List<WeekDay> days;
  final int sessions;
  final int goal;
  final double volumeKg;
  final double prevVolumeKg;
  final int prevSessions;

  /// Change of the volume against last week in percent, null without volume last week.
  double? get volumeChangePct => prevVolumeKg > 0 ? (volumeKg - prevVolumeKg) / prevVolumeKg * 100 : null;
}

/// An exercise without progress over its last sessions.
class Stagnation {
  const Stagnation({
    required this.exerciseName,
    required this.sessions,
    required this.weeks,
    required this.byWeight,
    required this.value,
  });

  final String exerciseName;
  final int sessions;
  final int weeks;

  /// true: [value] is the max. weight; false: the volume.
  final bool byWeight;
  final double value;
}

class WeightEntry {
  const WeightEntry(this.id, this.kg, this.date);

  final int id;
  final double kg;
  final DateTime date;
}

class WeightHistory {
  const WeightHistory({required this.entries, this.latest, this.start, this.trend});

  final List<WeightEntry> entries;
  final double? latest;
  final double? start;

  /// Change of the last 7 days, null without an older entry.
  final double? trend;
}

class Settings {
  const Settings({required this.weeklyGoal, required this.restSeconds, required this.restNotify});

  final int weeklyGoal;
  final int restSeconds;
  final bool restNotify;
}

/// Result of a history CSV import.
class HistoryImport {
  const HistoryImport({
    required this.logs,
    required this.sets,
    required this.weights,
    required this.newExercises,
    required this.skipped,
  });

  final int logs;
  final int sets;
  final int weights;
  final int newExercises;

  /// Entries left out because the day already had them.
  final int skipped;
}

class Profile {
  const Profile({required this.name, this.avatarPath});

  /// Empty when not set.
  final String name;
  final String? avatarPath;
}
