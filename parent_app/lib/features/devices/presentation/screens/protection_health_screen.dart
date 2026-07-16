import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/core/widgets/metric_tile.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/devices/domain/device_health.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/devices/presentation/widgets/health_status_badge.dart';

class ProtectionHealthScreen extends ConsumerWidget {
  const ProtectionHealthScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(deviceHealthSummaryProvider);
    final scheme = context.scheme;
    final colors = context.colors;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Protection Health', showBack: true),
      child: healthAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 4),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceHealthSummaryProvider),
        ),
        data: (summary) {
          if (summary.total == 0) {
            return const Padding(
              padding: EdgeInsets.all(AppSpacing.page),
              child: EmptyStateView(
                icon: Icons.shield_outlined,
                title: 'No devices yet',
                message:
                    'Add a device and set up DNS filtering to see its live protection status here.',
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(deviceHealthSummaryProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space12,
                AppSpacing.page,
                48,
              ),
              children: [
                MetricTileRow(
                  tiles: [
                    MetricTile(
                      icon: Icons.verified_user_rounded,
                      value: '${summary.protectedCount}',
                      label: 'Protected',
                      accent: colors.success,
                    ),
                    MetricTile(
                      icon: Icons.gpp_maybe_rounded,
                      value: '${summary.needsAttentionCount}',
                      label: 'Attention',
                      accent: summary.needsAttentionCount > 0 ? scheme.error : null,
                    ),
                    MetricTile(
                      icon: Icons.settings_suggest_rounded,
                      value: '${summary.notConfiguredCount}',
                      label: 'Not set up',
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(
                  title: 'Devices',
                  uppercaseEyebrow: 'Live status',
                ),
                const SizedBox(height: AppSpacing.md),
                ...summary.devices.map(
                  (health) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _HealthCard(health: health),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _HealthCard extends StatelessWidget {
  const _HealthCard({required this.health});

  final DeviceHealth health;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final visual = healthVisual(context, health.state);
    return GlassCard(
      onTap: () => context.push('/devices/${health.deviceId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: deviceAccent(health.type).withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(deviceIcon(health.type), color: deviceAccent(health.type)),
              ),
              const SizedBox(width: AppSpacing.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      health.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text(
                      deviceLabel(health.type),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.space8),
              HealthStatusBadge(state: health.state),
            ],
          ),
          const SizedBox(height: AppSpacing.space12),
          Text(
            health.message,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          if (health.recommendedAction != null) ...[
            const SizedBox(height: AppSpacing.space10),
            Row(
              children: [
                Icon(Icons.arrow_forward_rounded, size: 16, color: visual.color),
                const SizedBox(width: AppSpacing.space8),
                Expanded(
                  child: Text(
                    health.recommendedAction!,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(color: visual.color),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
