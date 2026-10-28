import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/device.dart';
import '../data/models.dart';
import '../data/session.dart';
import 'exercise_picker.dart';
import 'log_sheet.dart';
import 'plans.dart';
import 'theme.dart';
import 'widgets.dart';

/// Day view: running workout, week, plans and the entries of the chosen day.
class TrainingTab extends StatefulWidget {
  const TrainingTab({super.key});

  @override
  State<TrainingTab> createState() => _TrainingTabState();
}

class _TrainingTabState extends State<TrainingTab> {
  DateTime _day = _today;
  List<LogEntry>? _logs;
  List<Workout> _finished = [];
  Workout? _workout;
  WeekStats? _week;
  List<Stagnation> _stagnating = [];
  List<Plan> _plans = [];
  Object? _error;
  Timer? _clock;
  int _revision = -1;

  static DateTime get _today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  bool get _isToday => _day == _today;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // reload when a workout was started or data changed elsewhere
    final revision = SessionScope.of(context).dataRevision;
    if (revision != _revision) {
      _revision = revision;
      _load();
    }
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.api;
    try {
      final day = _day;
      final logs = await api.logs(day);
      final finished = await api.workouts(day);
      final workout = await api.activeWorkout();
      final week = await api.week();
      final stagnating = await api.stagnating();
      final plans = await api.plans();
      if (!mounted || day != _day) return;
      setState(() {
        _logs = logs;
        _finished = finished;
        _workout = workout;
        _week = week;
        _stagnating = stagnating;
        _plans = plans;
        _error = null;
      });
      _clock?.cancel();
      if (workout != null) _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
      await keepScreenOn(workout != null);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _setDay(DateTime d) {
    setState(() {
      _day = d;
      _logs = null;
    });
    _load();
  }

  Future<void> _addExercise() async {
    final e = await pickExercise(context);
    if (e == null || !mounted) return;
    final log = await context.api.addLog(e.id, _day);
    if (!mounted) return;
    final workout = _isToday ? await context.api.activeWorkout() : null;
    if (!mounted) return;
    await openLog(context, log.id, workout: workout);
    if (!mounted) return;
    // an entry left without values outside a workout is dropped again
    final api = context.api;
    final saved = await api.log(log.id);
    if (saved.isEmpty && workout == null) await api.deleteLog(log.id);
    await _load();
  }

  Future<void> _open(LogEntry log, {Workout? workout}) async {
    await openLog(context, log.id, workout: workout);
    await _load();
  }

  Future<void> _deleteLog(LogEntry log) async {
    if (!await confirm(context, context.t.deleteEntryConfirm(log.exerciseName))) return;
    if (!mounted) return;
    await context.api.deleteLog(log.id);
    await _load();
  }

  Future<void> _startPlan(Plan p) async {
    if (p.items.isEmpty) {
      showMsg(context, context.t.planEmpty, error: true);
      return;
    }
    final w = await context.api.startPlan(p.id);
    if (!mounted) return;
    if (_day != _today) _day = _today;
    await _load();
    if (!mounted) return;
    final first = w.entries.firstWhere((e) => !e.done, orElse: () => w.entries.first);
    await _open(first.log, workout: w);
  }

  Future<void> _finish() async {
    final w = _workout!;
    final t = context.t;
    if (w.doneCount < w.entries.length &&
        !await confirm(
          context,
          t.finishOpenConfirm,
          action: t.finishWorkout,
          cancel: t.keepTraining,
          destructive: false,
        )) {
      return;
    }
    if (!mounted) return;
    final session = context.session;
    final done = await session.api.finishWorkout(w.id);
    session.rest.skip();
    if (mounted) showMsg(context, t.workoutFinished(fmtDuration(done.durationSec ?? 0)));
    await _load();
  }

  Future<void> _cancel() async {
    final t = context.t;
    if (!await confirm(context, t.cancelWorkoutConfirm, action: t.cancelWorkout, cancel: t.keepTraining)) return;
    if (!mounted) return;
    final session = context.session;
    final removed = await session.api.cancelWorkout(_workout!.id);
    session.rest.skip();
    if (mounted) showMsg(context, t.workoutCancelled(removed));
    await _load();
  }

  Future<void> _editGoal() async {
    final t = context.t;
    final v = await showDialog<String>(
      context: context,
      builder: (_) =>
          PromptDialog(title: t.weeklyGoal, label: t.workoutsPerWeek, initial: '${_week?.goal ?? 4}', numeric: true),
    );
    final n = int.tryParse(v?.trim() ?? '');
    if (n == null || n < 1 || !mounted) return;
    final session = context.session;
    await session.api.setWeeklyGoal(n);
    await session.reloadSettings();
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final logs = _logs;
    final inWorkout = {for (final e in _workout?.entries ?? <WorkoutEntry>[]) e.log.id};
    final dayLogs = [
      for (final l in logs ?? <LogEntry>[])
        if (!_isToday || !inWorkout.contains(l.id)) l,
    ];
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add',
        backgroundColor: context.c.navIndicator,
        onPressed: _addExercise,
        icon: const Icon(Icons.add),
        label: Text(t.addExercise),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              PageWidth(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _header(context),
                    const SizedBox(height: 12),
                    if (logs == null)
                      LoadState(error: _error, onRetry: _load)
                    else ...[
                      if (_isToday && _workout != null) ...[
                        _workoutCard(context, _workout!),
                        const SizedBox(height: 16),
                      ],
                      if (_isToday && _week != null) ...[_weekCard(context, _week!), const SizedBox(height: 16)],
                      if (_isToday && _workout == null) ...[
                        PlansSection(plans: _plans, onStart: _startPlan, onChanged: _load),
                        const SizedBox(height: 16),
                      ],
                      SectionLabel(_isToday ? t.todayEntries : t.entries),
                      for (final w in _finished) _finishedChip(context, w),
                      if (dayLogs.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 20),
                          child: Text(
                            inWorkout.isNotEmpty ? t.noOtherEntries : (_isToday ? t.noEntries : t.noEntriesDay),
                            textAlign: TextAlign.center,
                            style: TextStyle(color: context.c.muted),
                          ),
                        )
                      else ...[
                        for (final l in dayLogs) ...[_logCard(context, l), const SizedBox(height: 8)],
                        _totals(context, logs),
                      ],
                      if (_isToday && _stagnating.isNotEmpty) ...[const SizedBox(height: 16), _stagnationCard(context)],
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    final t = context.t;
    final yesterday = _today.subtract(const Duration(days: 1));
    final date = DateFormat.MMMMd(context.locale).format(_day);
    final label = _isToday
        ? '${t.today}, $date'
        : _day == yesterday
        ? '${t.yesterday}, $date'
        : DateFormat.yMMMEd(context.locale).format(_day);
    final profile = SessionScope.of(context).profile;
    final dayRow = Row(
      children: [
        Expanded(child: Text(label, style: context.tt.titleSmall)),
        IconButton(
          tooltip: t.prevDay,
          onPressed: () => _setDay(DateTime(_day.year, _day.month, _day.day - 1)),
          icon: const Icon(Icons.chevron_left),
        ),
        if (!_isToday)
          TextButton(onPressed: () => _setDay(_today), child: Text(t.today))
        else
          IconButton(
            tooltip: t.pickDay,
            onPressed: () async {
              final d = await showDatePicker(
                context: context,
                firstDate: DateTime(2000),
                lastDate: _today,
                initialDate: _day,
              );
              if (d != null) _setDay(d);
            },
            icon: const Icon(Icons.calendar_month_outlined),
          ),
        IconButton(
          tooltip: t.nextDay,
          onPressed: _isToday ? null : () => _setDay(DateTime(_day.year, _day.month, _day.day + 1)),
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
    // greeting like MacroBandit, then the day with its navigation
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            UserAvatar(profile: profile, size: 48),
            const SizedBox(width: 12),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  profile.name.isEmpty ? t.greetingNoName : t.greeting(profile.name),
                  style: context.tt.titleLarge,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        dayRow,
      ],
    );
  }

  Widget _workoutCard(BuildContext context, Workout w) {
    final t = context.t;
    final c = context.c;
    final elapsed = DateTime.now().difference(w.startedAt).inSeconds;
    final allDone = w.entries.isNotEmpty && w.doneCount == w.entries.length;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.accent.withValues(alpha: 0.6), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    label: t.currentWorkout,
                    child: Text(w.name ?? t.currentWorkout, style: context.tt.titleLarge),
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      fmtDuration(elapsed),
                      style: context.tt.titleLarge!.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                    Text(t.elapsed, style: context.tt.labelMedium),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Bar(fraction: w.entries.isEmpty ? 0 : w.doneCount / w.entries.length, color: c.success, label: t.progress),
            const SizedBox(height: 4),
            Text(t.progressDone(w.doneCount, w.entries.length), style: context.tt.labelMedium),
            const SizedBox(height: 8),
            for (final e in w.entries) _entryRow(context, w, e),
            const SizedBox(height: 12),
            if (allDone) ...[
              Text(
                t.allDone,
                textAlign: TextAlign.center,
                style: context.tt.titleSmall!.copyWith(color: c.success),
              ),
              const SizedBox(height: 8),
            ],
            GradientButton(label: t.finishWorkout, icon: Icons.flag_outlined, onPressed: _finish),
            TextButton(
              onPressed: _cancel,
              style: TextButton.styleFrom(foregroundColor: c.danger),
              child: Text(t.cancelWorkout),
            ),
          ],
        ),
      ),
    );
  }

  Widget _entryRow(BuildContext context, Workout w, WorkoutEntry e) {
    final c = context.c;
    final t = context.t;
    final log = e.log;
    final summary = e.done
        ? t.completed
        : log.isCardio
        ? (_cardioText(context, log) ?? t.noValuesYet)
        : log.sets.isEmpty
        ? t.noValuesYet
        : t.setsDone(log.sets.length);
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () => _open(log, workout: w),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: e.done ? c.success : c.inset,
                border: e.done ? null : Border.all(color: c.border, width: 1.5),
              ),
              child: e.done ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    log.exerciseName,
                    style: context.tt.titleSmall!.copyWith(
                      color: e.done ? c.muted : c.text,
                      decoration: e.done ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  Text(summary, style: context.tt.bodySmall),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: c.muted),
          ],
        ),
      ),
    );
  }

  String? _cardioText(BuildContext context, LogEntry log) {
    final parts = [
      if (log.durationMin != null) '${fmtNum(context, log.durationMin!)} min',
      if (log.distanceKm != null) '${fmtNum(context, log.distanceKm!, 2)} km',
    ];
    return parts.isEmpty ? null : parts.join(' · ');
  }

  Widget _logCard(BuildContext context, LogEntry log) {
    final c = context.c;
    final t = context.t;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(log),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(log.exerciseName, style: context.tt.titleSmall),
                    const SizedBox(height: 6),
                    if (log.isCardio)
                      Text(
                        _cardioText(context, log) ?? t.noValuesYet,
                        style: context.tt.bodyMedium!.copyWith(color: c.soft),
                      )
                    else if (log.sets.isEmpty)
                      Text(t.noValuesYet, style: context.tt.bodySmall)
                    else
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [for (final s in log.sets) Tag(fmtSet(context, s.reps, s.weightKg), color: c.soft)],
                      ),
                    if (log.volume > 0) ...[
                      const SizedBox(height: 6),
                      Text('${t.volume}: ${fmtNum(context, log.volume)} kg', style: context.tt.bodySmall),
                    ],
                  ],
                ),
              ),
              IconButton(
                tooltip: t.delete,
                onPressed: () => _deleteLog(log),
                icon: Icon(Icons.delete_outline, color: c.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _totals(BuildContext context, List<LogEntry> logs) {
    final t = context.t;
    final sets = logs.fold(0, (n, l) => n + l.sets.length);
    final volume = logs.fold(0.0, (v, l) => v + l.volume);
    final minutes = logs.fold(0.0, (v, l) => v + (l.durationMin ?? 0));
    final parts = [
      t.exercisesCount(logs.length),
      if (sets > 0) t.setsCount(sets),
      if (volume > 0) '${fmtNum(context, volume)} kg',
      if (minutes > 0) '${fmtNum(context, minutes)} min',
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(parts.join(' · '), textAlign: TextAlign.center, style: context.tt.bodySmall),
    );
  }

  Widget _finishedChip(BuildContext context, Workout w) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Row(
      children: [
        Icon(Icons.flag, size: 18, color: context.c.success),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            '${w.name ?? context.t.currentWorkout} · ${fmtDuration(w.durationSec ?? 0)}',
            style: context.tt.bodySmall!.copyWith(color: context.c.soft),
          ),
        ),
      ],
    ),
  );

  Widget _weekCard(BuildContext context, WeekStats w) {
    final t = context.t;
    final c = context.c;
    final change = w.volumeChangePct;
    final days = DateFormat.E(context.locale);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(t.thisWeek, style: context.tt.titleSmall)),
                TextButton(onPressed: _editGoal, child: Text(t.goalShort(w.goal))),
              ],
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                for (final d in w.days)
                  Semantics(
                    label: '${DateFormat.EEEE(context.locale).format(d.date)}: ${d.trained ? t.trained : t.notTrained}',
                    excludeSemantics: true,
                    child: Column(
                      children: [
                        Text(days.format(d.date).substring(0, 2), style: context.tt.labelMedium),
                        const SizedBox(height: 4),
                        Container(
                          width: 30,
                          height: 30,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: d.trained ? Palette.brandGradient : null,
                            color: d.trained ? null : c.inset,
                            border: d.date == _today ? Border.all(color: c.accent, width: 2) : null,
                          ),
                          child: d.trained ? const Icon(Icons.check, size: 16, color: Colors.white) : null,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _stat(
                    context,
                    t.workouts,
                    '${w.sessions} / ${w.goal}',
                    w.sessions >= w.goal ? c.success : c.text,
                  ),
                ),
                Expanded(child: _stat(context, t.volume, _volume(context, w.volumeKg), c.text)),
                Expanded(
                  child: _stat(
                    context,
                    t.vsLastWeek,
                    change == null ? '—' : '${change >= 0 ? '+' : '−'}${fmtNum(context, change.abs(), 0)} %',
                    change == null ? c.muted : (change >= 0 ? c.success : c.warn),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Tonnes from 10 t on, so the week's volume fits its column.
  String _volume(BuildContext context, double kg) =>
      kg >= 10000 ? '${fmtNum(context, kg / 1000)} t' : '${fmtNum(context, kg, 0)} kg';

  Widget _stat(BuildContext context, String label, String value, Color color) => Column(
    children: [
      Text(
        value,
        maxLines: 1,
        softWrap: false,
        style: context.tt.titleMedium!.copyWith(color: color, fontFeatures: const [FontFeature.tabularFigures()]),
      ),
      Text(label, textAlign: TextAlign.center, style: context.tt.labelMedium),
    ],
  );

  Widget _stagnationCard(BuildContext context) {
    final t = context.t;
    final c = context.c;
    return Card(
      color: c.warnBg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: c.warn.withValues(alpha: 0.4)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.visibility_outlined, size: 20, color: c.warn),
                const SizedBox(width: 8),
                Text(t.stagnationTitle, style: context.tt.titleSmall!.copyWith(color: c.warn)),
              ],
            ),
            Text(t.stagnationSub, style: context.tt.bodySmall),
            const SizedBox(height: 8),
            for (final s in _stagnating.take(5))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text(
                  s.byWeight
                      ? t.stagnationWeight(s.exerciseName, s.weeks, fmtNum(context, s.value, 2))
                      : t.stagnationVolume(s.exerciseName, s.weeks),
                  style: context.tt.bodyMedium,
                ),
              ),
            const SizedBox(height: 6),
            Text(t.stagnationHint, style: context.tt.bodySmall),
          ],
        ),
      ),
    );
  }
}
