import 'dart:ui';

import 'package:flutter/material.dart';

import 'api.dart';
import 'db.dart';
import 'device.dart';
import 'models.dart';

/// Data access and settings; the app rebuilds on changes.
class Session extends ChangeNotifier {
  Api? _api;
  Settings? _settings;

  /// Set when the database could not be opened.
  Object? error;

  bool get ready => _settings != null;
  Api get api => _api!;
  Settings get settings => _settings!;

  ThemeMode themeMode = ThemeMode.system;

  /// The running break; listened to separately, it ticks several times a second.
  final rest = RestTimer();

  static bool get _german => PlatformDispatcher.instance.locale.languageCode == 'de';

  Future<void> start() async {
    try {
      _api = Api(await openAppDatabase());
      _api!.seedExercises(german: _german);
      themeMode = ThemeMode.values.firstWhere((m) => m.name == _api!.themeMode, orElse: () => ThemeMode.system);
      _settings = await _api!.settings();
    } on Object catch (e) {
      error = e;
    }
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    notifyListeners();
    await api.setThemeMode(mode.name);
  }

  Future<void> reloadSettings() async {
    _settings = await api.settings();
    notifyListeners();
  }

  /// Bumped when data changed elsewhere (workout started, backup restored,
  /// everything deleted), so the screens reload.
  int dataRevision = 0;

  void dataChanged() {
    dataRevision++;
    notifyListeners();
  }

  Future<void> dataReplaced() async {
    dataRevision++;
    await reloadSettings();
  }

  Future<void> deleteAllData() => api.deleteAllData(german: _german);
}

class SessionScope extends InheritedNotifier<Session> {
  const SessionScope({super.key, required Session session, required super.child}) : super(notifier: session);

  static Session of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<SessionScope>()!.notifier!;

  /// Without rebuild dependency (for callbacks).
  static Session read(BuildContext context) =>
      (context.getElementForInheritedWidgetOfExactType<SessionScope>()!.widget as SessionScope).notifier!;
}
