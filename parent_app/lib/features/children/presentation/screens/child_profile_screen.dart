import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/metric_tile.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/analytics/presentation/providers/analytics_providers.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';

class ChildProfileScreen extends ConsumerWidget {
  const ChildProfileScreen({super.key, required this.childId});

  final String childId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final childAsync = ref.watch(childDetailsProvider(childId));
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(showBack: true),
      child: childAsync.when(
        loading: () => const LoadingStateView(message: 'Loading child profile…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(childDetailsProvider(childId)),
        ),
        data: (child) {
          final usageAsync = ref.watch(dailyUsageProvider(child.id));
          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space8,
              AppSpacing.page,
              48,
            ),
            children: [
              GlassCard(
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 38,
                      backgroundColor: scheme.surfaceContainerHigh,
                      child: Text(
                        child.name.characters.first.toUpperCase(),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.space12),
                    Text(child.name, style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: AppSpacing.space4),
                    Text(
                      '${child.age != null ? '${child.age} years old' : 'Age not set'}'
                      '${child.defaultLimitMinutes != null ? ' • ${child.defaultLimitMinutes}m default limit' : ''}',
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Row(
                      children: [
                        Expanded(
                          child: GradientButton(
                            label: 'Add Device',
                            onPressed: () =>
                                context.push('/devices/add?childId=${child.id}'),
                            icon: const Icon(Icons.add_link_rounded),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              usageAsync.when(
                loading: () => const LoadingStateView(
                  message: 'Loading today\'s usage…',
                  compact: true,
                ),
                error: (error, _) => Text(error.toString()),
                data: (usage) => MetricTileRow(
                  tiles: [
                    MetricTile(
                      icon: Icons.timer_outlined,
                      value: '${usage.totalMinutes}m',
                      label: 'Today',
                    ),
                    MetricTile(
                      icon: Icons.apps_rounded,
                      value: '${usage.bySegment.length}',
                      label: 'Apps',
                    ),
                    MetricTile(
                      icon: Icons.devices_rounded,
                      value: '${child.devices.length}',
                      label: 'Devices',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader(title: 'Assigned Devices'),
              const SizedBox(height: AppSpacing.md),
              if (child.devices.isEmpty)
                const EmptyStateView(
                  icon: Icons.devices_other_rounded,
                  title: 'No devices assigned',
                  message:
                      'Connect a console, TV, phone, or tablet so you can manage sessions and DNS setup.',
                )
              else
                ...child.devices.map(
                  (device) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: GlassCard(
                      onTap: () => context.push('/devices/${device.id}'),
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.space16,
                        vertical: AppSpacing.space4,
                      ),
                      child: AppListTile(
                        title: device.name,
                        subtitle:
                            '${deviceLabel(device.type)} • ${device.dnsConnected ? 'DNS Connected' : 'Needs setup'}',
                        leading: deviceIcon(device.type),
                        leadingColor: deviceAccent(device.type),
                        onTap: () => context.push('/devices/${device.id}'),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
