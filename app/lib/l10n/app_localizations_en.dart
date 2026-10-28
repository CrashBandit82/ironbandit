// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'IronBandit';

  @override
  String get tabTraining => 'Training';

  @override
  String get tabWeight => 'Weight';

  @override
  String get tabMore => 'More';

  @override
  String get cancel => 'Cancel';

  @override
  String get save => 'Save';

  @override
  String get delete => 'Delete';

  @override
  String get edit => 'Edit';

  @override
  String get remove => 'Remove';

  @override
  String get ok => 'OK';

  @override
  String get more => 'More';

  @override
  String get clear => 'Clear';

  @override
  String get all => 'All';

  @override
  String get none => 'None';

  @override
  String get retry => 'Try again';

  @override
  String get errorGeneric => 'Something went wrong.';

  @override
  String get requiredField => 'Required';

  @override
  String get invalidNumber => 'Please enter a valid number';

  @override
  String get fileSaved => 'File saved';

  @override
  String get reorder => 'Reorder';

  @override
  String greeting(String name) {
    return 'Hi, $name!';
  }

  @override
  String get greetingNoName => 'Hello!';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get prevDay => 'Previous day';

  @override
  String get nextDay => 'Next day';

  @override
  String get pickDay => 'Pick a day';

  @override
  String get todayEntries => 'Today\'s exercises';

  @override
  String get entries => 'Exercises';

  @override
  String get noEntries => 'Nothing logged yet. Start a plan or add an exercise.';

  @override
  String get noEntriesDay => 'Nothing logged on this day.';

  @override
  String get noOtherEntries => 'No other exercises outside the workout.';

  @override
  String get noValuesYet => 'No values yet';

  @override
  String get addExercise => 'Exercise';

  @override
  String deleteEntryConfirm(String name) {
    return 'Delete \"$name\" from this day? Its sets will be lost.';
  }

  @override
  String get volume => 'Volume';

  @override
  String exercisesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count exercises', one: '1 exercise');
    return '$_temp0';
  }

  @override
  String setsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count sets', one: '1 set');
    return '$_temp0';
  }

  @override
  String setsDone(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count sets done', one: '1 set done');
    return '$_temp0';
  }

  @override
  String get currentWorkout => 'Current workout';

  @override
  String get elapsed => 'Duration';

  @override
  String get progress => 'Progress';

  @override
  String progressDone(int done, int total) {
    return '$done of $total done';
  }

  @override
  String get allDone => 'All exercises done!';

  @override
  String get completed => 'Completed';

  @override
  String get finishWorkout => 'Finish workout';

  @override
  String get finishOpenConfirm => 'Not all exercises are checked off. Finish the workout anyway?';

  @override
  String workoutFinished(String duration) {
    return 'Workout finished – duration $duration';
  }

  @override
  String get keepTraining => 'Keep training';

  @override
  String get cancelWorkout => 'Cancel workout';

  @override
  String get cancelWorkoutConfirm =>
      'Cancel the workout? The duration is not saved and exercises without values are removed. Logged sets are kept.';

  @override
  String workoutCancelled(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Workout cancelled – $count empty exercises removed',
      one: 'Workout cancelled – 1 empty exercise removed',
      zero: 'Workout cancelled',
    );
    return '$_temp0';
  }

  @override
  String get thisWeek => 'This week';

  @override
  String goalShort(int goal) {
    return 'Goal: $goal';
  }

  @override
  String get workouts => 'Workouts';

  @override
  String get vsLastWeek => 'vs. last week';

  @override
  String get trained => 'trained';

  @override
  String get notTrained => 'not trained';

  @override
  String get weeklyGoal => 'Weekly goal';

  @override
  String get workoutsPerWeek => 'Workouts per week';

  @override
  String get stagnationTitle => 'Keep an eye on';

  @override
  String get stagnationSub => 'Exercises without progress lately';

  @override
  String stagnationWeight(String name, int weeks, String value) {
    String _temp0 = intl.Intl.pluralLogic(weeks, locale: localeName, other: '$weeks weeks', one: '1 week');
    return '$name: at $value kg for $_temp0';
  }

  @override
  String stagnationVolume(String name, int weeks) {
    String _temp0 = intl.Intl.pluralLogic(weeks, locale: localeName, other: '$weeks weeks', one: '1 week');
    return '$name: volume flat for $_temp0';
  }

  @override
  String get stagnationHint => 'Maybe time for small changes: weight, reps or a deload week.';

  @override
  String get lastTraining => 'Last workout';

  @override
  String setLabel(int n) {
    return 'Set $n';
  }

  @override
  String get deleteSet => 'Delete set';

  @override
  String get weightKgLabel => 'Weight (kg)';

  @override
  String get repsLabel => 'Reps';

  @override
  String get repsRequired => 'Please enter the reps';

  @override
  String get addSet => 'Log set';

  @override
  String get durationLabel => 'Duration (min)';

  @override
  String get distanceLabel => 'Distance (km)';

  @override
  String get noteLabel => 'Exercise note';

  @override
  String get notePlaceholder => 'Kept for every workout, e.g. seat level 4';

  @override
  String get noteSaved => 'Saved';

  @override
  String get completeExercise => 'Complete exercise';

  @override
  String get reopenExercise => 'Reopen';

  @override
  String get prevExercise => 'Previous exercise';

  @override
  String get nextExercise => 'Next exercise';

  @override
  String exercisePosition(int current, int total) {
    return 'Exercise $current of $total';
  }

  @override
  String get restLabel => 'Rest';

  @override
  String get restDone => 'Rest is over!';

  @override
  String get restSkip => 'End rest';

  @override
  String get restShorter => '15 seconds shorter';

  @override
  String get restLonger => '15 seconds longer';

  @override
  String restAfterSet(String time) {
    return 'Rest after the set: $time';
  }

  @override
  String get restDuration => 'Rest duration';

  @override
  String restDurationSub(String time) {
    return 'Default: $time';
  }

  @override
  String get saveAsDefault => 'Save as default';

  @override
  String get restDefaultSaved => 'Default rest duration saved';

  @override
  String get restNotify => 'Notification when the rest ends';

  @override
  String get restNotifySub => 'With vibration, also when the app is in the background. A paired watch vibrates too.';

  @override
  String get restNotifyTitle => 'Rest is over';

  @override
  String restNotifyBody(String exercise, int n) {
    return '$exercise – set $n';
  }

  @override
  String get restChannel => 'Rest timer';

  @override
  String get pickExerciseTitle => 'Choose exercise';

  @override
  String get searchExercise => 'Search exercise …';

  @override
  String createExerciseNamed(String name) {
    return 'Create \"$name\"';
  }

  @override
  String get newExercise => 'New exercise';

  @override
  String get editExercise => 'Edit exercise';

  @override
  String get noExercises => 'No exercises yet.';

  @override
  String get exerciseName => 'Name';

  @override
  String get exerciseExists => 'This exercise already exists';

  @override
  String get category => 'Category';

  @override
  String get muscleGroup => 'Muscle group (optional)';

  @override
  String get equipment => 'Equipment (optional)';

  @override
  String get cardioSwitch => 'Cardio';

  @override
  String get cardioSwitchSub => 'Duration and distance instead of sets';

  @override
  String get catPush => 'Push';

  @override
  String get catPull => 'Pull';

  @override
  String get catLegs => 'Legs';

  @override
  String get catCore => 'Core';

  @override
  String get catCardio => 'Cardio';

  @override
  String deleteExerciseConfirm(String name) {
    return 'Delete the exercise \"$name\"? The history keeps its name.';
  }

  @override
  String deleteExerciseInPlans(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'It is also removed from $count plans.',
      one: 'It is also removed from 1 plan.',
    );
    return '$_temp0';
  }

  @override
  String get plansTitle => 'Workout plans';

  @override
  String get noPlans => 'No workout plans yet';

  @override
  String get noPlansHint =>
      'Create a plan: just exercises and their order. Sets, weight and reps are logged live during the workout.';

  @override
  String get start => 'Start';

  @override
  String get newPlan => 'New plan';

  @override
  String get editPlan => 'Edit plan';

  @override
  String get planName => 'Plan name';

  @override
  String get planNameHint => 'e.g. Push Day';

  @override
  String get planHint => 'Only exercises and their order. Tap an exercise for a note, drag the handle to reorder.';

  @override
  String get planNoteHint => 'Note in the plan, e.g. lower slowly';

  @override
  String get planSaved => 'Plan saved';

  @override
  String get planEmpty => 'The plan has no exercises yet';

  @override
  String deletePlanConfirm(String name) {
    return 'Delete the plan \"$name\"? Past workouts are kept.';
  }

  @override
  String get importPlans => 'Import plans (CSV)';

  @override
  String get exportPlans => 'Export plans (CSV)';

  @override
  String get samplePlans => 'Save sample CSV';

  @override
  String get importPlansTitle => 'Import plans';

  @override
  String get planExists => 'A plan with this name exists – it is added as another one.';

  @override
  String importNewExercises(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count exercises will be created:',
      one: '1 exercise will be created:',
    );
    return '$_temp0';
  }

  @override
  String importSkippedRows(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count rows are skipped:',
      one: '1 row is skipped:',
    );
    return '$_temp0';
  }

  @override
  String line(int n) {
    return 'Line $n';
  }

  @override
  String importConfirm(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Import $count plans',
      one: 'Import 1 plan',
    );
    return '$_temp0';
  }

  @override
  String plansImported(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count plans imported',
      one: '1 plan imported',
    );
    return '$_temp0';
  }

  @override
  String get csvEmpty => 'The file contains no data';

  @override
  String csvTooBig(String kb) {
    return 'The file is larger than $kb KB';
  }

  @override
  String get csvBinary => 'This is not a CSV file';

  @override
  String get csvNotUtf8 => 'The file is not UTF-8 – please save it as UTF-8 CSV';

  @override
  String get csvUnreadable => 'The file could not be read as CSV';

  @override
  String csvMissingColumns(String columns) {
    return 'Header incomplete, missing: $columns';
  }

  @override
  String csvUnknownColumns(String columns) {
    return 'Unknown column(s): $columns';
  }

  @override
  String get csvDuplicateColumns => 'The header has duplicate columns';

  @override
  String csvTooManyRows(String n) {
    return 'The file has more than $n rows';
  }

  @override
  String csvTooManyPlans(String n) {
    return 'The file contains more than $n plans';
  }

  @override
  String get csvNoValidRows => 'The file contains no valid rows';

  @override
  String get rowPlanNameEmpty => 'plan name missing';

  @override
  String get rowPlanNameTooLong => 'plan name too long';

  @override
  String get rowPlanNameInvalid => 'plan name has invalid characters';

  @override
  String get rowExerciseNameEmpty => 'exercise name missing';

  @override
  String get rowExerciseNameTooLong => 'exercise name too long';

  @override
  String get rowExerciseNameInvalid => 'exercise name has invalid characters';

  @override
  String get rowOrderNotNumber => 'order_index is not a whole number';

  @override
  String get rowOrderOutOfRange => 'order_index outside 0–10000';

  @override
  String get rowNotesTooLong => 'note longer than 500 characters';

  @override
  String get rowTooManyItems => 'more than 200 exercises in the plan';

  @override
  String get weightTitle => 'Body weight';

  @override
  String get weightToday => 'Log weight';

  @override
  String get weightKg => 'Weight';

  @override
  String get weightSaved => 'Weight saved';

  @override
  String get weightCurrent => 'Current';

  @override
  String get weightStart => 'Start';

  @override
  String get weightTrend => 'Trend 7 days';

  @override
  String get weightChartTitle => 'History';

  @override
  String get weightChartMin => 'At least 2 entries needed for the chart';

  @override
  String get weightEntries => 'Entries';

  @override
  String weightDeleteConfirm(String date) {
    return 'Delete the entry of $date?';
  }

  @override
  String get localDataInfo => 'All data stays on this device. No account, no internet connection.';

  @override
  String get profileTitle => 'My profile';

  @override
  String get changeName => 'Change name';

  @override
  String get yourName => 'Your name';

  @override
  String get nameSaved => 'Name saved';

  @override
  String get changeAvatar => 'Change picture';

  @override
  String get removeAvatar => 'Remove picture';

  @override
  String get avatarUpdated => 'Picture updated';

  @override
  String get avatarTooBig => 'Image too large (max. 5 MB)';

  @override
  String get trainingSettings => 'Training';

  @override
  String get appearance => 'Appearance';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Light';

  @override
  String get themeDark => 'Dark';

  @override
  String get dataTitle => 'Data';

  @override
  String get backupTitle => 'Save backup';

  @override
  String get backupSub => 'All data as a JSON file, e.g. for a new phone';

  @override
  String get backupFilePrefix => 'ironbandit_backup';

  @override
  String get backupSaved => 'Backup saved';

  @override
  String get restoreTitle => 'Restore backup';

  @override
  String get restoreSub => 'Replaces all data on this device';

  @override
  String restoreConfirm(String date) {
    return 'Restore the backup$date? All current data on this device will be replaced.';
  }

  @override
  String get restoreAction => 'Restore';

  @override
  String get restoreDone => 'Backup restored';

  @override
  String backupFrom(String date) {
    return 'from $date';
  }

  @override
  String get backupInvalid => 'This is not a valid IronBandit backup';

  @override
  String get backupTooNew => 'The backup is from a newer app version – please update the app first';

  @override
  String get historyImportTitle => 'Import workouts from CSV';

  @override
  String get historyImportSub => 'Export of the IronBandit web app or this app; existing entries stay';

  @override
  String historyImported(int logs, int sets, int weights) {
    return '$logs exercises with $sets sets and $weights weight entries imported';
  }

  @override
  String get historyNothingNew => 'Nothing new – everything was already there';

  @override
  String get historyInvalid => 'This is not an IronBandit CSV export';

  @override
  String get exportTitle => 'Export as CSV';

  @override
  String get exportSub => 'Workouts and body weight for spreadsheets';

  @override
  String get exportSaved => 'Export saved';

  @override
  String get deleteAllData => 'Delete all data';

  @override
  String get deleteAllDataSub => 'Workouts, plans, exercises and weight on this device';

  @override
  String get deleteWarning =>
      'Deletes all workouts, plans, your exercises and weight entries on this device. This cannot be undone – save a backup first if you want to keep the data.';

  @override
  String get deleteConfirmWord => 'DELETE';

  @override
  String deleteConfirmLabel(String word) {
    return 'Type \"$word\" to confirm';
  }

  @override
  String get deleteFinal => 'Delete permanently';

  @override
  String get allDataDeleted => 'All data deleted';

  @override
  String get license => 'Free software under the GNU AGPL-3.0';
}
