import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../providers/router_providers.dart';

/// Gaming Devices — reuses the existing Devices feature's data (no separate
/// discovery mechanism), filtered to the console types the SmartBlockEngine
/// actually targets.
class GamingDevicesScreen extends ConsumerWidget {
  const GamingDevicesScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devicesAsync = ref.watch(gamingDevicesProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Gaming Devices', showBack: true),
      child: devicesAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 3),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(gamingDevicesProvider),
        ),
        data: (devices) {
          if (devices.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(AppSpacing.page),
              child: EmptyStateView(
                icon: Icons.sports_esports_outlined,
                title: 'No gaming devices yet',
                message: 'Add an Xbox, PlayStation, or Nintendo Switch from the Devices tab to control it here.',
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(gamingDevicesProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space12,
                AppSpacing.page,
                48,
              ),
              children: devices
                  .map(
                    (device) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: GlassCard(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.space16,
                          vertical: AppSpacing.space4,
                        ),
                        child: AppListTile(
                          title: device.name,
                          subtitle: '${deviceLabel(device.type)}${device.ipAddress != null ? ' • ${device.ipAddress}' : ''}',
                          leading: deviceIcon(device.type),
                          leadingColor: deviceAccent(device.type),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              StatusBadge(
                                label: device.status,
                                color: device.status == 'ONLINE' ? Colors.green : Colors.grey,
                              ),
                              const SizedBox(width: AppSpacing.space8),
                              OutlinedButton(
                                onPressed: () => context.push(
                                  '/routers/$gatewayId/instant-block?deviceId=${device.id}',
                                ),
                                child: const Text('Block'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          );
        },
      ),
    );
  }
}
