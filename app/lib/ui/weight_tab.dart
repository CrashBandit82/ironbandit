import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../data/models.dart';
import 'theme.dart';
import 'widgets.dart';

class WeightTab extends StatefulWidget {
  const WeightTab({super.key});

  @override
  State<WeightTab> createState() => _WeightTabState();
}

class _WeightTabState extends State<WeightTab> {
  WeightHistory? _history;
  Object? _error;
  final _weight = TextEditingController();
  var _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _weight.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final h = await context.api.weightHistory();
      if (!mounted) return;
      setState(() => _history = h);
      if (h.latest != null && _weight.text.isEmpty) _weight.text = fmtNum(context, h.latest!);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _save() async {
    final kg = parseNum(_weight.text);
    if (kg == null || kg <= 0) return;
    setState(() => _busy = true);
    try {
      await context.api.logWeight(kg);
      if (mounted) showMsg(context, context.t.weightSaved);
      await _load();
    } on Object catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit(WeightEntry e) async {
    final t = context.t;
    final v = await showDialog<String>(
      context: context,
      builder: (_) => PromptDialog(
        title: DateFormat.yMMMEd(context.locale).format(e.date),
        label: t.weightKg,
        initial: fmtNum(context, e.kg),
        numeric: true,
        suffix: 'kg',
      ),
    );
    final kg = parseNum(v ?? '');
    if (kg == null || kg <= 0 || !mounted) return;
    await context.api.updateWeight(e.id, kg);
    await _load();
  }

  Future<void> _delete(WeightEntry e) async {
    final date = DateFormat.yMd(Localizations.localeOf(context).toLanguageTag()).format(e.date);
    if (!await confirm(context, context.t.weightDeleteConfirm(date)) || !mounted) return;
    try {
      await context.api.deleteWeight(e.id);
    } on Object catch (err) {
      if (mounted) showError(context, err);
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    final h = _history;
    final locale = Localizations.localeOf(context).toLanguageTag();
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          children: [
            PageWidth(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(t.weightTitle, style: context.tt.headlineSmall),
                  ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(t.weightToday, style: context.tt.titleSmall),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _weight,
                                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                  style: context.tt.titleMedium,
                                  decoration: InputDecoration(
                                    labelText: t.weightKg,
                                    suffixText: 'kg',
                                    hintText: fmtNum(context, 75.5),
                                  ),
                                  onSubmitted: (_) => _save(),
                                ),
                              ),
                              const SizedBox(width: 10),
                              SizedBox(
                                width: 120,
                                child: GradientButton(label: t.save, height: 52, busy: _busy, onPressed: _save),
                              ),
                            ],
                          ),
                          if (h != null && h.entries.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            IntrinsicHeight(
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  _stat(t.weightCurrent, '${fmtNum(context, h.latest!)} kg', context.c.text),
                                  _stat(t.weightStart, '${fmtNum(context, h.start!)} kg', context.c.soft),
                                  _trendStat(context, h.trend),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (h == null)
                    LoadState(error: _error, onRetry: _load)
                  else ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t.weightChartTitle, style: context.tt.titleSmall),
                            const SizedBox(height: 12),
                            if (h.entries.length < 2)
                              SizedBox(
                                height: 100,
                                child: Center(
                                  child: Text(t.weightChartMin, style: TextStyle(color: context.c.faint)),
                                ),
                              )
                            else
                              SizedBox(
                                height: 140,
                                width: double.infinity,
                                child: Semantics(
                                  label:
                                      '${t.weightChartTitle}: ${t.weightStart} ${fmtNum(context, h.start!)} kg, ${t.weightCurrent} ${fmtNum(context, h.latest!)} kg',
                                  excludeSemantics: true,
                                  child: CustomPaint(
                                    painter: _WeightChart(
                                      h.entries,
                                      DateFormat.Md(locale),
                                      (v) => fmtNum(context, v),
                                      context.c,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (h.entries.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      SectionLabel(t.weightEntries),
                      Card(
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          children: [
                            for (final (i, e) in h.entries.reversed.indexed) ...[
                              if (i > 0) const Divider(),
                              ListTile(
                                dense: true,
                                onTap: () => _edit(e),
                                title: Text(DateFormat.yMMMEd(locale).format(e.date)),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      '${fmtNum(context, e.kg)} kg',
                                      style: context.tt.titleSmall!.copyWith(fontWeight: FontWeight.w700),
                                    ),
                                    IconButton(
                                      tooltip: t.delete,
                                      onPressed: () => _delete(e),
                                      icon: const Icon(Icons.close, size: 20),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value, Color color, {IconData? icon}) => Expanded(
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      decoration: BoxDecoration(color: context.c.inset, borderRadius: BorderRadius.circular(10)),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, textAlign: TextAlign.center, style: context.tt.labelSmall!.copyWith(letterSpacing: 0)),
          const SizedBox(height: 2),
          Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (icon != null) Icon(icon, size: 18, color: color),
              Text(
                value,
                textAlign: TextAlign.center,
                style: context.tt.titleSmall!.copyWith(fontWeight: FontWeight.w800, color: color),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  Widget _trendStat(BuildContext context, double? trend) {
    final c = context.c;
    final label = context.t.weightTrend;
    if (trend == null) return _stat(label, '—', c.muted);
    // neutral colors: gaining or losing can both be the goal
    final icon = trend < -0.1
        ? Icons.trending_down
        : trend > 0.1
        ? Icons.trending_up
        : Icons.trending_flat;
    return _stat(label, '${fmtNum(context, trend.abs())} kg', c.soft, icon: icon);
  }
}

class _WeightChart extends CustomPainter {
  _WeightChart(this.entries, this.dateFmt, this.kgFmt, this.c);

  final List<WeightEntry> entries;
  final DateFormat dateFmt;
  final String Function(double) kgFmt;
  final Palette c;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 16.0;
    final weights = entries.map((e) => e.kg);
    final lo = weights.reduce(math.min) - 1;
    final hi = weights.reduce(math.max) + 1;
    final range = hi - lo;
    final w = size.width - 2 * pad;
    final h = size.height - 2 * pad;
    Offset pt(int i) => Offset(pad + i / (entries.length - 1) * w, pad + (hi - entries[i].kg) / range * h);

    final grid = Paint()
      ..color = c.border
      ..strokeWidth = 1;
    for (final f in [0.0, 0.5, 1.0]) {
      final y = pad + f * h;
      for (var x = pad; x < size.width - pad; x += 8) {
        canvas.drawLine(Offset(x, y), Offset(math.min(x + 4, size.width - pad), y), grid);
      }
    }

    final line = Path()..moveTo(pt(0).dx, pt(0).dy);
    for (var i = 1; i < entries.length; i++) {
      line.lineTo(pt(i).dx, pt(i).dy);
    }
    final area = Path.from(line)
      ..lineTo(pad + w, pad + h)
      ..lineTo(pad, pad + h)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [c.brandLine.withValues(alpha: 0.25), c.brandLine.withValues(alpha: 0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      line,
      Paint()
        ..color = c.brandLine
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(pt(0), 4, Paint()..color = c.muted);
    final last = pt(entries.length - 1);
    canvas.drawCircle(last, 6, Paint()..color = c.card);
    canvas.drawCircle(last, 4.5, Paint()..color = c.brandLine);

    void label(String text, Offset at, Color color, {bool bold = false}) {
      final tp = TextPainter(
        text: TextSpan(
          text: text,
          style: TextStyle(color: color, fontSize: 11, fontWeight: bold ? FontWeight.bold : null),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final dx = (at.dx - tp.width / 2).clamp(0.0, size.width - tp.width);
      tp.paint(canvas, Offset(dx, at.dy));
    }

    label(dateFmt.format(entries.first.date), Offset(pad, size.height - 13), c.faint);
    label(dateFmt.format(entries.last.date), Offset(size.width - pad, size.height - 13), c.faint);
    label(kgFmt(entries.last.kg), last.translate(0, -19), c.brandLine, bold: true);
  }

  @override
  bool shouldRepaint(_WeightChart old) => old.entries != entries || old.c != c;
}
