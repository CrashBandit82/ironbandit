import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/api.dart';
import '../data/models.dart';
import 'rest_bar.dart';
import 'theme.dart';
import 'widgets.dart';

/// Opens one entry for live logging: sets (weight × reps) or cardio values,
/// the lasting exercise note and the rest timer. Inside a workout, [workout]
/// allows paging through its exercises and marking them done.
Future<void> openLog(BuildContext context, int logId, {Workout? workout}) =>
    showSheet<void>(context, (_) => _LogSheet(logId: logId, workout: workout));

class _LogSheet extends StatefulWidget {
  const _LogSheet({required this.logId, this.workout});

  final int logId;
  final Workout? workout;

  @override
  State<_LogSheet> createState() => _LogSheetState();
}

class _LogSheetState extends State<_LogSheet> {
  late int _logId = widget.logId;
  LogEntry? _log;
  LastSets _last = const LastSets(null, []);
  Exercise? _exercise;
  late final Map<int, bool> _done = {for (final e in widget.workout?.entries ?? <WorkoutEntry>[]) e.log.id: e.done};

  final _weight = TextEditingController();
  final _reps = TextEditingController();
  final _duration = TextEditingController();
  final _distance = TextEditingController();
  final _note = TextEditingController();
  Timer? _noteTimer;
  String _savedNote = '';
  var _noteSaved = false;
  late final Api _api = context.api;
  late int _restSeconds = context.session.settings.restSeconds;
  var _busy = false;

  List<int> get _order => [for (final e in widget.workout?.entries ?? <WorkoutEntry>[]) e.log.id];

  @override
  void initState() {
    super.initState();
    _api; // the note is saved in dispose, where the context can't look it up
    _load();
  }

  @override
  void dispose() {
    _flushNote(disposing: true);
    _weight.dispose();
    _reps.dispose();
    _duration.dispose();
    _distance.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.api;
    final log = await api.log(_logId);
    final exercise = log.exerciseId == null ? null : await api.exercise(log.exerciseId!);
    final last = exercise == null || log.isCardio
        ? const LastSets(null, [])
        : await api.lastSets(exercise.id, excludeLogId: log.id);
    if (!mounted) return;
    setState(() {
      _log = log;
      _exercise = exercise;
      _last = last;
      _savedNote = exercise?.note ?? '';
      _note.text = _savedNote;
      _noteSaved = false;
      _duration.text = log.durationMin == null ? '' : fmtNum(context, log.durationMin!);
      _distance.text = log.distanceKm == null ? '' : fmtNum(context, log.distanceKm!, 2);
      _prefill();
    });
  }

  /// Next set starts with the values of the previous set, or of the same set
  /// last time; they are still entered live, this only saves typing.
  void _prefill() {
    final log = _log!;
    final prev = log.sets.isNotEmpty ? log.sets.last : _lastFor(log.sets.length + 1);
    _reps.text = prev == null ? '' : '${prev.reps}';
    _weight.text = prev?.weightKg == null ? '' : fmtNum(context, prev!.weightKg!, 2);
  }

  WorkoutSet? _lastFor(int setNumber) {
    for (final s in _last.sets) {
      if (s.setNumber == setNumber) return s;
    }
    return null;
  }

  void _onNote(String _) {
    setState(() => _noteSaved = false);
    _noteTimer?.cancel();
    _noteTimer = Timer(const Duration(seconds: 1), () {
      if (mounted) _flushNote();
    });
  }

  void _flushNote({bool disposing = false}) {
    _noteTimer?.cancel();
    final id = _exercise?.id;
    final text = _note.text.trim();
    if (id == null || text == _savedNote) return;
    _savedNote = text;
    unawaited(_api.setExerciseNote(id, text));
    if (!disposing) setState(() => _noteSaved = true);
  }

  Future<void> _addSet() async {
    final reps = int.tryParse(_reps.text.trim());
    final kg = parseNum(_weight.text);
    if (reps == null || reps <= 0) {
      showMsg(context, context.t.repsRequired, error: true);
      return;
    }
    if (_weight.text.trim().isNotEmpty && (kg == null || kg < 0)) {
      showMsg(context, context.t.invalidNumber, error: true);
      return;
    }
    setState(() => _busy = true);
    final session = context.session;
    final t = context.t;
    final log = await context.api.addSet(_logId, reps, kg);
    if (!mounted) return;
    setState(() {
      _log = log;
      _busy = false;
    });
    session.rest.start(
      _restSeconds,
      notify: session.settings.restNotify,
      texts: (
        title: t.restNotifyTitle,
        body: t.restNotifyBody(log.exerciseName, log.sets.length + 1),
        channel: t.restChannel,
      ),
    );
  }

  Future<void> _editSet(WorkoutSet s) async {
    final result = await showDialog<(int, double?)?>(
      context: context,
      builder: (_) => _SetDialog(set: s),
    );
    if (result == null || !mounted) return;
    final log = await context.api.updateSet(_logId, s.id, result.$1, result.$2);
    if (mounted) setState(() => _log = log);
  }

  Future<void> _deleteSet(WorkoutSet s) async {
    final log = await context.api.deleteSet(_logId, s.id);
    if (!mounted) return;
    setState(() {
      _log = log;
      _prefill();
    });
  }

  Future<void> _saveCardio() async {
    final d = parseNum(_duration.text);
    final km = parseNum(_distance.text);
    final log = await context.api.setCardio(_logId, d != null && d > 0 ? d : null, km != null && km > 0 ? km : null);
    if (mounted) setState(() => _log = log);
  }

  Future<void> _go(int logId) async {
    _flushNote();
    if (_log!.isCardio) await _saveCardio();
    setState(() {
      _logId = logId;
      _log = null;
    });
    await _load();
  }

  Future<void> _toggleDone() async {
    final w = widget.workout!;
    final done = !(_done[_logId] ?? false);
    if (_log!.isCardio) await _saveCardio();
    if (!mounted) return;
    await context.api.setEntryDone(w.id, _logId, done);
    if (!mounted) return;
    setState(() => _done[_logId] = done);
    if (!done) return;
    // on to the next open exercise
    final order = _order;
    final i = order.indexOf(_logId);
    for (final id in [...order.sublist(i + 1), ...order.sublist(0, i)]) {
      if (!(_done[id] ?? false)) return _go(id);
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _pickRest() async {
    final t = context.t;
    final picked = await showDialog<(int, bool)>(
      context: context,
      builder: (_) => RestDurationDialog(initial: _restSeconds),
    );
    if (picked == null || !mounted) return;
    setState(() => _restSeconds = picked.$1);
    if (picked.$2) {
      final session = context.session;
      await session.api.setRestSeconds(picked.$1);
      await session.reloadSettings();
      if (mounted) showMsg(context, t.restDefaultSaved);
    }
  }

  @override
  Widget build(BuildContext context) {
    final log = _log;
    final t = context.t;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop && log != null && log.isCardio) unawaited(_saveCardio());
      },
      child: log == null
          ? const SizedBox(height: 240, child: Center(child: CircularProgressIndicator()))
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (widget.workout != null) _pager(context),
                  Text(log.exerciseName, style: context.tt.titleLarge),
                  if (_last.day != null && !log.isCardio) _lastHint(context),
                  const SizedBox(height: 14),
                  if (log.isCardio) _cardio(context) else ..._strength(context, log),
                  if (_exercise != null) ...[const SizedBox(height: 16), _noteField(context)],
                  if (widget.workout != null) ...[
                    const SizedBox(height: 16),
                    (_done[_logId] ?? false)
                        ? OutlinedButton.icon(
                            onPressed: _toggleDone,
                            icon: const Icon(Icons.undo),
                            label: Text(t.reopenExercise),
                          )
                        // secondary to "log set": the set is the main action while training
                        : OutlinedButton.icon(
                            onPressed: _toggleDone,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: context.c.success,
                              side: BorderSide(color: context.c.success.withValues(alpha: 0.6)),
                            ),
                            icon: const Icon(Icons.check),
                            label: Text(t.completeExercise),
                          ),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _pager(BuildContext context) {
    final t = context.t;
    final order = _order;
    final i = order.indexOf(_logId);
    return Row(
      children: [
        IconButton(
          tooltip: t.prevExercise,
          onPressed: i > 0 ? () => _go(order[i - 1]) : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: Text(
            t.exercisePosition(i + 1, order.length),
            textAlign: TextAlign.center,
            style: context.tt.labelMedium,
          ),
        ),
        IconButton(
          tooltip: t.nextExercise,
          onPressed: i < order.length - 1 ? () => _go(order[i + 1]) : null,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }

  Widget _lastHint(BuildContext context) {
    final date = DateFormat.MMMEd(context.locale).format(_last.day!);
    final sets = _last.sets.map((s) => fmtSet(context, s.reps, s.weightKg)).join(' · ');
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text('${context.t.lastTraining} ($date): $sets', style: context.tt.bodySmall),
    );
  }

  List<Widget> _strength(BuildContext context, LogEntry log) {
    final t = context.t;
    final c = context.c;
    final next = _lastFor(log.sets.length + 1);
    return [
      if (log.sets.isNotEmpty)
        DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: c.border),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            children: [
              for (final (i, s) in log.sets.indexed) ...[
                if (i > 0) const Divider(),
                InkWell(
                  onTap: () => _editSet(s),
                  child: Padding(
                    padding: const EdgeInsets.only(left: 14),
                    child: Row(
                      children: [
                        SizedBox(width: 64, child: Text(t.setLabel(s.setNumber), style: context.tt.labelMedium)),
                        Expanded(
                          child: Text(
                            fmtSet(context, s.reps, s.weightKg),
                            style: context.tt.titleSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                          ),
                        ),
                        IconButton(
                          tooltip: t.deleteSet,
                          onPressed: () => _deleteSet(s),
                          icon: Icon(Icons.close, size: 20, color: c.muted),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      const SizedBox(height: 12),
      Text(
        next == null
            ? t.setLabel(log.sets.length + 1)
            : '${t.setLabel(log.sets.length + 1)} · ${t.lastTime}: ${fmtSet(context, next.reps, next.weightKg)}',
        style: context.tt.labelMedium,
      ),
      const SizedBox(height: 6),
      Row(
        children: [
          Expanded(child: _bigField(context, _weight, t.weightKgLabel, decimal: true)),
          const SizedBox(width: 10),
          Expanded(child: _bigField(context, _reps, t.repsLabel)),
        ],
      ),
      const SizedBox(height: 10),
      GradientButton(label: t.addSet, icon: Icons.add, height: 52, busy: _busy, onPressed: _addSet),
      const SizedBox(height: 10),
      const RestPanel(),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: _pickRest,
          icon: const Icon(Icons.timer_outlined, size: 18),
          label: Text(t.restAfterSet(fmtDuration(_restSeconds))),
        ),
      ),
    ];
  }

  Widget _cardio(BuildContext context) {
    final t = context.t;
    return Row(
      children: [
        Expanded(child: _bigField(context, _duration, t.durationLabel, decimal: true, onDone: _saveCardio)),
        const SizedBox(width: 10),
        Expanded(child: _bigField(context, _distance, t.distanceLabel, decimal: true, onDone: _saveCardio)),
      ],
    );
  }

  Widget _bigField(
    BuildContext context,
    TextEditingController ctrl,
    String label, {
    bool decimal = false,
    String? suffix,
    VoidCallback? onDone,
  }) => Focus(
    onFocusChange: (has) {
      if (!has) onDone?.call();
    },
    child: TextField(
      controller: ctrl,
      textAlign: TextAlign.center,
      keyboardType: TextInputType.numberWithOptions(decimal: decimal),
      style: context.tt.headlineSmall!.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      decoration: InputDecoration(labelText: label, suffixText: suffix),
      onSubmitted: (_) => onDone?.call(),
    ),
  );

  Widget _noteField(BuildContext context) {
    final t = context.t;
    return TextField(
      controller: _note,
      minLines: 1,
      maxLines: 4,
      maxLength: 500,
      textCapitalization: TextCapitalization.sentences,
      onChanged: _onNote,
      onTapOutside: (_) => _flushNote(),
      decoration: InputDecoration(
        labelText: t.noteLabel,
        hintText: t.notePlaceholder,
        helperText: _noteSaved ? t.noteSaved : null,
        counterText: '',
      ),
    );
  }
}

/// Edits weight and reps of a logged set.
class _SetDialog extends StatefulWidget {
  const _SetDialog({required this.set});

  final WorkoutSet set;

  @override
  State<_SetDialog> createState() => _SetDialogState();
}

class _SetDialogState extends State<_SetDialog> {
  late final _reps = TextEditingController(text: '${widget.set.reps}');
  late final _weight = TextEditingController(
    text: widget.set.weightKg == null ? '' : fmtNum(context, widget.set.weightKg!, 2),
  );

  @override
  void dispose() {
    _reps.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _save() {
    final reps = int.tryParse(_reps.text.trim());
    final kg = parseNum(_weight.text);
    if (reps == null || reps <= 0 || (_weight.text.trim().isNotEmpty && (kg == null || kg < 0))) {
      showMsg(context, context.t.invalidNumber, error: true);
      return;
    }
    Navigator.pop(context, (reps, kg));
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return AlertDialog(
      title: Text(t.setLabel(widget.set.setNumber)),
      content: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _weight,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: t.weightKgLabel),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: _reps,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: t.repsLabel),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(t.cancel)),
        TextButton(onPressed: _save, child: Text(t.save)),
      ],
    );
  }
}

/// Picks a rest duration; pops with (seconds, save as default).
class RestDurationDialog extends StatefulWidget {
  const RestDurationDialog({super.key, required this.initial, this.askDefault = true});

  final int initial;
  final bool askDefault;

  @override
  State<RestDurationDialog> createState() => _RestDurationDialogState();
}

class _RestDurationDialogState extends State<RestDurationDialog> {
  static const presets = [30, 45, 60, 90, 120, 150, 180, 240, 300];
  late int _seconds = widget.initial;
  var _asDefault = false;

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = context.c;
    return AlertDialog(
      title: Text(t.restDuration),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in presets)
                ChoiceChip(
                  label: Text(fmtDuration(s)),
                  selected: _seconds == s,
                  showCheckmark: false,
                  selectedColor: c.navIndicator,
                  labelStyle: TextStyle(color: _seconds == s ? Colors.white : c.soft, fontWeight: FontWeight.w700),
                  onSelected: (_) => setState(() => _seconds = s),
                ),
            ],
          ),
          if (widget.askDefault)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _asDefault,
              title: Text(t.saveAsDefault),
              onChanged: (v) => setState(() => _asDefault = v ?? false),
            ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(t.cancel)),
        TextButton(onPressed: () => Navigator.pop(context, (_seconds, _asDefault)), child: Text(t.ok)),
      ],
    );
  }
}
