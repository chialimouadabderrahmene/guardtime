/// 8-point spacing scale. Prefer these over raw numeric literals.
abstract final class AppSpacing {
  static const space2 = 2.0;
  static const space4 = 4.0;
  static const space6 = 6.0;
  static const space8 = 8.0;
  static const space10 = 10.0;
  static const space12 = 12.0;
  static const space14 = 14.0;
  static const space16 = 16.0;
  static const space20 = 20.0;
  static const space24 = 24.0;
  static const space32 = 32.0;
  static const space40 = 40.0;
  static const space48 = 48.0;
  static const space64 = 64.0;

  // Legacy aliases kept for call sites during migration.
  static const xs = space4;
  static const sm = space8;
  static const md = space16;
  static const lg = space24;
  static const xl = space32;
  static const xxl = space40;

  /// Standard horizontal page padding.
  static const page = space24;
}

/// Consistent corner-radius scale.
abstract final class AppRadius {
  static const xs = 8.0;
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 24.0;
  static const xxl = 28.0;
  static const pill = 999.0;

  // Legacy aliases.
  static const radiusMd = sm;
  static const radiusLg = md;
  static const radiusXl = xl;
  static const radiusPill = pill;
}

/// Elevation levels expressed as blur/offset/opacity so both themes can
/// tint the shadow color to match their surface.
abstract final class AppElevation {
  static const level0 = _Elevation(blur: 0, spread: 0, dy: 0, opacity: 0);
  static const level1 = _Elevation(blur: 12, spread: 0, dy: 4, opacity: 0.10);
  static const level2 = _Elevation(blur: 20, spread: 0, dy: 8, opacity: 0.14);
  static const level3 = _Elevation(blur: 30, spread: 0, dy: 16, opacity: 0.18);
  static const level4 = _Elevation(blur: 40, spread: 0, dy: 22, opacity: 0.22);
}

class _Elevation {
  const _Elevation({
    required this.blur,
    required this.spread,
    required this.dy,
    required this.opacity,
  });

  final double blur;
  final double spread;
  final double dy;
  final double opacity;
}

typedef AppElevationLevel = _Elevation;
