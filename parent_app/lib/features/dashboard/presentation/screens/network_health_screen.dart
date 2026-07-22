import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
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

/// Full-page Network Health Score — every section from the Dashboard card,
/// with its real reasoning ("detail"). No historical trend chart: this
/// service computes a live snapshot only, no time-series is persisted yet,
/// so a trend graph here would have to be fabricated — omitted honestly
/// rather than faked.
class NetworkHealthScreen extends ConsumerWidget {
  const NetworkHealthScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(networkHealthProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Network Health', showBack: true),
      child: healthAsync.when(
        loading: () => const LoadingStateView(message: 'Checking network health…'),
        error: (error, _) => ErrorStateView(message: error.toString(), onRetry: () => ref.invalidate(networkHealthProvider)),
        data: (health) {
          final sections = [
            health.router,
            health.dns,
            health.plugin,
            health.security,
            health.vpn,
            health.privateDns,
            health.doh,
            health.networkStability,
          ];

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(networkHealthProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.space12, AppSpacing.page, 48),
              children: [
                const SectionHeader(title: 'Overall Protection', uppercaseEyebrow: 'Enforcement Engine'),
                const SizedBox(height: AppSpacing.md),
                GlassCard(
                  child: Row(
                    children: [
                      Text(
                        '${health.overallProtection}%',
                        style: Theme.of(context).textTheme.displaySmall?.copyWith(
                          color: _resolveColor(context, health.overallColor),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.lg),
                      Expanded(
                        child: Text(
                          health.lastSynchronization != null
                              ? 'Last synchronized ${health.lastSynchronization}'
                              : 'No gateway has synchronized yet.',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(title: 'Sections'),
                const SizedBox(height: AppSpacing.md),
                for (final section in sections)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: GlassCard(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(color: _resolveColor(context, section.color), shape: BoxShape.circle),
                          ),
                          const SizedBox(width: AppSpacing.space12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(section.label, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                                    const Spacer(),
                                    Text(
                                      section.state,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.labelLarge?.copyWith(color: _resolveColor(context, section.color), fontWeight: FontWeight.w700),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(section.detail, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ],
                      ),
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
