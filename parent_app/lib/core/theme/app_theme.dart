import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_spacing.dart';

abstract final class AppTheme {
  static ThemeData light() => _build(_lightScheme, AppColorsExt.light);

  static ThemeData dark() => _build(_darkScheme, AppColorsExt.dark);

  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF1B8A4A),
    onPrimary: Colors.white,
    primaryContainer: Color(0xFFEAFBEF),
    onPrimaryContainer: Color(0xFF15703B),
    secondary: Color(0xFF15703B),
    onSecondary: Colors.white,
    secondaryContainer: Color(0xFFDCF3E1),
    onSecondaryContainer: Color(0xFF0C4025),
    tertiary: Color(0xFFB8720A),
    onTertiary: Colors.white,
    tertiaryContainer: Color(0xFFFFE9C7),
    onTertiaryContainer: Color(0xFF5C3D00),
    error: Color(0xFFBA1B23),
    onError: Colors.white,
    errorContainer: Color(0xFFFFDAD6),
    onErrorContainer: Color(0xFF410002),
    surface: Color(0xFFF7FAF8),
    onSurface: Color(0xFF101B14),
    surfaceContainerLowest: Colors.white,
    surfaceContainerLow: Color(0xFFF1F6F2),
    surfaceContainer: Color(0xFFE9F1EA),
    surfaceContainerHigh: Color(0xFFE1EBE3),
    surfaceContainerHighest: Color(0xFFD9E5DB),
    onSurfaceVariant: Color(0xFF45514A),
    outline: Color(0xFF75817A),
    outlineVariant: Color(0xFFC5D1C7),
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: Color(0xFF101B14),
    onInverseSurface: Color(0xFFF7FAF8),
    inversePrimary: Color(0xFFA8E6B8),
  );

  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF2ECC71),
    onPrimary: Colors.white,
    primaryContainer: Color(0xFF15703B),
    onPrimaryContainer: Color(0xFFEAFBEF),
    secondary: Color(0xFFC5E8CE),
    onSecondary: Color(0xFF0C2415),
    secondaryContainer: Color(0xFF1B8A4A),
    onSecondaryContainer: Colors.white,
    tertiary: Color(0xFFFFD6A5),
    onTertiary: Color(0xFF452B00),
    tertiaryContainer: Color(0xFFE8961B),
    onTertiaryContainer: Colors.white,
    error: Color(0xFFFFB4AB),
    onError: Color(0xFF690005),
    errorContainer: Color(0xFF93000A),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: Color(0xFF0B1A12),
    onSurface: Color(0xFFE4F0E8),
    surfaceContainerLowest: Color(0xFF081410),
    surfaceContainerLow: Color(0xFF122119),
    surfaceContainer: Color(0xFF162820),
    surfaceContainerHigh: Color(0xFF1F3228),
    surfaceContainerHighest: Color(0xFF283D30),
    onSurfaceVariant: Color(0xFFB4CCBA),
    outline: Color(0xFF7E9A88),
    outlineVariant: Color(0xFF344D3C),
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: Color(0xFFE4F0E8),
    onInverseSurface: Color(0xFF0B1A12),
    inversePrimary: Color(0xFF1B8A4A),
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
      return GoogleFonts.inter(
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
