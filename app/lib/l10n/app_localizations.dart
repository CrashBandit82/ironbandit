import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_de.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('de'), Locale('en')];

  /// No description provided for @appName.
  ///
  /// In de, this message translates to:
  /// **'IronBandit'**
  String get appName;

  /// No description provided for @tabTraining.
  ///
  /// In de, this message translates to:
  /// **'Training'**
  String get tabTraining;

  /// No description provided for @tabWeight.
  ///
  /// In de, this message translates to:
  /// **'Gewicht'**
  String get tabWeight;

  /// No description provided for @tabMore.
  ///
  /// In de, this message translates to:
  /// **'Mehr'**
  String get tabMore;

  /// No description provided for @cancel.
  ///
  /// In de, this message translates to:
  /// **'Abbrechen'**
  String get cancel;

  /// No description provided for @save.
  ///
  /// In de, this message translates to:
  /// **'Speichern'**
  String get save;

  /// No description provided for @delete.
  ///
  /// In de, this message translates to:
  /// **'Löschen'**
  String get delete;

  /// No description provided for @edit.
  ///
  /// In de, this message translates to:
  /// **'Bearbeiten'**
  String get edit;

  /// No description provided for @remove.
  ///
  /// In de, this message translates to:
  /// **'Entfernen'**
  String get remove;

  /// No description provided for @ok.
  ///
  /// In de, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @more.
  ///
  /// In de, this message translates to:
  /// **'Mehr'**
  String get more;

  /// No description provided for @clear.
  ///
  /// In de, this message translates to:
  /// **'Leeren'**
  String get clear;

  /// No description provided for @all.
  ///
  /// In de, this message translates to:
  /// **'Alle'**
  String get all;

  /// No description provided for @none.
  ///
  /// In de, this message translates to:
  /// **'Keine'**
  String get none;

  /// No description provided for @retry.
  ///
  /// In de, this message translates to:
  /// **'Erneut versuchen'**
  String get retry;

  /// No description provided for @errorGeneric.
  ///
  /// In de, this message translates to:
  /// **'Etwas ist schiefgelaufen.'**
  String get errorGeneric;

  /// No description provided for @requiredField.
  ///
  /// In de, this message translates to:
  /// **'Pflichtfeld'**
  String get requiredField;

  /// No description provided for @invalidNumber.
  ///
  /// In de, this message translates to:
  /// **'Bitte eine gültige Zahl eingeben'**
  String get invalidNumber;

  /// No description provided for @fileSaved.
  ///
  /// In de, this message translates to:
  /// **'Datei gespeichert'**
  String get fileSaved;

  /// No description provided for @reorder.
  ///
  /// In de, this message translates to:
  /// **'Verschieben'**
  String get reorder;

  /// No description provided for @greeting.
  ///
  /// In de, this message translates to:
  /// **'Hallo, {name}!'**
  String greeting(String name);

  /// No description provided for @greetingNoName.
  ///
  /// In de, this message translates to:
  /// **'Hallo!'**
  String get greetingNoName;

  /// No description provided for @today.
  ///
  /// In de, this message translates to:
  /// **'Heute'**
  String get today;

  /// No description provided for @yesterday.
  ///
  /// In de, this message translates to:
  /// **'Gestern'**
  String get yesterday;

  /// No description provided for @prevDay.
  ///
  /// In de, this message translates to:
  /// **'Vorheriger Tag'**
  String get prevDay;

  /// No description provided for @nextDay.
  ///
  /// In de, this message translates to:
  /// **'Nächster Tag'**
  String get nextDay;

  /// No description provided for @pickDay.
  ///
  /// In de, this message translates to:
  /// **'Tag wählen'**
  String get pickDay;

  /// No description provided for @todayEntries.
  ///
  /// In de, this message translates to:
  /// **'Heutige Übungen'**
  String get todayEntries;

  /// No description provided for @entries.
  ///
  /// In de, this message translates to:
  /// **'Übungen'**
  String get entries;

  /// No description provided for @noEntries.
  ///
  /// In de, this message translates to:
  /// **'Noch nichts eingetragen. Starte einen Plan oder füge eine Übung hinzu.'**
  String get noEntries;

  /// No description provided for @noEntriesDay.
  ///
  /// In de, this message translates to:
  /// **'An diesem Tag ist nichts eingetragen.'**
  String get noEntriesDay;

  /// No description provided for @noOtherEntries.
  ///
  /// In de, this message translates to:
  /// **'Keine weiteren Übungen außerhalb des Trainings.'**
  String get noOtherEntries;

  /// No description provided for @noValuesYet.
  ///
  /// In de, this message translates to:
  /// **'Noch keine Werte'**
  String get noValuesYet;

  /// No description provided for @addExercise.
  ///
  /// In de, this message translates to:
  /// **'Übung'**
  String get addExercise;

  /// No description provided for @deleteEntryConfirm.
  ///
  /// In de, this message translates to:
  /// **'„{name}“ von diesem Tag löschen? Die Sätze gehen verloren.'**
  String deleteEntryConfirm(String name);

  /// No description provided for @volume.
  ///
  /// In de, this message translates to:
  /// **'Volumen'**
  String get volume;

  /// No description provided for @exercisesCount.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Übung} other{{count} Übungen}}'**
  String exercisesCount(int count);

  /// No description provided for @setsCount.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Satz} other{{count} Sätze}}'**
  String setsCount(int count);

  /// No description provided for @setsDone.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Satz erledigt} other{{count} Sätze erledigt}}'**
  String setsDone(int count);

  /// No description provided for @currentWorkout.
  ///
  /// In de, this message translates to:
  /// **'Aktuelles Training'**
  String get currentWorkout;

  /// No description provided for @elapsed.
  ///
  /// In de, this message translates to:
  /// **'Dauer'**
  String get elapsed;

  /// No description provided for @progress.
  ///
  /// In de, this message translates to:
  /// **'Fortschritt'**
  String get progress;

  /// No description provided for @progressDone.
  ///
  /// In de, this message translates to:
  /// **'{done} von {total} erledigt'**
  String progressDone(int done, int total);

  /// No description provided for @allDone.
  ///
  /// In de, this message translates to:
  /// **'Alle Übungen erledigt!'**
  String get allDone;

  /// No description provided for @completed.
  ///
  /// In de, this message translates to:
  /// **'Abgeschlossen'**
  String get completed;

  /// No description provided for @finishWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training abschließen'**
  String get finishWorkout;

  /// No description provided for @finishOpenConfirm.
  ///
  /// In de, this message translates to:
  /// **'Noch nicht alle Übungen sind abgehakt. Training trotzdem abschließen?'**
  String get finishOpenConfirm;

  /// No description provided for @workoutFinished.
  ///
  /// In de, this message translates to:
  /// **'Training abgeschlossen – Dauer {duration}'**
  String workoutFinished(String duration);

  /// No description provided for @keepTraining.
  ///
  /// In de, this message translates to:
  /// **'Weiter trainieren'**
  String get keepTraining;

  /// No description provided for @cancelWorkout.
  ///
  /// In de, this message translates to:
  /// **'Training abbrechen'**
  String get cancelWorkout;

  /// No description provided for @cancelWorkoutConfirm.
  ///
  /// In de, this message translates to:
  /// **'Training abbrechen? Die Dauer wird nicht gespeichert und Übungen ohne Eintrag werden entfernt. Bereits erfasste Sätze bleiben erhalten.'**
  String get cancelWorkoutConfirm;

  /// No description provided for @workoutCancelled.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =0{Training abgebrochen} =1{Training abgebrochen – 1 leere Übung entfernt} other{Training abgebrochen – {count} leere Übungen entfernt}}'**
  String workoutCancelled(int count);

  /// No description provided for @thisWeek.
  ///
  /// In de, this message translates to:
  /// **'Diese Woche'**
  String get thisWeek;

  /// No description provided for @goalShort.
  ///
  /// In de, this message translates to:
  /// **'Ziel: {goal}'**
  String goalShort(int goal);

  /// No description provided for @workouts.
  ///
  /// In de, this message translates to:
  /// **'Trainings'**
  String get workouts;

  /// No description provided for @vsLastWeek.
  ///
  /// In de, this message translates to:
  /// **'ggü. Vorwoche'**
  String get vsLastWeek;

  /// No description provided for @trained.
  ///
  /// In de, this message translates to:
  /// **'trainiert'**
  String get trained;

  /// No description provided for @notTrained.
  ///
  /// In de, this message translates to:
  /// **'nicht trainiert'**
  String get notTrained;

  /// No description provided for @weeklyGoal.
  ///
  /// In de, this message translates to:
  /// **'Wochenziel'**
  String get weeklyGoal;

  /// No description provided for @workoutsPerWeek.
  ///
  /// In de, this message translates to:
  /// **'Trainings pro Woche'**
  String get workoutsPerWeek;

  /// No description provided for @stagnationTitle.
  ///
  /// In de, this message translates to:
  /// **'Beobachten'**
  String get stagnationTitle;

  /// No description provided for @stagnationSub.
  ///
  /// In de, this message translates to:
  /// **'Übungen ohne Steigerung in letzter Zeit'**
  String get stagnationSub;

  /// No description provided for @stagnationWeight.
  ///
  /// In de, this message translates to:
  /// **'{name}: seit {weeks, plural, =1{1 Woche} other{{weeks} Wochen}} bei {value} kg'**
  String stagnationWeight(String name, int weeks, String value);

  /// No description provided for @stagnationVolume.
  ///
  /// In de, this message translates to:
  /// **'{name}: Volumen seit {weeks, plural, =1{1 Woche} other{{weeks} Wochen}} stabil'**
  String stagnationVolume(String name, int weeks);

  /// No description provided for @stagnationHint.
  ///
  /// In de, this message translates to:
  /// **'Vielleicht Zeit für kleine Änderungen: Gewicht, Wiederholungen oder eine Deload-Woche.'**
  String get stagnationHint;

  /// No description provided for @lastTraining.
  ///
  /// In de, this message translates to:
  /// **'Letztes Training'**
  String get lastTraining;

  /// No description provided for @setLabel.
  ///
  /// In de, this message translates to:
  /// **'Satz {n}'**
  String setLabel(int n);

  /// No description provided for @deleteSet.
  ///
  /// In de, this message translates to:
  /// **'Satz löschen'**
  String get deleteSet;

  /// No description provided for @weightKgLabel.
  ///
  /// In de, this message translates to:
  /// **'Gewicht (kg)'**
  String get weightKgLabel;

  /// No description provided for @repsLabel.
  ///
  /// In de, this message translates to:
  /// **'Wdh.'**
  String get repsLabel;

  /// No description provided for @repsRequired.
  ///
  /// In de, this message translates to:
  /// **'Bitte Wiederholungen eintragen'**
  String get repsRequired;

  /// No description provided for @addSet.
  ///
  /// In de, this message translates to:
  /// **'Satz eintragen'**
  String get addSet;

  /// No description provided for @durationLabel.
  ///
  /// In de, this message translates to:
  /// **'Dauer (min)'**
  String get durationLabel;

  /// No description provided for @distanceLabel.
  ///
  /// In de, this message translates to:
  /// **'Distanz (km)'**
  String get distanceLabel;

  /// No description provided for @noteLabel.
  ///
  /// In de, this message translates to:
  /// **'Notiz zur Übung'**
  String get noteLabel;

  /// No description provided for @notePlaceholder.
  ///
  /// In de, this message translates to:
  /// **'Bleibt für jedes Training, z. B. Sitz Stufe 4'**
  String get notePlaceholder;

  /// No description provided for @noteSaved.
  ///
  /// In de, this message translates to:
  /// **'Gespeichert'**
  String get noteSaved;

  /// No description provided for @completeExercise.
  ///
  /// In de, this message translates to:
  /// **'Übung abschließen'**
  String get completeExercise;

  /// No description provided for @reopenExercise.
  ///
  /// In de, this message translates to:
  /// **'Wieder öffnen'**
  String get reopenExercise;

  /// No description provided for @prevExercise.
  ///
  /// In de, this message translates to:
  /// **'Vorherige Übung'**
  String get prevExercise;

  /// No description provided for @nextExercise.
  ///
  /// In de, this message translates to:
  /// **'Nächste Übung'**
  String get nextExercise;

  /// No description provided for @exercisePosition.
  ///
  /// In de, this message translates to:
  /// **'Übung {current} von {total}'**
  String exercisePosition(int current, int total);

  /// No description provided for @restLabel.
  ///
  /// In de, this message translates to:
  /// **'Pause'**
  String get restLabel;

  /// No description provided for @restDone.
  ///
  /// In de, this message translates to:
  /// **'Pause vorbei!'**
  String get restDone;

  /// No description provided for @restSkip.
  ///
  /// In de, this message translates to:
  /// **'Pause beenden'**
  String get restSkip;

  /// No description provided for @restShorter.
  ///
  /// In de, this message translates to:
  /// **'15 Sekunden kürzer'**
  String get restShorter;

  /// No description provided for @restLonger.
  ///
  /// In de, this message translates to:
  /// **'15 Sekunden länger'**
  String get restLonger;

  /// No description provided for @restAfterSet.
  ///
  /// In de, this message translates to:
  /// **'Pause nach dem Satz: {time}'**
  String restAfterSet(String time);

  /// No description provided for @restDuration.
  ///
  /// In de, this message translates to:
  /// **'Pausendauer'**
  String get restDuration;

  /// No description provided for @restDurationSub.
  ///
  /// In de, this message translates to:
  /// **'Standard: {time}'**
  String restDurationSub(String time);

  /// No description provided for @saveAsDefault.
  ///
  /// In de, this message translates to:
  /// **'Als Standard speichern'**
  String get saveAsDefault;

  /// No description provided for @restDefaultSaved.
  ///
  /// In de, this message translates to:
  /// **'Standard-Pausendauer gespeichert'**
  String get restDefaultSaved;

  /// No description provided for @restNotify.
  ///
  /// In de, this message translates to:
  /// **'Benachrichtigung am Pausenende'**
  String get restNotify;

  /// No description provided for @restNotifySub.
  ///
  /// In de, this message translates to:
  /// **'Mit Vibration, auch wenn die App im Hintergrund ist. Eine gekoppelte Uhr vibriert mit.'**
  String get restNotifySub;

  /// No description provided for @restNotifyTitle.
  ///
  /// In de, this message translates to:
  /// **'Pause vorbei'**
  String get restNotifyTitle;

  /// No description provided for @restNotifyBody.
  ///
  /// In de, this message translates to:
  /// **'{exercise} – Satz {n}'**
  String restNotifyBody(String exercise, int n);

  /// No description provided for @restChannel.
  ///
  /// In de, this message translates to:
  /// **'Pausentimer'**
  String get restChannel;

  /// No description provided for @pickExerciseTitle.
  ///
  /// In de, this message translates to:
  /// **'Übung wählen'**
  String get pickExerciseTitle;

  /// No description provided for @searchExercise.
  ///
  /// In de, this message translates to:
  /// **'Übung suchen …'**
  String get searchExercise;

  /// No description provided for @createExerciseNamed.
  ///
  /// In de, this message translates to:
  /// **'„{name}“ neu anlegen'**
  String createExerciseNamed(String name);

  /// No description provided for @newExercise.
  ///
  /// In de, this message translates to:
  /// **'Neue Übung'**
  String get newExercise;

  /// No description provided for @editExercise.
  ///
  /// In de, this message translates to:
  /// **'Übung bearbeiten'**
  String get editExercise;

  /// No description provided for @noExercises.
  ///
  /// In de, this message translates to:
  /// **'Noch keine Übungen.'**
  String get noExercises;

  /// No description provided for @exerciseName.
  ///
  /// In de, this message translates to:
  /// **'Name'**
  String get exerciseName;

  /// No description provided for @exerciseExists.
  ///
  /// In de, this message translates to:
  /// **'Diese Übung gibt es schon'**
  String get exerciseExists;

  /// No description provided for @category.
  ///
  /// In de, this message translates to:
  /// **'Kategorie'**
  String get category;

  /// No description provided for @muscleGroup.
  ///
  /// In de, this message translates to:
  /// **'Muskelgruppe (optional)'**
  String get muscleGroup;

  /// No description provided for @equipment.
  ///
  /// In de, this message translates to:
  /// **'Gerät (optional)'**
  String get equipment;

  /// No description provided for @cardioSwitch.
  ///
  /// In de, this message translates to:
  /// **'Ausdauer'**
  String get cardioSwitch;

  /// No description provided for @cardioSwitchSub.
  ///
  /// In de, this message translates to:
  /// **'Dauer und Distanz statt Sätzen'**
  String get cardioSwitchSub;

  /// No description provided for @catPush.
  ///
  /// In de, this message translates to:
  /// **'Drücken'**
  String get catPush;

  /// No description provided for @catPull.
  ///
  /// In de, this message translates to:
  /// **'Ziehen'**
  String get catPull;

  /// No description provided for @catLegs.
  ///
  /// In de, this message translates to:
  /// **'Beine'**
  String get catLegs;

  /// No description provided for @catCore.
  ///
  /// In de, this message translates to:
  /// **'Rumpf'**
  String get catCore;

  /// No description provided for @catCardio.
  ///
  /// In de, this message translates to:
  /// **'Ausdauer'**
  String get catCardio;

  /// No description provided for @deleteExerciseConfirm.
  ///
  /// In de, this message translates to:
  /// **'Übung „{name}“ löschen? Der Verlauf behält den Namen.'**
  String deleteExerciseConfirm(String name);

  /// No description provided for @deleteExerciseInPlans.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{Sie wird auch aus 1 Plan entfernt.} other{Sie wird auch aus {count} Plänen entfernt.}}'**
  String deleteExerciseInPlans(int count);

  /// No description provided for @plansTitle.
  ///
  /// In de, this message translates to:
  /// **'Trainingspläne'**
  String get plansTitle;

  /// No description provided for @noPlans.
  ///
  /// In de, this message translates to:
  /// **'Noch keine Trainingspläne'**
  String get noPlans;

  /// No description provided for @noPlansHint.
  ///
  /// In de, this message translates to:
  /// **'Lege einen Plan an: nur Übungen und Reihenfolge. Sätze, Gewicht und Wiederholungen trägst du live im Training ein.'**
  String get noPlansHint;

  /// No description provided for @start.
  ///
  /// In de, this message translates to:
  /// **'Start'**
  String get start;

  /// No description provided for @newPlan.
  ///
  /// In de, this message translates to:
  /// **'Neuer Plan'**
  String get newPlan;

  /// No description provided for @editPlan.
  ///
  /// In de, this message translates to:
  /// **'Plan bearbeiten'**
  String get editPlan;

  /// No description provided for @planName.
  ///
  /// In de, this message translates to:
  /// **'Name des Plans'**
  String get planName;

  /// No description provided for @planNameHint.
  ///
  /// In de, this message translates to:
  /// **'z. B. Push Day'**
  String get planNameHint;

  /// No description provided for @planHint.
  ///
  /// In de, this message translates to:
  /// **'Nur Übungen und Reihenfolge. Tippe eine Übung an für eine Notiz, zum Verschieben am Griff ziehen.'**
  String get planHint;

  /// No description provided for @planNoteHint.
  ///
  /// In de, this message translates to:
  /// **'Notiz im Plan, z. B. langsam ablassen'**
  String get planNoteHint;

  /// No description provided for @planSaved.
  ///
  /// In de, this message translates to:
  /// **'Plan gespeichert'**
  String get planSaved;

  /// No description provided for @planEmpty.
  ///
  /// In de, this message translates to:
  /// **'Der Plan enthält noch keine Übungen'**
  String get planEmpty;

  /// No description provided for @deletePlanConfirm.
  ///
  /// In de, this message translates to:
  /// **'Plan „{name}“ löschen? Bisherige Trainings bleiben erhalten.'**
  String deletePlanConfirm(String name);

  /// No description provided for @importPlans.
  ///
  /// In de, this message translates to:
  /// **'Pläne importieren (CSV)'**
  String get importPlans;

  /// No description provided for @exportPlans.
  ///
  /// In de, this message translates to:
  /// **'Pläne exportieren (CSV)'**
  String get exportPlans;

  /// No description provided for @samplePlans.
  ///
  /// In de, this message translates to:
  /// **'Beispiel-CSV speichern'**
  String get samplePlans;

  /// No description provided for @importPlansTitle.
  ///
  /// In de, this message translates to:
  /// **'Pläne importieren'**
  String get importPlansTitle;

  /// No description provided for @planExists.
  ///
  /// In de, this message translates to:
  /// **'Ein Plan mit diesem Namen existiert schon – er wird zusätzlich angelegt.'**
  String get planExists;

  /// No description provided for @importNewExercises.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Übung wird neu angelegt:} other{{count} Übungen werden neu angelegt:}}'**
  String importNewExercises(int count);

  /// No description provided for @importSkippedRows.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Zeile wird übersprungen:} other{{count} Zeilen werden übersprungen:}}'**
  String importSkippedRows(int count);

  /// No description provided for @line.
  ///
  /// In de, this message translates to:
  /// **'Zeile {n}'**
  String line(int n);

  /// No description provided for @importConfirm.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Plan importieren} other{{count} Pläne importieren}}'**
  String importConfirm(int count);

  /// No description provided for @plansImported.
  ///
  /// In de, this message translates to:
  /// **'{count, plural, =1{1 Plan importiert} other{{count} Pläne importiert}}'**
  String plansImported(int count);

  /// No description provided for @csvEmpty.
  ///
  /// In de, this message translates to:
  /// **'Die Datei enthält keine Daten'**
  String get csvEmpty;

  /// No description provided for @csvTooBig.
  ///
  /// In de, this message translates to:
  /// **'Die Datei ist größer als {kb} KB'**
  String csvTooBig(String kb);

  /// No description provided for @csvBinary.
  ///
  /// In de, this message translates to:
  /// **'Das ist keine CSV-Datei'**
  String get csvBinary;

  /// No description provided for @csvNotUtf8.
  ///
  /// In de, this message translates to:
  /// **'Die Datei ist nicht UTF-8-kodiert – bitte als UTF-8-CSV speichern'**
  String get csvNotUtf8;

  /// No description provided for @csvUnreadable.
  ///
  /// In de, this message translates to:
  /// **'Die Datei konnte nicht als CSV gelesen werden'**
  String get csvUnreadable;

  /// No description provided for @csvMissingColumns.
  ///
  /// In de, this message translates to:
  /// **'Kopfzeile unvollständig, es fehlt: {columns}'**
  String csvMissingColumns(String columns);

  /// No description provided for @csvUnknownColumns.
  ///
  /// In de, this message translates to:
  /// **'Unbekannte Spalte(n): {columns}'**
  String csvUnknownColumns(String columns);

  /// No description provided for @csvDuplicateColumns.
  ///
  /// In de, this message translates to:
  /// **'Die Kopfzeile enthält doppelte Spalten'**
  String get csvDuplicateColumns;

  /// No description provided for @csvTooManyRows.
  ///
  /// In de, this message translates to:
  /// **'Die Datei hat mehr als {n} Zeilen'**
  String csvTooManyRows(String n);

  /// No description provided for @csvTooManyPlans.
  ///
  /// In de, this message translates to:
  /// **'Die Datei enthält mehr als {n} Pläne'**
  String csvTooManyPlans(String n);

  /// No description provided for @csvNoValidRows.
  ///
  /// In de, this message translates to:
  /// **'Die Datei enthält keine gültigen Zeilen'**
  String get csvNoValidRows;

  /// No description provided for @rowPlanNameEmpty.
  ///
  /// In de, this message translates to:
  /// **'Planname fehlt'**
  String get rowPlanNameEmpty;

  /// No description provided for @rowPlanNameTooLong.
  ///
  /// In de, this message translates to:
  /// **'Planname zu lang'**
  String get rowPlanNameTooLong;

  /// No description provided for @rowPlanNameInvalid.
  ///
  /// In de, this message translates to:
  /// **'Planname enthält unerlaubte Zeichen'**
  String get rowPlanNameInvalid;

  /// No description provided for @rowExerciseNameEmpty.
  ///
  /// In de, this message translates to:
  /// **'Übungsname fehlt'**
  String get rowExerciseNameEmpty;

  /// No description provided for @rowExerciseNameTooLong.
  ///
  /// In de, this message translates to:
  /// **'Übungsname zu lang'**
  String get rowExerciseNameTooLong;

  /// No description provided for @rowExerciseNameInvalid.
  ///
  /// In de, this message translates to:
  /// **'Übungsname enthält unerlaubte Zeichen'**
  String get rowExerciseNameInvalid;

  /// No description provided for @rowOrderNotNumber.
  ///
  /// In de, this message translates to:
  /// **'order_index ist keine ganze Zahl'**
  String get rowOrderNotNumber;

  /// No description provided for @rowOrderOutOfRange.
  ///
  /// In de, this message translates to:
  /// **'order_index außerhalb von 0–10000'**
  String get rowOrderOutOfRange;

  /// No description provided for @rowNotesTooLong.
  ///
  /// In de, this message translates to:
  /// **'Notiz länger als 500 Zeichen'**
  String get rowNotesTooLong;

  /// No description provided for @rowTooManyItems.
  ///
  /// In de, this message translates to:
  /// **'mehr als 200 Übungen im Plan'**
  String get rowTooManyItems;

  /// No description provided for @weightTitle.
  ///
  /// In de, this message translates to:
  /// **'Körpergewicht'**
  String get weightTitle;

  /// No description provided for @weightToday.
  ///
  /// In de, this message translates to:
  /// **'Gewicht eintragen'**
  String get weightToday;

  /// No description provided for @weightKg.
  ///
  /// In de, this message translates to:
  /// **'Gewicht'**
  String get weightKg;

  /// No description provided for @weightSaved.
  ///
  /// In de, this message translates to:
  /// **'Gewicht gespeichert'**
  String get weightSaved;

  /// No description provided for @weightCurrent.
  ///
  /// In de, this message translates to:
  /// **'Aktuell'**
  String get weightCurrent;

  /// No description provided for @weightStart.
  ///
  /// In de, this message translates to:
  /// **'Start'**
  String get weightStart;

  /// No description provided for @weightTrend.
  ///
  /// In de, this message translates to:
  /// **'Trend 7 Tage'**
  String get weightTrend;

  /// No description provided for @weightChartTitle.
  ///
  /// In de, this message translates to:
  /// **'Verlauf'**
  String get weightChartTitle;

  /// No description provided for @weightChartMin.
  ///
  /// In de, this message translates to:
  /// **'Mindestens 2 Einträge für den Verlauf nötig'**
  String get weightChartMin;

  /// No description provided for @weightEntries.
  ///
  /// In de, this message translates to:
  /// **'Einträge'**
  String get weightEntries;

  /// No description provided for @weightDeleteConfirm.
  ///
  /// In de, this message translates to:
  /// **'Eintrag vom {date} löschen?'**
  String weightDeleteConfirm(String date);

  /// No description provided for @localDataInfo.
  ///
  /// In de, this message translates to:
  /// **'Alle Daten bleiben auf diesem Gerät. Kein Konto, keine Verbindung ins Internet.'**
  String get localDataInfo;

  /// No description provided for @profileTitle.
  ///
  /// In de, this message translates to:
  /// **'Mein Profil'**
  String get profileTitle;

  /// No description provided for @changeName.
  ///
  /// In de, this message translates to:
  /// **'Name ändern'**
  String get changeName;

  /// No description provided for @yourName.
  ///
  /// In de, this message translates to:
  /// **'Dein Name'**
  String get yourName;

  /// No description provided for @nameSaved.
  ///
  /// In de, this message translates to:
  /// **'Name gespeichert'**
  String get nameSaved;

  /// No description provided for @changeAvatar.
  ///
  /// In de, this message translates to:
  /// **'Profilbild ändern'**
  String get changeAvatar;

  /// No description provided for @removeAvatar.
  ///
  /// In de, this message translates to:
  /// **'Profilbild entfernen'**
  String get removeAvatar;

  /// No description provided for @avatarUpdated.
  ///
  /// In de, this message translates to:
  /// **'Profilbild aktualisiert'**
  String get avatarUpdated;

  /// No description provided for @avatarTooBig.
  ///
  /// In de, this message translates to:
  /// **'Bild zu groß (max. 5 MB)'**
  String get avatarTooBig;

  /// No description provided for @trainingSettings.
  ///
  /// In de, this message translates to:
  /// **'Training'**
  String get trainingSettings;

  /// No description provided for @appearance.
  ///
  /// In de, this message translates to:
  /// **'Darstellung'**
  String get appearance;

  /// No description provided for @themeSystem.
  ///
  /// In de, this message translates to:
  /// **'System'**
  String get themeSystem;

  /// No description provided for @themeLight.
  ///
  /// In de, this message translates to:
  /// **'Hell'**
  String get themeLight;

  /// No description provided for @themeDark.
  ///
  /// In de, this message translates to:
  /// **'Dunkel'**
  String get themeDark;

  /// No description provided for @dataTitle.
  ///
  /// In de, this message translates to:
  /// **'Daten'**
  String get dataTitle;

  /// No description provided for @backupTitle.
  ///
  /// In de, this message translates to:
  /// **'Sicherung speichern'**
  String get backupTitle;

  /// No description provided for @backupSub.
  ///
  /// In de, this message translates to:
  /// **'Alle Daten als JSON-Datei, z. B. für ein neues Handy'**
  String get backupSub;

  /// No description provided for @backupFilePrefix.
  ///
  /// In de, this message translates to:
  /// **'ironbandit_sicherung'**
  String get backupFilePrefix;

  /// No description provided for @backupSaved.
  ///
  /// In de, this message translates to:
  /// **'Sicherung gespeichert'**
  String get backupSaved;

  /// No description provided for @restoreTitle.
  ///
  /// In de, this message translates to:
  /// **'Sicherung wiederherstellen'**
  String get restoreTitle;

  /// No description provided for @restoreSub.
  ///
  /// In de, this message translates to:
  /// **'Ersetzt alle Daten auf diesem Gerät'**
  String get restoreSub;

  /// No description provided for @restoreConfirm.
  ///
  /// In de, this message translates to:
  /// **'Sicherung{date} wiederherstellen? Alle aktuellen Daten auf diesem Gerät werden ersetzt.'**
  String restoreConfirm(String date);

  /// No description provided for @restoreAction.
  ///
  /// In de, this message translates to:
  /// **'Wiederherstellen'**
  String get restoreAction;

  /// No description provided for @restoreDone.
  ///
  /// In de, this message translates to:
  /// **'Sicherung wiederhergestellt'**
  String get restoreDone;

  /// No description provided for @backupFrom.
  ///
  /// In de, this message translates to:
  /// **'vom {date}'**
  String backupFrom(String date);

  /// No description provided for @backupInvalid.
  ///
  /// In de, this message translates to:
  /// **'Das ist keine gültige IronBandit-Sicherung'**
  String get backupInvalid;

  /// No description provided for @backupTooNew.
  ///
  /// In de, this message translates to:
  /// **'Die Sicherung stammt aus einer neueren App-Version – bitte erst die App aktualisieren'**
  String get backupTooNew;

  /// No description provided for @historyImportTitle.
  ///
  /// In de, this message translates to:
  /// **'Trainings aus CSV übernehmen'**
  String get historyImportTitle;

  /// No description provided for @historyImportSub.
  ///
  /// In de, this message translates to:
  /// **'Export der IronBandit-Web-App oder dieser App; vorhandene Einträge bleiben'**
  String get historyImportSub;

  /// No description provided for @historyImported.
  ///
  /// In de, this message translates to:
  /// **'{logs} Übungen mit {sets} Sätzen und {weights} Gewichtseinträge übernommen'**
  String historyImported(int logs, int sets, int weights);

  /// No description provided for @historyNothingNew.
  ///
  /// In de, this message translates to:
  /// **'Nichts Neues – alles war schon da'**
  String get historyNothingNew;

  /// No description provided for @historyInvalid.
  ///
  /// In de, this message translates to:
  /// **'Das ist kein IronBandit-CSV-Export'**
  String get historyInvalid;

  /// No description provided for @exportTitle.
  ///
  /// In de, this message translates to:
  /// **'Als CSV exportieren'**
  String get exportTitle;

  /// No description provided for @exportSub.
  ///
  /// In de, this message translates to:
  /// **'Trainings und Körpergewicht für Tabellen'**
  String get exportSub;

  /// No description provided for @exportSaved.
  ///
  /// In de, this message translates to:
  /// **'Export gespeichert'**
  String get exportSaved;

  /// No description provided for @deleteAllData.
  ///
  /// In de, this message translates to:
  /// **'Alle Daten löschen'**
  String get deleteAllData;

  /// No description provided for @deleteAllDataSub.
  ///
  /// In de, this message translates to:
  /// **'Trainings, Pläne, Übungen und Gewicht auf diesem Gerät'**
  String get deleteAllDataSub;

  /// No description provided for @deleteWarning.
  ///
  /// In de, this message translates to:
  /// **'Löscht alle Trainings, Pläne, eigenen Übungen und Gewichtseinträge auf diesem Gerät. Das lässt sich nicht rückgängig machen – speichere vorher eine Sicherung, wenn du die Daten behalten willst.'**
  String get deleteWarning;

  /// No description provided for @deleteConfirmWord.
  ///
  /// In de, this message translates to:
  /// **'LÖSCHEN'**
  String get deleteConfirmWord;

  /// No description provided for @deleteConfirmLabel.
  ///
  /// In de, this message translates to:
  /// **'Zum Bestätigen „{word}“ eingeben'**
  String deleteConfirmLabel(String word);

  /// No description provided for @deleteFinal.
  ///
  /// In de, this message translates to:
  /// **'Endgültig löschen'**
  String get deleteFinal;

  /// No description provided for @allDataDeleted.
  ///
  /// In de, this message translates to:
  /// **'Alle Daten gelöscht'**
  String get allDataDeleted;

  /// No description provided for @license.
  ///
  /// In de, this message translates to:
  /// **'Freie Software unter der GNU AGPL-3.0'**
  String get license;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['de', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'de':
      return AppLocalizationsDe();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
