import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const _files = MethodChannel('at.ironbandit.app/files');
const _device = MethodChannel('at.ironbandit.app/device');

/// The user picks where to save; false when cancelled.
Future<bool> saveFile(String name, String mime, Uint8List bytes) async =>
    await _files.invokeMethod<bool>('saveFile', {'name': name, 'mime': mime, 'bytes': bytes}) ?? false;

/// The user picks a file; null when cancelled.
Future<Uint8List?> openFile() => _files.invokeMethod<Uint8List>('openFile');

/// Keeps the screen on while a workout runs.
Future<void> keepScreenOn(bool on) async {
  try {
    await _device.invokeMethod<void>('keepScreenOn', {'on': on});
  } on MissingPluginException {
    // tests
  }
}

/// Texts of the "break is over" notification.
typedef RestTexts = ({String title, String body, String channel});

/// The running break. Counts against a fixed end time, so a paused app only
/// delays the display, not the end. The end notification is an Android alarm
/// and comes even when the app is in the background.
class RestTimer extends ChangeNotifier {
  RestTimer({DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  DateTime? _endAt;
  bool _done = false;
  bool _notify = true;
  RestTexts? _texts;
  Timer? _tick;

  /// End of the break, null when no break runs.
  DateTime? get endAt => _endAt;

  /// true for a moment after the break ended ("break is over").
  bool get done => _done;

  bool get running => _endAt != null && !_done;

  int get secondsLeft =>
      _endAt == null || _done ? 0 : (_endAt!.difference(_clock()).inMilliseconds / 1000).ceil().clamp(0, 1 << 20);

  void start(int seconds, {required bool notify, required RestTexts texts}) {
    _notify = notify;
    _texts = texts;
    _done = false;
    _setEnd(_clock().add(Duration(seconds: seconds)));
    if (notify) unawaited(_call('askNotify'));
  }

  /// Longer or shorter by [seconds], at least one second left.
  void adjust(int seconds) {
    if (!running) return;
    final min = _clock().add(const Duration(seconds: 1));
    final end = _endAt!.add(Duration(seconds: seconds));
    _setEnd(end.isBefore(min) ? min : end);
  }

  void skip() {
    _tick?.cancel();
    _endAt = null;
    _done = false;
    unawaited(_call('cancelRest'));
    notifyListeners();
  }

  void _setEnd(DateTime end) {
    _endAt = end;
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) => _onTick());
    if (_notify && _texts != null) {
      unawaited(
        _call('scheduleRest', {
          'at': end.millisecondsSinceEpoch,
          'title': _texts!.title,
          'body': _texts!.body,
          'channel': _texts!.channel,
        }),
      );
    }
    notifyListeners();
  }

  void _onTick() {
    if (_endAt == null) return;
    if (!_done && !_clock().isBefore(_endAt!)) {
      _done = true;
      if (!_notify) unawaited(HapticFeedback.vibrate());
    } else if (_done && _clock().difference(_endAt!) > const Duration(seconds: 3)) {
      _tick?.cancel();
      _endAt = null;
      _done = false;
    }
    notifyListeners();
  }

  Future<void> _call(String method, [Map<String, Object?>? args]) async {
    try {
      await _device.invokeMethod<void>(method, args);
    } on MissingPluginException {
      // tests
    } on PlatformException {
      // no alarm: the in-app display still works
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }
}
