import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/devices/domain/network_health.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

Color _resolveColor(BuildContext context, HealthColor color) {
  switch (color) {
    case HealthColor.green:
      return context.colors.success;
    case HealthColor.yellow:
      return context.colors.warning;
    case HealthColor.red:
      return Colors.red.shade600;
    case HealthColor.grey:
      return Colors.grey;
  }
}

/// Network Health Score — a household-wide rollup (Router/DNS/Plugin/
/// Security/Stability), computed entirely server-side by
/// NetworkHealthService. This card only presents it, and degrades quietly
/// (nothing shown) if the endpoint errors or is still loading, rather than
/// breaking the rest of the Dashboard over a secondary widget.
class NetworkHealthCard extends ConsumerWidget {
  const NetworkHealthCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(networkHealthProvider);

    return healthAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (health) {
        final overallColor = _resolveColor(context, health.overallColor);
        final textTheme = Theme.of(context).textTheme;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(title: 'Network Health', uppercaseEyebrow: 'Enforcement Engine'),
            const SizedBox(height: AppSpacing.md),
            GlassCard(
              onTap: () => context.push('/network-health'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('Overall Protection', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                      const Spacer(),
                      Text(
                        '${health.overallProtection}%',
                        style: textTheme.titleLarge?.copyWith(color: overallColor, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.space8),
                    child: LinearProgressIndicator(
                      value: health.overallProtection / 100,
                      minHeight: 8,
                      backgroundColor: context.scheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation(overallColor),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.space8,
                    children: [
                      _HealthPill(section: health.router),
                      _HealthPill(section: health.dns),
                      _HealthPill(section: health.plugin),
                      _HealthPill(section: health.vpn, label: 'VPN'),
                      _HealthPill(section: health.privateDns, label: 'Private DNS'),
                      _HealthPill(section: health.doh, label: 'DoH'),
                      _HealthPill(section: health.networkStability, label: 'Internet'),
                    ],
                  ),
                  if (health.lastSynchronization != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'Last synchronized ${_formatRelative(health.lastSynchronization!)}',
                      style: textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

String _formatRelative(DateTime time) {
  final diff = DateTime.now().difference(time);
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

class _HealthPill extends StatelessWidget {
  const _HealthPill({required this.section, this.label});

  final HealthSection section;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = _resolveColor(context, section.color);
    return Tooltip(
      message: section.detail,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text(
              '${label ?? section.label}: ${section.state}',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}
