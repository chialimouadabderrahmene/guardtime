import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class GuardTimeScaffold extends StatelessWidget {
  const GuardTimeScaffold({
    super.key,
    required this.child,
    this.appBar,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.extendBody = false,
    this.useSafeArea = true,
    this.padding,
    this.ambient = true,
  });

  final Widget child;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final bool extendBody;
  final bool useSafeArea;
  final EdgeInsetsGeometry? padding;

  /// Whether to paint the soft ambient glow background. Disable for
  /// dense content screens where it would fight for attention.
  final bool ambient;

  @override
  Widget build(BuildContext context) {
    Widget body = Stack(
      children: [
        if (ambient) const Positioned.fill(child: _AmbientBackground()),
        Positioned.fill(
          child: Padding(
            padding: padding ?? EdgeInsets.zero,
            child: useSafeArea ? SafeArea(child: child) : child,
          ),
        ),
      ],
    );

    return Scaffold(
      extendBody: extendBody,
      backgroundColor: ambient ? Colors.transparent : context.scheme.surface,
      appBar: appBar,
      floatingActionButton: floatingActionButton,
      bottomNavigationBar: bottomNavigationBar,
      body: body,
    );
  }
}

class _AmbientBackground extends StatelessWidget {
  const _AmbientBackground();

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return DecoratedBox(
      decoration: BoxDecoration(color: scheme.surface),
      child: Stack(
        children: [
          Positioned(
            top: -80,
            left: -60,
            child: _GlowOrb(size: 220, color: scheme.primary.withValues(alpha: 0.14)),
          ),
          Positioned(
            right: -80,
            bottom: 100,
            child: _GlowOrb(
              size: 260,
              color: scheme.secondaryContainer.withValues(alpha: 0.14),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: -30,
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
              child: Container(
                height: 150,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      scheme.primary.withValues(alpha: 0.08),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  const _GlowOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
        child: const SizedBox.expand(),
      ),
    );
  }
}
