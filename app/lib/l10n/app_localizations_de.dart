// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for German (`de`).
class AppLocalizationsDe extends AppLocalizations {
  AppLocalizationsDe([String locale = 'de']) : super(locale);

  @override
  String get appName => 'IronBandit';

  @override
  String get tabTraining => 'Training';

  @override
  String get tabWeight => 'Gewicht';

  @override
  String get tabMore => 'Mehr';

  @override
  String get cancel => 'Abbrechen';

  @override
  String get save => 'Speichern';

  @override
  String get delete => 'Löschen';

  @override
  String get edit => 'Bearbeiten';

  @override
  String get remove => 'Entfernen';

  @override
  String get ok => 'OK';

  @override
  String get more => 'Mehr';

  @override
  String get clear => 'Leeren';

  @override
  String get all => 'Alle';

  @override
  String get none => 'Keine';

  @override
  String get retry => 'Erneut versuchen';

  @override
  String get errorGeneric => 'Etwas ist schiefgelaufen.';

  @override
  String get requiredField => 'Pflichtfeld';

  @override
  String get invalidNumber => 'Bitte eine gültige Zahl eingeben';

  @override
  String get fileSaved => 'Datei gespeichert';

  @override
  String get reorder => 'Verschieben';

  @override
  String get trainingTitle => 'Training';

  @override
  String get today => 'Heute';

  @override
  String get yesterday => 'Gestern';

  @override
  String get prevDay => 'Vorheriger Tag';

  @override
  String get nextDay => 'Nächster Tag';

  @override
  String get pickDay => 'Tag wählen';

  @override
  String get todayEntries => 'Heutige Übungen';

  @override
  String get entries => 'Übungen';

  @override
  String get noEntries =>
      'Noch nichts eingetragen. Starte einen Plan oder füge eine Übung hinzu.';

  @override
  String get noEntriesDay => 'An diesem Tag ist nichts eingetragen.';

  @override
  String get noOtherEntries =>
      'Keine weiteren Übungen außerhalb des Trainings.';

  @override
  String get noValuesYet => 'Noch keine Werte';

  @override
  String get addExercise => 'Übung';

  @override
  String deleteEntryConfirm(String name) {
    return '„$name“ von diesem Tag löschen? Die Sätze gehen verloren.';
  }

  @override
  String get volume => 'Volumen';

  @override
  String exercisesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Übungen',
      one: '1 Übung',
    );
    return '$_temp0';
  }

  @override
  String setsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Sätze',
      one: '1 Satz',
    );
    return '$_temp0';
  }

  @override
  String setsDone(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Sätze erledigt',
      one: '1 Satz erledigt',
    );
    return '$_temp0';
  }

  @override
  String get currentWorkout => 'Aktuelles Training';

  @override
  String get elapsed => 'Dauer';

  @override
  String get progress => 'Fortschritt';

  @override
  String progressDone(int done, int total) {
    return '$done von $total erledigt';
  }

  @override
  String get allDone => 'Alle Übungen erledigt!';

  @override
  String get completed => 'Abgeschlossen';

  @override
  String get finishWorkout => 'Training abschließen';

  @override
  String get finishOpenConfirm =>
      'Noch nicht alle Übungen sind abgehakt. Training trotzdem abschließen?';

  @override
  String workoutFinished(String duration) {
    return 'Training abgeschlossen – Dauer $duration';
  }

  @override
  String get keepTraining => 'Weiter trainieren';

  @override
  String get cancelWorkout => 'Training abbrechen';

  @override
  String get cancelWorkoutConfirm =>
      'Training abbrechen? Die Dauer wird nicht gespeichert und Übungen ohne Eintrag werden entfernt. Bereits erfasste Sätze bleiben erhalten.';

  @override
  String workoutCancelled(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Training abgebrochen – $count leere Übungen entfernt',
      one: 'Training abgebrochen – 1 leere Übung entfernt',
      zero: 'Training abgebrochen',
    );
    return '$_temp0';
  }

  @override
  String get thisWeek => 'Diese Woche';

  @override
  String goalShort(int goal) {
    return 'Ziel: $goal';
  }

  @override
  String get workouts => 'Trainings';

  @override
  String get vsLastWeek => 'ggü. Vorwoche';

  @override
  String get trained => 'trainiert';

  @override
  String get notTrained => 'nicht trainiert';

  @override
  String get weeklyGoal => 'Wochenziel';

  @override
  String get workoutsPerWeek => 'Trainings pro Woche';

  @override
  String get stagnationTitle => 'Beobachten';

  @override
  String get stagnationSub => 'Übungen ohne Steigerung in letzter Zeit';

  @override
  String stagnationWeight(String name, int weeks, String value) {
    String _temp0 = intl.Intl.pluralLogic(
      weeks,
      locale: localeName,
      other: '$weeks Wochen',
      one: '1 Woche',
    );
    return '$name: seit $_temp0 bei $value kg';
  }

  @override
  String stagnationVolume(String name, int weeks) {
    String _temp0 = intl.Intl.pluralLogic(
      weeks,
      locale: localeName,
      other: '$weeks Wochen',
      one: '1 Woche',
    );
    return '$name: Volumen seit $_temp0 stabil';
  }

  @override
  String get stagnationHint =>
      'Vielleicht Zeit für kleine Änderungen: Gewicht, Wiederholungen oder eine Deload-Woche.';

  @override
  String get lastTraining => 'Letztes Training';

  @override
  String get lastTime => 'letztes Mal';

  @override
  String setLabel(int n) {
    return 'Satz $n';
  }

  @override
  String get deleteSet => 'Satz löschen';

  @override
  String get weightKgLabel => 'Gewicht (kg)';

  @override
  String get repsLabel => 'Wdh.';

  @override
  String get repsRequired => 'Bitte Wiederholungen eintragen';

  @override
  String get addSet => 'Satz eintragen';

  @override
  String get durationLabel => 'Dauer (min)';

  @override
  String get distanceLabel => 'Distanz (km)';

  @override
  String get noteLabel => 'Notiz zur Übung';

  @override
  String get notePlaceholder => 'Bleibt für jedes Training, z. B. Sitz Stufe 4';

  @override
  String get noteSaved => 'Gespeichert';

  @override
  String get completeExercise => 'Übung abschließen';

  @override
  String get reopenExercise => 'Wieder öffnen';

  @override
  String get prevExercise => 'Vorherige Übung';

  @override
  String get nextExercise => 'Nächste Übung';

  @override
  String exercisePosition(int current, int total) {
    return 'Übung $current von $total';
  }

  @override
  String get restLabel => 'Pause';

  @override
  String get restDone => 'Pause vorbei!';

  @override
  String get restSkip => 'Pause beenden';

  @override
  String get restShorter => '15 Sekunden kürzer';

  @override
  String get restLonger => '15 Sekunden länger';

  @override
  String restAfterSet(String time) {
    return 'Pause nach dem Satz: $time';
  }

  @override
  String get restDuration => 'Pausendauer';

  @override
  String restDurationSub(String time) {
    return 'Standard: $time';
  }

  @override
  String get saveAsDefault => 'Als Standard speichern';

  @override
  String get restDefaultSaved => 'Standard-Pausendauer gespeichert';

  @override
  String get restNotify => 'Benachrichtigung am Pausenende';

  @override
  String get restNotifySub =>
      'Mit Vibration, auch wenn die App im Hintergrund ist. Eine gekoppelte Uhr vibriert mit.';

  @override
  String get restNotifyTitle => 'Pause vorbei';

  @override
  String restNotifyBody(String exercise, int n) {
    return '$exercise – Satz $n';
  }

  @override
  String get restChannel => 'Pausentimer';

  @override
  String get pickExerciseTitle => 'Übung wählen';

  @override
  String get searchExercise => 'Übung suchen …';

  @override
  String createExerciseNamed(String name) {
    return '„$name“ neu anlegen';
  }

  @override
  String get newExercise => 'Neue Übung';

  @override
  String get editExercise => 'Übung bearbeiten';

  @override
  String get noExercises => 'Noch keine Übungen.';

  @override
  String get exerciseName => 'Name';

  @override
  String get exerciseExists => 'Diese Übung gibt es schon';

  @override
  String get category => 'Kategorie';

  @override
  String get muscleGroup => 'Muskelgruppe (optional)';

  @override
  String get equipment => 'Gerät (optional)';

  @override
  String get cardioSwitch => 'Ausdauer';

  @override
  String get cardioSwitchSub => 'Dauer und Distanz statt Sätzen';

  @override
  String get catPush => 'Drücken';

  @override
  String get catPull => 'Ziehen';

  @override
  String get catLegs => 'Beine';

  @override
  String get catCore => 'Rumpf';

  @override
  String get catCardio => 'Ausdauer';

  @override
  String deleteExerciseConfirm(String name) {
    return 'Übung „$name“ löschen? Der Verlauf behält den Namen.';
  }

  @override
  String deleteExerciseInPlans(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Sie wird auch aus $count Plänen entfernt.',
      one: 'Sie wird auch aus 1 Plan entfernt.',
    );
    return '$_temp0';
  }

  @override
  String get plansTitle => 'Trainingspläne';

  @override
  String get noPlans => 'Noch keine Trainingspläne';

  @override
  String get noPlansHint =>
      'Lege einen Plan an: nur Übungen und Reihenfolge. Sätze, Gewicht und Wiederholungen trägst du live im Training ein.';

  @override
  String get start => 'Start';

  @override
  String get newPlan => 'Neuer Plan';

  @override
  String get editPlan => 'Plan bearbeiten';

  @override
  String get planName => 'Name des Plans';

  @override
  String get planNameHint => 'z. B. Push Day';

  @override
  String get planHint =>
      'Nur Übungen und Reihenfolge. Tippe eine Übung an für eine Notiz, zum Verschieben am Griff ziehen.';

  @override
  String get planNoteHint => 'Notiz im Plan, z. B. langsam ablassen';

  @override
  String get planSaved => 'Plan gespeichert';

  @override
  String get planEmpty => 'Der Plan enthält noch keine Übungen';

  @override
  String deletePlanConfirm(String name) {
    return 'Plan „$name“ löschen? Bisherige Trainings bleiben erhalten.';
  }

  @override
  String get importPlans => 'Pläne importieren (CSV)';

  @override
  String get exportPlans => 'Pläne exportieren (CSV)';

  @override
  String get samplePlans => 'Beispiel-CSV speichern';

  @override
  String get importPlansTitle => 'Pläne importieren';

  @override
  String get planExists =>
      'Ein Plan mit diesem Namen existiert schon – er wird zusätzlich angelegt.';

  @override
  String importNewExercises(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Übungen werden neu angelegt:',
      one: '1 Übung wird neu angelegt:',
    );
    return '$_temp0';
  }

  @override
  String importSkippedRows(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Zeilen werden übersprungen:',
      one: '1 Zeile wird übersprungen:',
    );
    return '$_temp0';
  }

  @override
  String line(int n) {
    return 'Zeile $n';
  }

  @override
  String importConfirm(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Pläne importieren',
      one: '1 Plan importieren',
    );
    return '$_temp0';
  }

  @override
  String plansImported(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count Pläne importiert',
      one: '1 Plan importiert',
    );
    return '$_temp0';
  }

  @override
  String get csvEmpty => 'Die Datei enthält keine Daten';

  @override
  String csvTooBig(String kb) {
    return 'Die Datei ist größer als $kb KB';
  }

  @override
  String get csvBinary => 'Das ist keine CSV-Datei';

  @override
  String get csvNotUtf8 =>
      'Die Datei ist nicht UTF-8-kodiert – bitte als UTF-8-CSV speichern';

  @override
  String get csvUnreadable => 'Die Datei konnte nicht als CSV gelesen werden';

  @override
  String csvMissingColumns(String columns) {
    return 'Kopfzeile unvollständig, es fehlt: $columns';
  }

  @override
  String csvUnknownColumns(String columns) {
    return 'Unbekannte Spalte(n): $columns';
  }

  @override
  String get csvDuplicateColumns => 'Die Kopfzeile enthält doppelte Spalten';

  @override
  String csvTooManyRows(String n) {
    return 'Die Datei hat mehr als $n Zeilen';
  }

  @override
  String csvTooManyPlans(String n) {
    return 'Die Datei enthält mehr als $n Pläne';
  }

  @override
  String get csvNoValidRows => 'Die Datei enthält keine gültigen Zeilen';

  @override
  String get rowPlanNameEmpty => 'Planname fehlt';

  @override
  String get rowPlanNameTooLong => 'Planname zu lang';

  @override
  String get rowPlanNameInvalid => 'Planname enthält unerlaubte Zeichen';

  @override
  String get rowExerciseNameEmpty => 'Übungsname fehlt';

  @override
  String get rowExerciseNameTooLong => 'Übungsname zu lang';

  @override
  String get rowExerciseNameInvalid => 'Übungsname enthält unerlaubte Zeichen';

  @override
  String get rowOrderNotNumber => 'order_index ist keine ganze Zahl';

  @override
  String get rowOrderOutOfRange => 'order_index außerhalb von 0–10000';

  @override
  String get rowNotesTooLong => 'Notiz länger als 500 Zeichen';

  @override
  String get rowTooManyItems => 'mehr als 200 Übungen im Plan';

  @override
  String get weightTitle => 'Körpergewicht';

  @override
  String get weightToday => 'Gewicht eintragen';

  @override
  String get weightKg => 'Gewicht';

  @override
  String get weightSaved => 'Gewicht gespeichert';

  @override
  String get weightCurrent => 'Aktuell';

  @override
  String get weightStart => 'Start';

  @override
  String get weightTrend => 'Trend 7 Tage';

  @override
  String get weightChartTitle => 'Verlauf';

  @override
  String get weightChartMin => 'Mindestens 2 Einträge für den Verlauf nötig';

  @override
  String get weightEntries => 'Einträge';

  @override
  String weightDeleteConfirm(String date) {
    return 'Eintrag vom $date löschen?';
  }

  @override
  String get localDataInfo =>
      'Alle Daten bleiben auf diesem Gerät. Kein Konto, keine Verbindung ins Internet.';

  @override
  String get trainingSettings => 'Training';

  @override
  String get appearance => 'Darstellung';

  @override
  String get themeSystem => 'System';

  @override
  String get themeLight => 'Hell';

  @override
  String get themeDark => 'Dunkel';

  @override
  String get dataTitle => 'Daten';

  @override
  String get backupTitle => 'Sicherung speichern';

  @override
  String get backupSub =>
      'Alle Daten als JSON-Datei, z. B. für ein neues Handy';

  @override
  String get backupFilePrefix => 'ironbandit_sicherung';

  @override
  String get backupSaved => 'Sicherung gespeichert';

  @override
  String get restoreTitle => 'Sicherung wiederherstellen';

  @override
  String get restoreSub => 'Ersetzt alle Daten auf diesem Gerät';

  @override
  String restoreConfirm(String date) {
    return 'Sicherung$date wiederherstellen? Alle aktuellen Daten auf diesem Gerät werden ersetzt.';
  }

  @override
  String get restoreAction => 'Wiederherstellen';

  @override
  String get restoreDone => 'Sicherung wiederhergestellt';

  @override
  String backupFrom(String date) {
    return 'vom $date';
  }

  @override
  String get backupInvalid => 'Das ist keine gültige IronBandit-Sicherung';

  @override
  String get backupTooNew =>
      'Die Sicherung stammt aus einer neueren App-Version – bitte erst die App aktualisieren';

  @override
  String get historyImportTitle => 'Trainings aus CSV übernehmen';

  @override
  String get historyImportSub =>
      'Export der IronBandit-Web-App oder dieser App; vorhandene Einträge bleiben';

  @override
  String historyImported(int logs, int sets, int weights) {
    return '$logs Übungen mit $sets Sätzen und $weights Gewichtseinträge übernommen';
  }

  @override
  String get historyNothingNew => 'Nichts Neues – alles war schon da';

  @override
  String get historyInvalid => 'Das ist kein IronBandit-CSV-Export';

  @override
  String get exportTitle => 'Als CSV exportieren';

  @override
  String get exportSub => 'Trainings und Körpergewicht für Tabellen';

  @override
  String get exportSaved => 'Export gespeichert';

  @override
  String get deleteAllData => 'Alle Daten löschen';

  @override
  String get deleteAllDataSub =>
      'Trainings, Pläne, Übungen und Gewicht auf diesem Gerät';

  @override
  String get deleteWarning =>
      'Löscht alle Trainings, Pläne, eigenen Übungen und Gewichtseinträge auf diesem Gerät. Das lässt sich nicht rückgängig machen – speichere vorher eine Sicherung, wenn du die Daten behalten willst.';

  @override
  String get deleteConfirmWord => 'LÖSCHEN';

  @override
  String deleteConfirmLabel(String word) {
    return 'Zum Bestätigen „$word“ eingeben';
  }

  @override
  String get deleteFinal => 'Endgültig löschen';

  @override
  String get allDataDeleted => 'Alle Daten gelöscht';

  @override
  String get license => 'Freie Software unter der GNU AGPL-3.0';
}
