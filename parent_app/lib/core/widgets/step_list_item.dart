import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Numbered step row — consolidates the three independently duplicated
/// "circle index + title + description" layouts from the DNS setup,
/// platform guide, and offline control guide screens.
class StepListItem extends StatelessWidget {
  const StepListItem({
    super.key,
    required this.index,
    required this.title,
    this.description,
    this.trailing,
  });

  final int index;
  final String title;
  final String? description;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Text(
              '$index',
              style: textTheme.labelLarge?.copyWith(color: scheme.primary),
            ),
          ),
          const SizedBox(width: AppSpacing.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: textTheme.titleMedium),
                if (description != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    description!,
                    style: textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: AppSpacing.space8), trailing!],
        ],
      ),
    );
  }
}
