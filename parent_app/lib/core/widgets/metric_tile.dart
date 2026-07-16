import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Shared "icon + value + label" stat tile — consolidates the
/// independently duplicated _MetricTile / _MiniMetric implementations
/// that used to live in child_profile_screen and device_details_screen.
class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    this.accent,
    this.compact = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color? accent;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final textTheme = Theme.of(context).textTheme;
    final color = accent ?? scheme.primary;

    return Container(
      padding: EdgeInsets.all(compact ? AppSpacing.space12 : AppSpacing.space16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: compact ? 18 : 20),
          SizedBox(height: compact ? AppSpacing.space8 : AppSpacing.space12),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: (compact ? textTheme.titleMedium : textTheme.headlineSmall),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

/// Lays out [MetricTile]s in an evenly-spaced row that wraps gracefully
/// on narrow screens instead of overflowing.
class MetricTileRow extends StatelessWidget {
  const MetricTileRow({super.key, required this.tiles});

  final List<MetricTile> tiles;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(width: AppSpacing.space12),
          Expanded(child: tiles[i]),
        ],
      ],
    );
  }
}
