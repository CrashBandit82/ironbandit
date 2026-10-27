import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/api.dart';
import '../data/device.dart';
import '../data/session.dart';
import 'log_sheet.dart';
import 'theme.dart';
import 'widgets.dart';

/// Settings, backup and the app info.
class MoreTab extends StatelessWidget {
  const MoreTab({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = context.c;
    final session = SessionScope.of(context);
    final settings = session.settings;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: [
          PageWidth(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    ClipOval(child: Image.asset('assets/logo.png', width: 56, height: 56, cacheWidth: 168)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t.appName, style: context.tt.headlineSmall),
                          Text(t.localDataInfo, style: context.tt.bodySmall),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SectionLabel(t.trainingSettings),
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      _item(
                        context,
                        Icons.timer_outlined,
                        t.restDuration,
                        t.restDurationSub(fmtDuration(settings.restSeconds)),
                        () => _restDuration(context),
                      ),
                      const Divider(),
                      SwitchListTile(
                        secondary: const Icon(Icons.notifications_active_outlined),
                        title: Text(t.restNotify),
                        subtitle: Text(t.restNotifySub),
                        value: settings.restNotify,
                        onChanged: (v) async {
                          await session.api.setRestNotify(v);
                          await session.reloadSettings();
                        },
                      ),
                      const Divider(),
                      _item(
                        context,
                        Icons.flag_outlined,
                        t.weeklyGoal,
                        t.goalShort(settings.weeklyGoal),
                        () => _weeklyGoal(context),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SectionLabel(t.appearance),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: SegmentedButton<ThemeMode>(
                      segments: [
                        segment(ThemeMode.system, t.themeSystem),
                        segment(ThemeMode.light, t.themeLight),
                        segment(ThemeMode.dark, t.themeDark),
                      ],
                      selected: {session.themeMode},
                      showSelectedIcon: false,
                      onSelectionChanged: (s) => session.setThemeMode(s.first),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SectionLabel(t.dataTitle),
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      _item(context, Icons.save_outlined, t.backupTitle, t.backupSub, () => _backup(context)),
                      const Divider(),
                      _item(context, Icons.restore, t.restoreTitle, t.restoreSub, () => _restore(context)),
                      const Divider(),
                      _item(context, Icons.download_outlined, t.exportTitle, t.exportSub, () => _export(context)),
                      const Divider(),
                      _item(
                        context,
                        Icons.upload_file_outlined,
                        t.historyImportTitle,
                        t.historyImportSub,
                        () => _importHistory(context),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  clipBehavior: Clip.antiAlias,
                  child: _item(
                    context,
                    Icons.delete_forever_outlined,
                    t.deleteAllData,
                    t.deleteAllDataSub,
                    () => _deleteAll(context),
                    danger: true,
                  ),
                ),
                const SizedBox(height: 28),
                Center(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: 'Crash',
                          style: TextStyle(color: c.brandLine),
                        ),
                        TextSpan(
                          text: 'Bandit',
                          style: TextStyle(color: c.accent),
                        ),
                        TextSpan(
                          text: '82',
                          style: TextStyle(color: c.faint, fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                    style: context.tt.titleSmall,
                  ),
                ),
                const SizedBox(height: 4),
                Center(
                  child: SelectableText(
                    'github.com/CrashBandit82/ironbandit',
                    style: context.tt.bodySmall!.copyWith(color: c.faint),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  t.license,
                  textAlign: TextAlign.center,
                  style: context.tt.bodySmall!.copyWith(color: c.faint),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _item(
    BuildContext context,
    IconData icon,
    String title,
    String? sub,
    VoidCallback onTap, {
    bool danger = false,
  }) {
    final c = context.c;
    return ListTile(
      leading: Icon(icon, color: danger ? c.danger : null),
      title: Text(title, style: danger ? TextStyle(color: c.danger) : null),
      subtitle: sub == null ? null : Text(sub),
      trailing: Icon(Icons.chevron_right, color: c.faint),
      onTap: onTap,
    );
  }

  Future<void> _restDuration(BuildContext context) async {
    final session = context.session;
    final picked = await showDialog<(int, bool)>(
      context: context,
      builder: (_) => RestDurationDialog(initial: session.settings.restSeconds, askDefault: false),
    );
    if (picked == null) return;
    await session.api.setRestSeconds(picked.$1);
    await session.reloadSettings();
  }

  Future<void> _weeklyGoal(BuildContext context) async {
    final t = context.t;
    final session = context.session;
    final v = await showDialog<String>(
      context: context,
      builder: (_) => PromptDialog(
        title: t.weeklyGoal,
        label: t.workoutsPerWeek,
        initial: '${session.settings.weeklyGoal}',
        numeric: true,
      ),
    );
    final n = int.tryParse(v?.trim() ?? '');
    if (n == null || n < 1) return;
    await session.api.setWeeklyGoal(n);
    await session.reloadSettings();
    session.dataChanged();
  }

  static String get _stamp => DateFormat('yyyyMMdd').format(DateTime.now());

  Future<void> _save(BuildContext context, String name, String mime, Uint8List bytes, String done) async {
    if (await saveFile(name, mime, bytes) && context.mounted) showMsg(context, done);
  }

  Future<void> _export(BuildContext context) async {
    final done = context.t.exportSaved;
    try {
      final csv = await context.api.exportCsv(german: context.german);
      if (context.mounted) await _save(context, 'ironbandit_export_$_stamp.csv', 'text/csv', csv, done);
    } on Object catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  Future<void> _backup(BuildContext context) async {
    final t = context.t;
    try {
      final json = await context.api.exportBackup();
      if (context.mounted) {
        await _save(context, '${t.backupFilePrefix}_$_stamp.json', 'application/json', json, t.backupSaved);
      }
    } on Object catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  Future<void> _restore(BuildContext context) async {
    final t = context.t;
    final session = context.session;
    try {
      final bytes = await openFile();
      if (bytes == null || !context.mounted) return;
      final DateTime? when;
      try {
        when = session.api.checkBackup(bytes);
      } on ApiException catch (e) {
        showMsg(context, e.status == 426 ? t.backupTooNew : t.backupInvalid, error: true);
        return;
      }
      final date = when == null
          ? ''
          : ' ${t.backupFrom(DateFormat.yMMMMd(context.locale).add_Hm().format(when.toLocal()))}';
      if (!await confirm(context, t.restoreConfirm(date), action: t.restoreAction) || !context.mounted) return;
      await session.api.importBackup(bytes);
      session.rest.skip();
      await session.dataReplaced();
      if (context.mounted) showMsg(context, t.restoreDone);
    } on ApiException catch (e) {
      if (context.mounted) showMsg(context, e.status == 426 ? t.backupTooNew : t.backupInvalid, error: true);
    } on Object catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  Future<void> _importHistory(BuildContext context) async {
    final t = context.t;
    final session = context.session;
    try {
      final bytes = await openFile();
      if (bytes == null || !context.mounted) return;
      final r = await session.api.importHistoryCsv(bytes);
      session.dataChanged();
      await session.reloadSettings();
      if (!context.mounted) return;
      showMsg(context, r.logs + r.weights == 0 ? t.historyNothingNew : t.historyImported(r.logs, r.sets, r.weights));
    } on ApiException {
      if (context.mounted) showMsg(context, t.historyInvalid, error: true);
    } on Object catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  Future<void> _deleteAll(BuildContext context) async {
    final ok = await showSheet<bool>(context, (_) => const _DeleteSheet());
    if (ok == true && context.mounted) showMsg(context, context.t.allDataDeleted);
  }
}

class _DeleteSheet extends StatefulWidget {
  const _DeleteSheet();

  @override
  State<_DeleteSheet> createState() => _DeleteSheetState();
}

class _DeleteSheetState extends State<_DeleteSheet> {
  final _word = TextEditingController();
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _word.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _word.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() => _busy = true);
    final session = context.session;
    try {
      await session.deleteAllData();
      session.rest.skip();
      await session.dataReplaced();
      if (mounted) Navigator.pop(context, true);
    } on Object catch (e) {
      if (mounted) {
        showError(context, e);
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final word = t.deleteConfirmWord;
    final ready = _word.text.trim() == word;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(t.deleteAllData, style: context.tt.titleLarge!.copyWith(color: context.c.danger)),
          const SizedBox(height: 12),
          Text(t.deleteWarning, style: TextStyle(color: context.c.soft)),
          const SizedBox(height: 16),
          TextField(
            controller: _word,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: t.deleteConfirmLabel(word)),
          ),
          const SizedBox(height: 20),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB91C1C), foregroundColor: Colors.white),
            onPressed: ready && !_busy ? _delete : null,
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(t.deleteFinal),
          ),
        ],
      ),
    );
  }
}
