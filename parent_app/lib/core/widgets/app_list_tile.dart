import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Shared "leading icon/avatar + title + subtitle + trailing" row used
/// across children, devices, and dashboard lists. Consolidates what used
/// to be four independently hand-rolled row layouts.
class AppListTile extends StatelessWidget {
  const AppListTile({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.leadingColor,
    this.trailing,
    this.onTap,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final IconData? leading;
  final Color? leadingColor;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final textTheme = Theme.of(context).textTheme;
    final color = leadingColor ?? scheme.primary;
    final boxSize = dense ? 40.0 : 48.0;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: EdgeInsets.symmetric(
            vertical: dense ? AppSpacing.space8 : AppSpacing.space12,
          ),
          child: Row(
            children: [
              if (leading != null) ...[
                Container(
                  width: boxSize,
                  height: boxSize,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Icon(leading, color: color, size: dense ? 20 : 22),
                ),
                const SizedBox(width: AppSpacing.space12),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: dense ? textTheme.bodyLarge : textTheme.titleMedium,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall,
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.space8),
                trailing!,
              ] else if (onTap != null)
                Icon(Icons.chevron_right_rounded, color: scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
