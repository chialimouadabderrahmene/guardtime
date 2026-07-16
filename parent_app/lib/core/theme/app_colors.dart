import 'package:flutter/material.dart';

/// Static brand palette — the raw hex values behind both themes.
/// Screens should not reference this directly; use [AppColorsX] on
/// [BuildContext] (`context.colors`) or `Theme.of(context).colorScheme`
/// so light/dark mode both stay correct.
abstract final class AppPalette {
  // Brand green — identical across themes, it's what makes GuardTime GuardTime.
  static const brand50 = Color(0xFFEAFBEF);
  static const brand200 = Color(0xFFA8E6B8);
  static const brand400 = Color(0xFF2ECC71);
  static const brand600 = Color(0xFF1B8A4A);
  static const brand700 = Color(0xFF15703B);

  static const teal300 = Color(0xFFC5E8CE);
  static const amber300 = Color(0xFFFFD6A5);
  static const amber600 = Color(0xFFE8961B);

  static const success = Color(0xFF2FBE83);
  static const warning = Color(0xFFE8961B);
  static const error = Color(0xFFDC3545);
  static const errorDark = Color(0xFFFFB4AB);
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
    required this.glassFill,
    required this.glassBorder,
    required this.ambientShadow,
    required this.brandGradient,
    required this.warmGradient,
    required this.onGradient,
  });

  final Color success;
  final Color warning;
  final Color glassFill;
  final Color glassBorder;
  final Color ambientShadow;
  final Gradient brandGradient;
  final Gradient warmGradient;
  final Color onGradient;

  static const light = AppColorsExt(
    success: AppPalette.success,
    warning: Color(0xFFB8720A),
    glassFill: Color(0xE6FFFFFF),
    glassBorder: Color(0x14000000),
    ambientShadow: Color(0x1A0F2A1A),
    brandGradient: LinearGradient(
      colors: [AppPalette.brand400, AppPalette.brand600],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    warmGradient: LinearGradient(
      colors: [AppPalette.amber600, AppPalette.amber300],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    onGradient: Colors.white,
  );

  static const dark = AppColorsExt(
    success: Color(0xFF36D399),
    warning: Color(0xFFFFB86C),
    glassFill: Color(0xB20E1F15),
    glassBorder: Color(0x1AFFFFFF),
    ambientShadow: Color(0x330A0E1A),
    brandGradient: LinearGradient(
      colors: [AppPalette.brand400, AppPalette.brand600],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    warmGradient: LinearGradient(
      colors: [AppPalette.amber600, AppPalette.amber300],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    onGradient: Colors.white,
  );

  @override
  AppColorsExt copyWith({
    Color? success,
    Color? warning,
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
