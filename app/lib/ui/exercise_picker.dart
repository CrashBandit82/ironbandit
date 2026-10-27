import 'package:flutter/material.dart';

import '../data/api.dart';
import '../data/models.dart';
import 'theme.dart';
import 'widgets.dart';

/// Picks an exercise (most used first, search folds umlauts). Exercises can be
/// created, edited and deleted here. Pops with the chosen [Exercise].
Future<Exercise?> pickExercise(BuildContext context) => showSheet<Exercise>(context, (_) => const _ExercisePicker());

class _ExercisePicker extends StatefulWidget {
  const _ExercisePicker();

  @override
  State<_ExercisePicker> createState() => _ExercisePickerState();
}

class _ExercisePickerState extends State<_ExercisePicker> {
  final _search = TextEditingController();
  List<Exercise>? _all;
  String? _category;

  @override
  void initState() {
    super.initState();
    _search.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final all = await context.api.exercises();
    if (mounted) setState(() => _all = all);
  }

  List<Exercise> get _filtered {
    final words = foldText(_search.text).split(' ').where((w) => w.isNotEmpty).toList();
    return [
      for (final e in _all ?? <Exercise>[])
        if ((_category == null || e.category == _category) &&
            words.every((w) => foldText('${e.name} ${e.muscleGroup ?? ''} ${e.equipment ?? ''}').contains(w)))
          e,
    ];
  }

  Future<void> _edit(Exercise? e) async {
    final saved = await showDialog<Exercise>(
      context: context,
      builder: (_) => ExerciseForm(exercise: e, initialName: e == null ? _search.text.trim() : null),
    );
    if (saved == null || !mounted) return;
    if (e == null) {
      Navigator.pop(context, saved);
    } else {
      await _load();
    }
  }

  Future<void> _delete(Exercise e) async {
    final t = context.t;
    final plans = await context.api.plansWithExercise(e.id);
    if (!mounted) return;
    final text = plans > 0
        ? '${t.deleteExerciseConfirm(e.name)}\n\n${t.deleteExerciseInPlans(plans)}'
        : t.deleteExerciseConfirm(e.name);
    if (!await confirm(context, text) || !mounted) return;
    await context.api.deleteExercise(e.id);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final c = context.c;
    final list = _filtered;
    final query = _search.text.trim();
    final exact = list.any((e) => foldText(e.name) == foldText(query));
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.85,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(t.pickExerciseTitle, style: context.tt.titleLarge),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _search,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: t.searchExercise,
                suffixIcon: query.isEmpty
                    ? null
                    : IconButton(tooltip: t.clear, onPressed: _search.clear, icon: const Icon(Icons.close)),
              ),
            ),
          ),
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                for (final cat in [null, ...categories])
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(cat == null ? t.all : categoryLabel(context, cat)),
                      selected: _category == cat,
                      showCheckmark: false,
                      selectedColor: c.navIndicator,
                      labelStyle: TextStyle(
                        color: _category == cat ? Colors.white : c.soft,
                        fontWeight: FontWeight.w700,
                      ),
                      onSelected: (_) => setState(() => _category = cat),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _all == null
                ? const Center(child: CircularProgressIndicator())
                : ListView(
                    padding: const EdgeInsets.only(bottom: 16),
                    children: [
                      if (query.isNotEmpty && !exact)
                        ListTile(
                          leading: Icon(Icons.add_circle_outline, color: c.accent),
                          title: Text(t.createExerciseNamed(query), style: TextStyle(color: c.accent)),
                          onTap: () => _edit(null),
                        ),
                      for (final e in list)
                        ListTile(
                          title: Text(e.name),
                          subtitle: _subtitle(context, e),
                          onTap: () => Navigator.pop(context, e),
                          trailing: PopupMenuButton<bool>(
                            tooltip: t.more,
                            onSelected: (edit) => edit ? _edit(e) : _delete(e),
                            itemBuilder: (_) => [
                              PopupMenuItem(value: true, child: Text(t.edit)),
                              PopupMenuItem(value: false, child: Text(t.delete)),
                            ],
                          ),
                        ),
                      if (list.isEmpty && query.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            t.noExercises,
                            textAlign: TextAlign.center,
                            style: TextStyle(color: c.muted),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: OutlinedButton.icon(
                          onPressed: () => _edit(null),
                          icon: const Icon(Icons.add),
                          label: Text(t.newExercise),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget? _subtitle(BuildContext context, Exercise e) {
    final parts = [if (e.category != null) categoryLabel(context, e.category!), ?e.muscleGroup, ?e.equipment];
    return parts.isEmpty ? null : Text(parts.join(' · '));
  }
}

String categoryLabel(BuildContext context, String category) {
  final t = context.t;
  return switch (category) {
    'Push' => t.catPush,
    'Pull' => t.catPull,
    'Legs' => t.catLegs,
    'Core' => t.catCore,
    'Cardio' => t.catCardio,
    _ => category,
  };
}

/// Creates or edits an exercise; pops with the saved one.
class ExerciseForm extends StatefulWidget {
  const ExerciseForm({super.key, this.exercise, this.initialName});

  final Exercise? exercise;
  final String? initialName;

  @override
  State<ExerciseForm> createState() => _ExerciseFormState();
}

class _ExerciseFormState extends State<ExerciseForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.exercise?.name ?? widget.initialName ?? '');
  late final _muscle = TextEditingController(text: widget.exercise?.muscleGroup ?? '');
  late final _equipment = TextEditingController(text: widget.exercise?.equipment ?? '');
  late String? _category = widget.exercise?.category;
  late bool _cardio = widget.exercise?.isCardio ?? false;
  String? _nameError;

  @override
  void dispose() {
    _name.dispose();
    _muscle.dispose();
    _equipment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _nameError = null);
    if (!_form.currentState!.validate()) return;
    final input = ExerciseInput(
      name: _name.text,
      category: _category,
      muscleGroup: _muscle.text,
      equipment: _equipment.text,
      isCardio: _cardio,
    );
    try {
      final api = context.api;
      final saved = widget.exercise == null
          ? await api.createExercise(input)
          : await api.updateExercise(widget.exercise!.id, input);
      if (mounted) Navigator.pop(context, saved);
    } on ApiException catch (e) {
      if (e.status == 409 && mounted) setState(() => _nameError = context.t.exerciseExists);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return AlertDialog(
      title: Text(widget.exercise == null ? t.newExercise : t.editExercise),
      scrollable: true,
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _name,
              autofocus: widget.exercise == null && (widget.initialName ?? '').isEmpty,
              maxLength: 255,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: t.exerciseName, errorText: _nameError),
              validator: requiredText(context),
            ),
            const SizedBox(height: 4),
            DropdownButtonFormField<String?>(
              initialValue: _category,
              isExpanded: true,
              decoration: InputDecoration(labelText: t.category),
              items: [
                DropdownMenuItem(value: null, child: Text(t.none)),
                for (final cat in categories) DropdownMenuItem(value: cat, child: Text(categoryLabel(context, cat))),
              ],
              onChanged: (v) => setState(() {
                _category = v;
                if (v == 'Cardio') _cardio = true;
              }),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _muscle,
              maxLength: 50,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: t.muscleGroup, counterText: ''),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _equipment,
              maxLength: 100,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: t.equipment, counterText: ''),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t.cardioSwitch),
              subtitle: Text(t.cardioSwitchSub),
              value: _cardio,
              onChanged: (v) => setState(() => _cardio = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(t.cancel)),
        TextButton(onPressed: _save, child: Text(t.save)),
      ],
    );
  }
}
