import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, required this.size, this.iconSize = 32});

  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final scheme = context.scheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: colors.brandGradient,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.35),
            blurRadius: 32,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: SizedBox(
        width: size,
        height: size,
        child: Icon(Icons.shield_rounded, color: colors.onGradient, size: iconSize),
      ),
    );
  }
}
