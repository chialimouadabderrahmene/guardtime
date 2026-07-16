import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class ActionGridItem {
  const ActionGridItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
}

/// Responsive icon-action grid — replaces device_details_screen's private
/// `_ActionButton` + manual `Wrap` width math, and adapts to tablet/
/// foldable widths instead of assuming a fixed 2-column phone layout.
class ActionGrid extends StatelessWidget {
  const ActionGrid({super.key, required this.items});

  final List<ActionGridItem> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 640
            ? 4
            : constraints.maxWidth >= 420
            ? 3
            : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: AppSpacing.space12,
            crossAxisSpacing: AppSpacing.space12,
            childAspectRatio: 1.15,
          ),
          itemBuilder: (context, index) => _ActionTile(item: items[index]),
        );
      },
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.item});

  final ActionGridItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final color = item.color ?? scheme.primary;
    return Material(
      color: scheme.surfaceContainerHigh.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(AppRadius.md),
      child: InkWell(
        onTap: item.onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.space12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(item.icon, color: color, size: 20),
              ),
              const SizedBox(height: AppSpacing.space8),
              Text(
                item.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
