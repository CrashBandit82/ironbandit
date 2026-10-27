import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// IronBandit palette (slate with the orange-red brand like the web app), one
/// set per brightness. Every text color reaches 4.5:1 on page and card.
@immutable
class Palette extends ThemeExtension<Palette> {
  const Palette({
    required this.page,
    required this.card,
    required this.inset,
    required this.border,
    required this.text,
    required this.soft,
    required this.muted,
    required this.faint,
    required this.accent,
    required this.brandLine,
    required this.navIndicator,
    required this.success,
    required this.successBg,
    required this.danger,
    required this.dangerBg,
    required this.warn,
    required this.warnBg,
    required this.info,
    required this.navBar,
  });

  /// [inset] for fields, set rows and tracks inside cards.
  final Color page, card, inset, border;

  /// Text: [text] primary, [soft] secondary, [muted] tertiary, [faint] captions.
  final Color text, soft, muted, faint;

  /// [accent] for brand text/icons, [brandLine] for chart strokes.
  final Color accent, brandLine, navIndicator;
  final Color success, successBg, danger, dangerBg, warn, warnBg, info;
  final Color navBar;

  static const dark = Palette(
    page: Color(0xFF141A2B),
    card: Color(0xFF1D2438),
    inset: Color(0xFF141A2B),
    border: Color(0xFF2C3550),
    text: Color(0xFFF4F6FB),
    soft: Color(0xFFC5CDDD),
    muted: Color(0xFF98A4BB),
    faint: Color(0xFF8A96AD),
    accent: Color(0xFFFB8A3C),
    brandLine: Color(0xFFF47521),
    navIndicator: Color(0xFFB8231F),
    success: Color(0xFF34D399),
    successBg: Color(0x2110B981),
    danger: Color(0xFFFB7185),
    dangerBg: Color(0x21F43F5E),
    warn: Color(0xFFFBBF24),
    warnBg: Color(0x21F59E0B),
    info: Color(0xFF60A5FA),
    navBar: Color(0xFF0B0F1A),
  );

  static const light = Palette(
    page: Color(0xFFEEF1F6),
    card: Color(0xFFFFFFFF),
    inset: Color(0xFFF3F5F9),
    border: Color(0xFFD3DAE6),
    text: Color(0xFF171D2B),
    soft: Color(0xFF414B5C),
    muted: Color(0xFF5A6478),
    faint: Color(0xFF5F697D),
    accent: Color(0xFFC33C14),
    brandLine: Color(0xFFD13212),
    navIndicator: Color(0xFFC22D12),
    success: Color(0xFF047857),
    successBg: Color(0xFFE7F6EF),
    danger: Color(0xFFB91C1C),
    dangerBg: Color(0xFFFDEAEA),
    warn: Color(0xFFB45309),
    warnBg: Color(0xFFFDF1E0),
    info: Color(0xFF1D4ED8),
    navBar: Color(0xFFFFFFFF),
  );

  /// Primary actions like the web app's main buttons (white text above 4.5:1).
  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFCC3F0C), Color(0xFFC22D12), Color(0xFFB8231F)],
    stops: [0, 0.45, 1],
  );

  @override
  Palette copyWith() => this;

  @override
  Palette lerp(Palette? other, double t) => other == null || t < 0.5 ? this : other;
}

extension ThemeX on BuildContext {
  Palette get c => Theme.of(this).extension<Palette>()!;
  TextTheme get tt => Theme.of(this).textTheme;
}

/// Type scale (sp, follows the system font size). Screens pick roles, not sizes.
TextTheme _textTheme(Palette p) {
  TextStyle s(double size, FontWeight w, {Color? color, double? height, double? spacing}) =>
      TextStyle(fontSize: size, fontWeight: w, color: color ?? p.text, height: height, letterSpacing: spacing);
  return TextTheme(
    displaySmall: s(44, FontWeight.w800, height: 1, spacing: -0.5),
    headlineSmall: s(26, FontWeight.w800, spacing: -0.3),
    titleLarge: s(20, FontWeight.w800, spacing: -0.2),
    titleMedium: s(17, FontWeight.w800),
    titleSmall: s(15, FontWeight.w700),
    bodyLarge: s(16, FontWeight.w400),
    bodyMedium: s(14, FontWeight.w400),
    bodySmall: s(12.5, FontWeight.w500, color: p.muted),
    labelLarge: s(15, FontWeight.w700),
    labelMedium: s(12, FontWeight.w600, color: p.muted),
    labelSmall: s(11, FontWeight.w700, color: p.faint, spacing: 0.8),
  );
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final p = dark ? Palette.dark : Palette.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: p.navIndicator,
    onPrimary: Colors.white,
    primaryContainer: p.navIndicator,
    onPrimaryContainer: Colors.white,
    secondary: p.accent,
    onSecondary: Colors.white,
    secondaryContainer: p.navIndicator,
    onSecondaryContainer: Colors.white,
    error: p.danger,
    onError: Colors.white,
    surface: p.page,
    onSurface: p.text,
    surfaceContainerLowest: p.page,
    surfaceContainerLow: p.card,
    surfaceContainer: p.card,
    surfaceContainerHigh: p.card,
    surfaceContainerHighest: dark ? const Color(0xFF2C3550) : const Color(0xFFE6EAF2),
    onSurfaceVariant: p.muted,
    outline: p.border,
    outlineVariant: p.border,
  );
  final textTheme = _textTheme(p);
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: scheme.outline),
  );
  final overlay = (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
    statusBarColor: Colors.transparent,
    systemNavigationBarColor: p.navBar,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: p.page,
    textTheme: textTheme,
    extensions: [p],
    appBarTheme: AppBarTheme(
      backgroundColor: p.page,
      foregroundColor: p.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: overlay,
      titleTextStyle: textTheme.titleMedium,
    ),
    cardTheme: CardThemeData(
      color: p.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: p.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.inset,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(borderSide: BorderSide(color: p.accent, width: 1.5)),
      labelStyle: TextStyle(color: p.muted),
      hintStyle: TextStyle(color: p.faint),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: textTheme.labelLarge,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        foregroundColor: p.soft,
        side: BorderSide(color: scheme.outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: p.accent)),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: p.card,
        selectedBackgroundColor: p.navIndicator,
        selectedForegroundColor: Colors.white,
        foregroundColor: p.muted,
        side: BorderSide(color: scheme.outline),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.navBar,
      indicatorColor: p.navIndicator,
      // explicit colors: the scheme default for the selected icon is dark on dark
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(color: s.contains(WidgetState.selected) ? Colors.white : p.muted),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected)
            ? textTheme.labelMedium!.copyWith(fontWeight: FontWeight.w800, color: p.text)
            : textTheme.labelMedium!,
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(foregroundColor: Colors.white),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: p.page, showDragHandle: true),
    dialogTheme: DialogThemeData(backgroundColor: p.card),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    dividerTheme: DividerThemeData(color: p.border, space: 1),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : p.muted),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? p.navIndicator : p.inset),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: p.muted,
      titleTextStyle: textTheme.titleSmall,
      subtitleTextStyle: textTheme.bodySmall,
    ),
  );
}
