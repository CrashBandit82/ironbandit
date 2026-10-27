import 'package:flutter/material.dart';

import 'theme.dart';
import 'widgets.dart';

/// The running break above the navigation bar: big countdown, ±15 s, skip.
/// Stays visible on every tab and sheet underneath.
class RestBar extends StatelessWidget {
  const RestBar({super.key});

  static const step = 15;

  @override
  Widget build(BuildContext context) {
    final rest = context.session.rest;
    return ListenableBuilder(
      listenable: rest,
      builder: (context, _) {
        if (rest.endAt == null) return const SizedBox.shrink();
        return RestPanel(key: const ValueKey('rest'), compact: true);
      },
    );
  }
}

/// Countdown with controls; [compact] in the bar, full inside the exercise sheet.
class RestPanel extends StatelessWidget {
  const RestPanel({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final rest = context.session.rest;
    final t = context.t;
    final c = context.c;
    return ListenableBuilder(
      listenable: rest,
      builder: (context, _) {
        if (rest.endAt == null) return const SizedBox.shrink();
        final done = rest.done;
        final left = rest.secondsLeft;
        final time = '${left ~/ 60}:${(left % 60).toString().padLeft(2, '0')}';
        final color = done ? c.success : c.text;
        return Material(
          color: done ? c.successBg : (compact ? c.card : c.inset),
          shape: compact
              ? Border(top: BorderSide(color: c.border))
              : RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: done ? c.success.withValues(alpha: 0.5) : c.border),
                ),
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: compact ? 6 : 10),
            child: Row(
              children: [
                Icon(done ? Icons.check_circle : Icons.timer_outlined, color: done ? c.success : c.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Semantics(
                    liveRegion: done,
                    child: done
                        ? Text(t.restDone, style: context.tt.titleMedium!.copyWith(color: color))
                        : Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: '${t.restLabel}  ', style: context.tt.labelMedium),
                                TextSpan(
                                  text: time,
                                  style: context.tt.headlineSmall!.copyWith(
                                    color: color,
                                    fontFeatures: const [FontFeature.tabularFigures()],
                                  ),
                                ),
                              ],
                            ),
                          ),
                  ),
                ),
                if (!done) ...[
                  _btn(context, '−${RestBar.step}', t.restShorter, () => rest.adjust(-RestBar.step)),
                  _btn(context, '+${RestBar.step}', t.restLonger, () => rest.adjust(RestBar.step)),
                  IconButton(tooltip: t.restSkip, onPressed: rest.skip, icon: const Icon(Icons.skip_next)),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _btn(BuildContext context, String label, String tooltip, VoidCallback onTap) => Tooltip(
    message: tooltip,
    child: TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: context.c.soft,
        minimumSize: const Size(48, 40),
        padding: const EdgeInsets.symmetric(horizontal: 8),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
    ),
  );
}
