import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_spacing.dart';

abstract final class AppTheme {
  static ThemeData light() => _build(_lightScheme, AppColorsExt.light);

  static ThemeData dark() => _build(_darkScheme, AppColorsExt.dark);

  // Meridian: warm-paper base (never pure white/black), deep teal primary,
  // warm brass tertiary — see app_colors.dart's AppPalette doc for why.
  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF0E5A56),
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFDCEBE8),
    onPrimaryContainer: Color(0xFF0A3F3C),
    secondary: Color(0xFF0A3F3C),
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFE3F3F1),
    onSecondaryContainer: Color(0xFF0A3F3C),
    tertiary: Color(0xFF8A621F),
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFF3E6D1),
    onTertiaryContainer: Color(0xFF4A3410),
    error: Color(0xFFBB5140),
    onError: Colors.white,
    errorContainer: Color(0xFFF7E5E1),
    onErrorContainer: Color(0xFF410002),
    surface: Color(0xFFF7F5F0),
    onSurface: Color(0xFF1A1D1E),
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: Color(0xFFF2F0E9),
    surfaceContainer: Color(0xFFEFECE3),
    surfaceContainerHigh: Color(0xFFE9E5DA),
    surfaceContainerHighest: Color(0xFFE3E0D5),
    onSurfaceVariant: Color(0xFF63666B),
    outline: Color(0xFF8A8D8F),
    outlineVariant: Color(0xFFE3E0D5),
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: Color(0xFF1A1D1E),
    onInverseSurface: Color(0xFFF7F5F0),
    inversePrimary: Color(0xFF3FCFC2),
  );

  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF3FCFC2),
    onPrimary: Color(0xFF06302D),
    primaryContainer: Color(0xFF0A3F3C),
    onPrimaryContainer: Color(0xFFDCEBE8),
    secondary: Color(0xFF8FE8DD),
    onSecondary: Color(0xFF06302D),
    secondaryContainer: Color(0xFF123230),
    onSecondaryContainer: Colors.white,
    tertiary: Color(0xFFE3B15E),
    onTertiary: Color(0xFF3A2807),
    tertiaryContainer: Color(0xFF2C2311),
    onTertiaryContainer: Colors.white,
    error: Color(0xFFE38175),
    onError: Color(0xFF3A0F09),
    errorContainer: Color(0xFF331714),
    onErrorContainer: Color(0xFFF7E5E1),
    surface: Color(0xFF0A0F0F),
    onSurface: Color(0xFFECEFEE),
    surfaceContainerLowest: Color(0xFF06090A),
    surfaceContainerLow: Color(0xFF12191A),
    surfaceContainer: Color(0xFF1A2223),
    surfaceContainerHigh: Color(0xFF212A2B),
    surfaceContainerHighest: Color(0xFF2A3435),
    onSurfaceVariant: Color(0xFF9DA6A4),
    outline: Color(0xFF7E8886),
    outlineVariant: Color(0xFF212B2B),
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: Color(0xFFECEFEE),
    onInverseSurface: Color(0xFF0A0F0F),
    inversePrimary: Color(0xFF0E5A56),
  );

  static ThemeData _build(ColorScheme scheme, AppColorsExt ext) {
    final base = ThemeData(brightness: scheme.brightness, useMaterial3: true);
    final onSurface = scheme.onSurface;
    final onSurfaceVariant = scheme.onSurfaceVariant;

    TextStyle style(
      double size,
      FontWeight weight,
      double height, {
      double letterSpacing = 0,
      Color? color,
    }) {
      return GoogleFonts.manrope(
        fontSize: size,
        fontWeight: weight,
        height: height,
        letterSpacing: letterSpacing,
        color: color ?? onSurface,
      );
    }

    final textTheme = TextTheme(
      displayLarge: style(57, FontWeight.w700, 1.12, letterSpacing: -0.5),
      displayMedium: style(45, FontWeight.w700, 1.16, letterSpacing: -0.4),
      displaySmall: style(36, FontWeight.w700, 1.2, letterSpacing: -0.3),
      headlineLarge: style(30, FontWeight.w700, 1.2, letterSpacing: -0.5),
      headlineMedium: style(24, FontWeight.w700, 1.28, letterSpacing: -0.3),
      headlineSmall: style(20, FontWeight.w600, 1.32, letterSpacing: -0.1),
      titleLarge: style(18, FontWeight.w600, 1.4),
      titleMedium: style(16, FontWeight.w600, 1.4, letterSpacing: 0.1),
      titleSmall: style(14, FontWeight.w600, 1.4, letterSpacing: 0.1),
      bodyLarge: style(16, FontWeight.w400, 1.55),
      bodyMedium: style(14, FontWeight.w400, 1.5),
      bodySmall: style(
        12,
        FontWeight.w400,
        1.45,
        color: onSurfaceVariant,
      ),
      labelLarge: style(14, FontWeight.w600, 1.42, letterSpacing: 0.1),
      labelMedium: style(
        12,
        FontWeight.w500,
        1.33,
        letterSpacing: 0.4,
        color: onSurfaceVariant,
      ),
      labelSmall: style(
        11,
        FontWeight.w500,
        1.3,
        letterSpacing: 0.4,
        color: onSurfaceVariant,
      ),
    );

    final isDark = scheme.brightness == Brightness.dark;

    return base.copyWith(
      scaffoldBackgroundColor: scheme.surface,
      colorScheme: scheme,
      textTheme: textTheme,
      extensions: [ext],
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        foregroundColor: onSurface,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: IconThemeData(color: onSurface),
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarIconBrightness: Brightness.light,
                systemNavigationBarColor: scheme.surface,
                systemNavigationBarIconBrightness: Brightness.light,
              )
            : SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarIconBrightness: Brightness.dark,
                systemNavigationBarColor: scheme.surface,
                systemNavigationBarIconBrightness: Brightness.dark,
              ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant.withValues(alpha: 0.6),
        space: 1,
        thickness: 1,
      ),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainer,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.xl),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size.fromHeight(52),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          elevation: 0,
          minimumSize: const Size.fromHeight(52),
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: onSurface,
          minimumSize: const Size.fromHeight(52),
          textStyle: textTheme.labelLarge,
          side: BorderSide(color: scheme.outlineVariant),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: onSurface),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        selectedColor: scheme.primaryContainer,
        labelStyle: textTheme.labelMedium?.copyWith(color: onSurface),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? scheme.onPrimary
              : scheme.outline,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.surfaceContainerHighest,
        ),
        trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: scheme.primary,
        inactiveTrackColor: scheme.surfaceContainerHighest,
        thumbColor: scheme.primary,
        overlayColor: scheme.primary.withValues(alpha: 0.12),
        valueIndicatorColor: scheme.primary,
        valueIndicatorTextStyle: textTheme.labelMedium?.copyWith(
          color: scheme.onPrimary,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.surfaceContainerHighest,
        circularTrackColor: scheme.surfaceContainerHighest,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surfaceContainer,
        elevation: 0,
        height: 68,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected)
                ? scheme.onPrimaryContainer
                : onSurfaceVariant,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? scheme.onPrimaryContainer
                : onSurfaceVariant,
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: onSurfaceVariant,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.xl),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: scheme.outlineVariant,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppRadius.xxl),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: textTheme.bodyMedium?.copyWith(
          color: scheme.onInverseSurface,
        ),
        actionTextColor: scheme.inversePrimary,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: scheme.inverseSurface,
          borderRadius: BorderRadius.circular(AppRadius.xs),
        ),
        textStyle: textTheme.labelMedium?.copyWith(
          color: scheme.onInverseSurface,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        hintStyle: textTheme.bodyMedium?.copyWith(color: scheme.outline),
        labelStyle: textTheme.labelMedium?.copyWith(color: onSurfaceVariant),
        floatingLabelStyle: textTheme.labelMedium?.copyWith(
          color: scheme.primary,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
      ),
    );
  }
}

/// Mono, tabular-figure text for anything that's a number a parent scans
/// at a glance — screen time, countdowns, percentages. Kept to one face
/// (IBM Plex Mono) used nowhere else, so a metric always reads as data,
/// never mistaken for prose.
extension AppTypographyX on BuildContext {
  TextStyle metricStyle({
    double size = 32,
    FontWeight weight = FontWeight.w700,
    Color? color,
  }) {
    return GoogleFonts.ibmPlexMono(
      fontSize: size,
      fontWeight: weight,
      color: color ?? Theme.of(this).colorScheme.onSurface,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
  }
}
