import 'dart:convert';

import 'package:flutter/material.dart';

import '../data/device.dart';
import '../data/models.dart';
import '../data/plan_csv.dart';
import 'exercise_picker.dart';
import 'theme.dart';
import 'widgets.dart';

/// Workout plans with start buttons; create, edit, delete, CSV import/export.
class PlansSection extends StatelessWidget {
  const PlansSection({super.key, required this.plans, required this.onStart, required this.onChanged});

  final List<Plan> plans;
  final void Function(Plan) onStart;
  final VoidCallback onChanged;

  Future<void> _edit(BuildContext context, Plan? plan) async {
    final saved = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => PlanEditor(plan: plan)));
    if (saved ?? false) onChanged();
  }

  Future<void> _delete(BuildContext context, Plan plan) async {
    if (!await confirm(context, context.t.deletePlanConfirm(plan.name)) || !context.mounted) return;
    await context.api.deletePlan(plan.id);
    onChanged();
  }

  Future<void> _menu(BuildContext context, String action) async {
    final t = context.t;
    switch (action) {
      case 'import':
        if (await importPlansCsv(context)) onChanged();
      case 'export':
        if (plans.isEmpty) return showMsg(context, t.noPlans, error: true);
        final csv = await context.api.exportPlansCsv();
        if (await saveFile('ironbandit_plans.csv', 'text/csv', utf8.encode(csv)) && context.mounted) {
          showMsg(context, t.fileSaved);
        }
      case 'sample':
        if (await saveFile(
              'ironbandit_plans_sample.csv',
              'text/csv',
              utf8.encode(samplePlanCsv(german: context.german)),
            ) &&
            context.mounted) {
          showMsg(context, t.fileSaved);
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel(
          t.plansTitle,
          trailing: PopupMenuButton<String>(
            tooltip: t.more,
            icon: Icon(Icons.more_vert, color: c.muted),
            onSelected: (a) => _menu(context, a),
            itemBuilder: (_) => [
              PopupMenuItem(value: 'import', child: Text(t.importPlans)),
              PopupMenuItem(value: 'export', child: Text(t.exportPlans)),
              PopupMenuItem(value: 'sample', child: Text(t.samplePlans)),
            ],
          ),
        ),
        if (plans.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(t.noPlansHint, style: context.tt.bodyMedium!.copyWith(color: c.muted)),
            ),
          ),
        if (plans.isEmpty) const SizedBox(height: 8),
        for (final p in plans) ...[
          Card(
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => _edit(context, p),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.name, style: context.tt.titleSmall),
                          const SizedBox(height: 2),
                          Text(
                            p.items.isEmpty
                                ? t.exercisesCount(0)
                                : '${t.exercisesCount(p.items.length)} · ${p.items.take(3).map((i) => i.exercise.name).join(', ')}${p.items.length > 3 ? ' …' : ''}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: context.tt.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    PopupMenuButton<bool>(
                      tooltip: t.more,
                      icon: Icon(Icons.more_vert, color: c.muted),
                      onSelected: (edit) => edit ? _edit(context, p) : _delete(context, p),
                      itemBuilder: (_) => [
                        PopupMenuItem(value: true, child: Text(t.edit)),
                        PopupMenuItem(value: false, child: Text(t.delete)),
                      ],
                    ),
                    FilledButton.icon(
                      onPressed: () => onStart(p),
                      style: FilledButton.styleFrom(
                        backgroundColor: c.navIndicator,
                        minimumSize: const Size(0, 40),
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                      ),
                      icon: const Icon(Icons.play_arrow, size: 20),
                      label: Text(t.start),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
        OutlinedButton.icon(onPressed: () => _edit(context, null), icon: const Icon(Icons.add), label: Text(t.newPlan)),
      ],
    );
  }
}

/// Name, exercises in order and a note per exercise. Pops with true when saved.
class PlanEditor extends StatefulWidget {
  const PlanEditor({super.key, this.plan});

  final Plan? plan;

  @override
  State<PlanEditor> createState() => _PlanEditorState();
}

class _PlanEditorState extends State<PlanEditor> {
  late final _name = TextEditingController(text: widget.plan?.name ?? '');
  late final List<PlanItem> _items = [...?widget.plan?.items];
  String? _nameError;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final e = await pickExercise(context);
    if (e != null) setState(() => _items.add(PlanItem(exercise: e)));
  }

  Future<void> _note(int i) async {
    final t = context.t;
    final v = await showDialog<String>(
      context: context,
      builder: (_) => PromptDialog(
        title: _items[i].exercise.name,
        label: t.planNoteHint,
        initial: _items[i].notes ?? '',
        multiline: true,
        maxLength: 500,
      ),
    );
    if (v == null) return;
    setState(() => _items[i] = PlanItem(exercise: _items[i].exercise, notes: v.trim().isEmpty ? null : v.trim()));
  }

  Future<void> _save() async {
    final t = context.t;
    if (_name.text.trim().isEmpty) {
      setState(() => _nameError = t.requiredField);
      return;
    }
    await context.api.savePlan(widget.plan?.id, _name.text, [for (final i in _items) (i.exercise.id, i.notes)]);
    if (!mounted) return;
    showMsg(context, t.planSaved);
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = context.c;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.plan == null ? t.newPlan : t.editPlan),
        actions: [TextButton(onPressed: _save, child: Text(t.save))],
      ),
      body: SafeArea(
        child: PageWidth(
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                sliver: SliverList.list(
                  children: [
                    TextField(
                      controller: _name,
                      maxLength: 255,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: t.planName,
                        hintText: t.planNameHint,
                        errorText: _nameError,
                      ),
                    ),
                    Text(t.planHint, style: context.tt.bodySmall),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverReorderableList(
                  itemCount: _items.length,
                  onReorderItem: (from, to) => setState(() => _items.insert(to, _items.removeAt(from))),
                  itemBuilder: (context, i) {
                    final item = _items[i];
                    return Padding(
                      key: ObjectKey(item),
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.only(left: 4, right: 4),
                          leading: ReorderableDragStartListener(
                            index: i,
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Icon(Icons.drag_indicator, color: c.muted, semanticLabel: t.reorder),
                            ),
                          ),
                          title: Text('${i + 1}. ${item.exercise.name}'),
                          subtitle: item.notes == null
                              ? null
                              : Text(item.notes!, maxLines: 2, overflow: TextOverflow.ellipsis),
                          onTap: () => _note(i),
                          trailing: IconButton(
                            tooltip: t.remove,
                            onPressed: () => setState(() => _items.removeAt(i)),
                            icon: const Icon(Icons.close),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                sliver: SliverList.list(
                  children: [
                    OutlinedButton.icon(onPressed: _add, icon: const Icon(Icons.add), label: Text(t.addExercise)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Picks a CSV file, shows what would be imported and imports on confirm.
Future<bool> importPlansCsv(BuildContext context) async {
  final t = context.t;
  final bytes = await openFile();
  if (bytes == null || !context.mounted) return false;
  final ParsedCsv parsed;
  try {
    parsed = parsePlanCsv(decodeCsv(bytes));
  } on CsvRejected catch (e) {
    showMsg(context, csvErrorText(context, e), error: true);
    return false;
  }
  final api = context.api;
  final unknown = await api.unknownExercises(parsed);
  final existing = await api.existingPlans(parsed);
  if (!context.mounted) return false;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(t.importPlansTitle),
      scrollable: true,
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final p in parsed.plans)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: p.name,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    TextSpan(text: ' · ${t.exercisesCount(p.rows.length)}'),
                    if (existing.contains(p.name))
                      TextSpan(
                        text: '\n${t.planExists}',
                        style: TextStyle(color: c.c.warn),
                      ),
                  ],
                ),
              ),
            ),
          if (unknown.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(t.importNewExercises(unknown.length), style: c.tt.bodySmall),
            Text(unknown.take(10).join(', ') + (unknown.length > 10 ? ' …' : ''), style: c.tt.bodySmall),
          ],
          if (parsed.errors.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(t.importSkippedRows(parsed.errors.length), style: c.tt.bodySmall!.copyWith(color: c.c.danger)),
            for (final e in parsed.errors.take(8))
              Text('${t.line(e.line)}: ${rowProblemText(c, e.problem)}', style: c.tt.bodySmall),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(t.cancel)),
        TextButton(
          onPressed: parsed.plans.isEmpty ? null : () => Navigator.pop(c, true),
          child: Text(t.importConfirm(parsed.plans.length)),
        ),
      ],
    ),
  );
  if (!(ok ?? false) || !context.mounted) return false;
  final n = await api.importPlans(parsed);
  if (context.mounted) showMsg(context, t.plansImported(n));
  return true;
}

String csvErrorText(BuildContext context, CsvRejected e) {
  final t = context.t;
  return switch (e.error) {
    CsvError.empty => t.csvEmpty,
    CsvError.tooBig => t.csvTooBig(e.arg),
    CsvError.binary => t.csvBinary,
    CsvError.notUtf8 => t.csvNotUtf8,
    CsvError.unreadable => t.csvUnreadable,
    CsvError.missingColumns => t.csvMissingColumns(e.arg),
    CsvError.unknownColumns => t.csvUnknownColumns(e.arg),
    CsvError.duplicateColumns => t.csvDuplicateColumns,
    CsvError.tooManyRows => t.csvTooManyRows(e.arg),
    CsvError.tooManyPlans => t.csvTooManyPlans(e.arg),
    CsvError.noValidRows => t.csvNoValidRows,
  };
}

String rowProblemText(BuildContext context, RowProblem p) {
  final t = context.t;
  return switch (p) {
    RowProblem.planNameEmpty => t.rowPlanNameEmpty,
    RowProblem.planNameTooLong => t.rowPlanNameTooLong,
    RowProblem.planNameInvalid => t.rowPlanNameInvalid,
    RowProblem.exerciseNameEmpty => t.rowExerciseNameEmpty,
    RowProblem.exerciseNameTooLong => t.rowExerciseNameTooLong,
    RowProblem.exerciseNameInvalid => t.rowExerciseNameInvalid,
    RowProblem.orderNotNumber => t.rowOrderNotNumber,
    RowProblem.orderOutOfRange => t.rowOrderOutOfRange,
    RowProblem.notesTooLong => t.rowNotesTooLong,
    RowProblem.tooManyItems => t.rowTooManyItems,
  };
}
