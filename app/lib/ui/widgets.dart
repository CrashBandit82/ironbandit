import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../data/api.dart';
import '../data/session.dart';
import '../l10n/app_localizations.dart';
import 'theme.dart';

extension ContextX on BuildContext {
  AppLocalizations get t => AppLocalizations.of(this);
  Session get session => SessionScope.read(this);
  Api get api => SessionScope.read(this).api;
  String get locale => Localizations.localeOf(this).toLanguageTag();
  bool get german => Localizations.localeOf(this).languageCode == 'de';
}

/// Number with up to [digits] decimals in the app locale ("62,5" in German).
/// Thousands are grouped from five digits on ("1250", "12.400").
String fmtNum(BuildContext context, num v, [int digits = 1]) {
  final f = NumberFormat.decimalPattern(context.locale)
    ..minimumFractionDigits = 0
    ..maximumFractionDigits = digits;
  if (v.abs() < 10000) f.turnOffGrouping();
  return f.format(v);
}

/// Parses "3,5" and "3.5"; null when empty or not a number.
double? parseNum(String s) => double.tryParse(s.trim().replaceAll(',', '.'));

/// "1:05:30" or "45:10".
String fmtDuration(int seconds) {
  final h = seconds ~/ 3600, m = seconds % 3600 ~/ 60, s = seconds % 60;
  String two(int n) => n.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(m)}:${two(s)}' : '$m:${two(s)}';
}

/// One set as "60 kg × 8" or "× 12" without weight.
String fmtSet(BuildContext context, int reps, double? kg) =>
    kg == null ? '× $reps' : '${fmtNum(context, kg, 2)} kg × $reps';

String errorText(BuildContext context, Object error) => context.t.errorGeneric;

void showMsg(BuildContext context, String text, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(
          text,
          style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white),
        ),
        backgroundColor: error ? const Color(0xFFB91C1C) : const Color(0xFF1F7A55),
        persist: false,
      ),
    );
}

void showError(BuildContext context, Object error) => showMsg(context, errorText(context, error), error: true);

Future<bool> confirm(
  BuildContext context,
  String text, {
  String? action,
  String? cancel,
  bool destructive = true,
}) async {
  final t = context.t;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      content: Text(text),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: Text(cancel ?? t.cancel)),
        TextButton(
          onPressed: () => Navigator.pop(c, true),
          style: destructive ? TextButton.styleFrom(foregroundColor: context.c.danger) : null,
          child: Text(action ?? t.delete),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Dialog with one text field; pops with the text or null. Owns its controller,
/// so it is disposed only after the closing animation.
class PromptDialog extends StatefulWidget {
  const PromptDialog({
    super.key,
    required this.title,
    required this.label,
    this.initial = '',
    this.header,
    this.multiline = false,
    this.maxLength,
    this.numeric = false,
    this.suffix,
    this.action,
  });

  final String title;
  final String label;
  final String initial;
  final Widget? header;
  final bool multiline;
  final int? maxLength;
  final bool numeric;
  final String? suffix;
  final String? action;

  @override
  State<PromptDialog> createState() => _PromptDialogState();
}

class _PromptDialogState extends State<PromptDialog> {
  late final _ctrl = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.t;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ?widget.header,
          TextField(
            controller: _ctrl,
            autofocus: true,
            minLines: widget.multiline ? 3 : 1,
            maxLines: widget.multiline ? 6 : 1,
            maxLength: widget.maxLength,
            textCapitalization: widget.numeric ? TextCapitalization.none : TextCapitalization.sentences,
            keyboardType: widget.numeric ? const TextInputType.numberWithOptions(decimal: true) : null,
            decoration: InputDecoration(
              hintText: widget.multiline ? widget.label : null,
              labelText: widget.multiline ? null : widget.label,
              suffixText: widget.suffix,
            ),
            onSubmitted: widget.multiline ? null : (v) => Navigator.pop(context, v),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(t.cancel)),
        TextButton(onPressed: () => Navigator.pop(context, _ctrl.text), child: Text(widget.action ?? t.save)),
      ],
    );
  }
}

/// Primary action in the brand gradient (like the web app's main buttons).
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.icon,
    this.height = 48,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: DecoratedBox(
        decoration: BoxDecoration(gradient: Palette.brandGradient, borderRadius: BorderRadius.circular(12)),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: enabled ? onPressed : null,
            child: SizedBox(
              height: height,
              child: Center(
                child: busy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (icon != null) ...[Icon(icon, color: Colors.white, size: 20), const SizedBox(width: 8)],
                            Flexible(
                              child: Text(
                                label,
                                overflow: TextOverflow.ellipsis,
                                style: context.tt.labelLarge!.copyWith(color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8, left: 2, top: 4),
    child: Row(
      children: [
        Expanded(
          child: Semantics(header: true, child: Text(text, style: context.tt.titleMedium)),
        ),
        ?trailing,
      ],
    ),
  );
}

/// Thin progress bar on the theme's inset color.
class Bar extends StatelessWidget {
  const Bar({super.key, required this.fraction, required this.color, this.height = 6, this.label});

  final double fraction;
  final Color color;
  final double height;

  /// TalkBack label.
  final String? label;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(height),
    child: LinearProgressIndicator(
      value: fraction.clamp(0, 1),
      minHeight: height,
      color: color,
      backgroundColor: context.c.border,
      semanticsLabel: label,
      semanticsValue: '${(fraction * 100).round()} %',
    ),
  );
}

/// Centered spinner / error with retry for a loading future.
class LoadState extends StatelessWidget {
  const LoadState({super.key, this.error, required this.onRetry});

  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (error == null) {
      return const Padding(
        padding: EdgeInsets.all(32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            errorText(context, error!),
            textAlign: TextAlign.center,
            style: TextStyle(color: context.c.muted),
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: Text(context.t.retry)),
        ],
      ),
    );
  }
}

/// Validator for required positive numbers.
String? Function(String?) positiveNumber(BuildContext context, {bool required = true}) => (v) {
  if ((v ?? '').trim().isEmpty) return required ? context.t.requiredField : null;
  final n = parseNum(v!);
  return n == null || n <= 0 ? context.t.invalidNumber : null;
};

String? Function(String?) requiredText(BuildContext context) =>
    (v) => (v ?? '').trim().isEmpty ? context.t.requiredField : null;

/// Segment of a [SegmentedButton] whose label shrinks instead of wrapping
/// with large system fonts.
ButtonSegment<T> segment<T>(T value, String label) => ButtonSegment(
  value: value,
  label: FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1)),
);

/// Limits content to a readable width on tablets and in landscape.
class PageWidth extends StatelessWidget {
  const PageWidth({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 640), child: child),
  );
}

/// Bottom sheet with keyboard padding and scrolling content.
Future<T?> showSheet<T>(BuildContext context, WidgetBuilder builder) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (c) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
    // useSafeArea leaves the bottom free: keep content above the system navigation bar
    child: SafeArea(top: false, child: builder(c)),
  ),
);

/// Small rounded label ("Push", "Cardio").
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(color: context.c.inset, borderRadius: BorderRadius.circular(6)),
    child: Text(
      text,
      style: context.tt.labelMedium!.copyWith(color: color ?? context.c.muted, fontWeight: FontWeight.w700),
    ),
  );
}
