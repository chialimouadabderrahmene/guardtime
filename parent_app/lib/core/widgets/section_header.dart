import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
    this.uppercaseEyebrow,
  });

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final String? uppercaseEyebrow;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (uppercaseEyebrow != null) ...[
          Text(
            uppercaseEyebrow!.toUpperCase(),
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: scheme.primary,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: AppSpacing.space4 + 2),
        ],
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            if (actionLabel != null && onAction != null)
              TextButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ),
      ],
    );
  }
}
