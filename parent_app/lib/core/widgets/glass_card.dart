import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// The app's single card primitive — a softly blurred, elevated surface.
/// Every card-like container in the app should use this instead of a
/// bespoke [Container]/[BoxDecoration] so radius, shadow, and glass
/// treatment stay consistent and theme-aware.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.space20),
    this.borderRadius = AppRadius.xl,
    this.onTap,
    this.glass = true,
    this.border = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;
  final VoidCallback? onTap;

  /// When false, renders a flat theme surface (no blur) — use for cards
  /// nested inside another card or list, where a blur is wasted GPU work.
  final bool glass;
  final bool border;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final scheme = context.scheme;

    final decoration = BoxDecoration(
      color: glass ? colors.glassFill : scheme.surfaceContainer,
      borderRadius: BorderRadius.circular(borderRadius),
      border: border ? Border.all(color: colors.glassBorder) : null,
      boxShadow: [
        BoxShadow(
          color: colors.ambientShadow,
          blurRadius: 30,
          offset: const Offset(0, 16),
        ),
      ],
    );

    Widget card = Container(decoration: decoration, padding: padding, child: child);

    if (glass) {
      card = ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: card,
        ),
      );
    } else {
      card = ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: card,
      );
    }

    if (onTap == null) {
      return card;
    }

    return Stack(
      children: [
        card,
        Positioned.fill(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(borderRadius),
            child: Material(
              color: Colors.transparent,
              child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(borderRadius)),
            ),
          ),
        ),
      ],
    );
  }
}
