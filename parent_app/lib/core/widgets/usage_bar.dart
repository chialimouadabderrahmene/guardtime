import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Labeled horizontal progress bar for per-segment usage breakdowns.
class UsageBar extends StatelessWidget {
  const UsageBar({super.key, required this.label, required this.value, required this.maxValue});

  final String label;
  final int value;
  final int maxValue;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final progress = maxValue == 0 ? 0.0 : value / maxValue;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            Text('${value}m', style: Theme.of(context).textTheme.labelLarge),
          ],
        ),
        const SizedBox(height: AppSpacing.space8),
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.pill),
          child: LinearProgressIndicator(
            minHeight: 8,
            value: progress.clamp(0, 1),
            backgroundColor: scheme.surfaceContainerHigh,
          ),
        ),
      ],
    );
  }
}
