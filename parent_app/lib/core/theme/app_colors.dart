import 'package:flutter/material.dart';

/// Static brand palette — the raw hex values behind both themes.
/// Screens should not reference this directly; use [AppColorsX] on
/// [BuildContext] (`context.colors`) or `Theme.of(context).colorScheme`
/// so light/dark mode both stay correct.
///
/// "Meridian" palette: deep teal (trust, protection) + warm brass
/// (rewards, warmth) — deliberately not the generic green/blue a
/// parental-control app defaults to. `glow` is a single signature accent
/// reserved for "live"/"protected right now" states only; it loses its
/// meaning if used anywhere else.
abstract final class AppPalette {
  // Meridian teal — identical hue across themes, it's what makes the
  // brand the brand.
  static const brand50 = Color(0xFFE3F3F1);
  static const brand200 = Color(0xFFA9D6D1);
  static const brand400 = Color(0xFF177F79);
  static const brand600 = Color(0xFF0E5A56);
  static const brand700 = Color(0xFF0A3F3C);

  static const brass300 = Color(0xFFE8CE9E);
  static const brass500 = Color(0xFFC08A3E);
  static const brass700 = Color(0xFF8A621F);

  static const glow = Color(0xFF3FCFC2);
  static const glowDark = Color(0xFF6BF0DE);

  static const success = Color(0xFF3C8F63);
  static const warning = Color(0xFFC0812C);
  static const error = Color(0xFFBB5140);
  static const errorDark = Color(0xFFE38175);
}

/// Extra design tokens that don't fit Material's [ColorScheme] — glass
/// fills, ambient shadows, and the brand gradients. Registered as a
/// [ThemeExtension] so both `AppTheme.light()` and `AppTheme.dark()` can
/// supply theme-correct values and widgets can read them via
/// `context.colors`.
@immutable
class AppColorsExt extends ThemeExtension<AppColorsExt> {
  const AppColorsExt({
    required this.success,
    required this.warning,
    required this.glow,
    required this.glassFill,
    required this.glassBorder,
    required this.ambientShadow,
    required this.brandGradient,
    required this.warmGradient,
    required this.onGradient,
  });

  final Color success;
  final Color warning;

  /// Signature "live"/"protected right now" accent — see the class doc.
  final Color glow;
  final Color glassFill;
  final Color glassBorder;
  final Color ambientShadow;
  final Gradient brandGradient;
  final Gradient warmGradient;
  final Color onGradient;

  static const light = AppColorsExt(
    success: AppPalette.success,
    warning: AppPalette.warning,
    glow: AppPalette.glow,
    glassFill: Color(0xE6FFFDF9),
    glassBorder: Color(0x14000000),
    ambientShadow: Color(0x1A1A1712),
    brandGradient: LinearGradient(
      colors: [AppPalette.brand400, AppPalette.brand700],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    warmGradient: LinearGradient(
      colors: [AppPalette.brass500, AppPalette.brass300],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    onGradient: Colors.white,
  );

  static const dark = AppColorsExt(
    success: Color(0xFF5CC98C),
    warning: Color(0xFFE3A95A),
    glow: AppPalette.glowDark,
    glassFill: Color(0xB2121A19),
    glassBorder: Color(0x1AFFFFFF),
    ambientShadow: Color(0x33000000),
    brandGradient: LinearGradient(
      colors: [AppPalette.brand400, AppPalette.brand600],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    warmGradient: LinearGradient(
      colors: [AppPalette.brass500, AppPalette.brass300],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    onGradient: Colors.white,
  );

  @override
  AppColorsExt copyWith({
    Color? success,
    Color? warning,
    Color? glow,
    Color? glassFill,
    Color? glassBorder,
    Color? ambientShadow,
    Gradient? brandGradient,
    Gradient? warmGradient,
    Color? onGradient,
  }) {
    return AppColorsExt(
      success: success ?? this.success,
      warning: warning ?? this.warning,
      glow: glow ?? this.glow,
      glassFill: glassFill ?? this.glassFill,
      glassBorder: glassBorder ?? this.glassBorder,
      ambientShadow: ambientShadow ?? this.ambientShadow,
      brandGradient: brandGradient ?? this.brandGradient,
      warmGradient: warmGradient ?? this.warmGradient,
      onGradient: onGradient ?? this.onGradient,
    );
  }

  @override
  AppColorsExt lerp(ThemeExtension<AppColorsExt>? other, double t) {
    if (other is! AppColorsExt) return this;
    return AppColorsExt(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      glow: Color.lerp(glow, other.glow, t)!,
      glassFill: Color.lerp(glassFill, other.glassFill, t)!,
      glassBorder: Color.lerp(glassBorder, other.glassBorder, t)!,
      ambientShadow: Color.lerp(ambientShadow, other.ambientShadow, t)!,
      brandGradient: t < 0.5 ? brandGradient : other.brandGradient,
      warmGradient: t < 0.5 ? warmGradient : other.warmGradient,
      onGradient: Color.lerp(onGradient, other.onGradient, t)!,
    );
  }
}

/// Convenience accessors so call sites read `context.colors.success`
/// and `context.scheme.surface` instead of importing Material boilerplate.
extension AppColorsX on BuildContext {
  AppColorsExt get colors => Theme.of(this).extension<AppColorsExt>()!;
  ColorScheme get scheme => Theme.of(this).colorScheme;
}
