import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../../data/router_repository.dart';
import '../../domain/router_command_model.dart';
import '../providers/router_providers.dart';

/// Instant Block — "END GAMING SESSION". SmartBlockEngine on the backend
/// picks the best supported strategy for the detected router (disconnect
/// client, pause device, firewall rule, MAC filter, or DNS block, in that
/// priority order) and gateway-agent tries them until one verifiably works;
/// this screen just triggers it and shows which strategy actually landed.
class InstantBlockScreen extends ConsumerStatefulWidget {
  const InstantBlockScreen({super.key, required this.gatewayId, this.initialDeviceId});

  final String gatewayId;
  final String? initialDeviceId;

  @override
  ConsumerState<InstantBlockScreen> createState() => _InstantBlockScreenState();
}

class _InstantBlockScreenState extends ConsumerState<InstantBlockScreen> {
  String? _selectedDeviceId;
  bool _busy = false;
  EndGamingSessionResult? _lastResult;

  @override
  void initState() {
    super.initState();
    _selectedDeviceId = widget.initialDeviceId;
  }

  Future<void> _endSession() async {
    final deviceId = _selectedDeviceId;
    if (deviceId == null) return;

    setState(() => _busy = true);
    try {
      final result = await ref.read(routerRepositoryProvider).endGamingSession(widget.gatewayId, deviceId);
      if (mounted) setState(() => _lastResult = result);
    } catch (error) {
      if (mounted) {
        setState(() => _lastResult = EndGamingSessionResult(enqueued: false, strategies: const [], reason: error.toString()));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final devicesAsync = ref.watch(gamingDevicesProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Instant Block', showBack: true),
      child: devicesAsync.when(
        loading: () => const LoadingStateView(message: 'Loading gaming devices…'),
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
                message: 'Add an Xbox, PlayStation, or Nintendo Switch from the Devices tab first.',
              ),
            );
          }

          DeviceModel? selected;
          for (final device in devices) {
            if (device.id == _selectedDeviceId) {
              selected = device;
              break;
            }
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              if (selected == null) ...[
                Text('Choose a device', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: AppSpacing.md),
                ...devices.map(
                  (device) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: GlassCard(
                      onTap: () => setState(() => _selectedDeviceId = device.id),
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.space16,
                        vertical: AppSpacing.space4,
                      ),
                      child: AppListTile(
                        title: device.name,
                        subtitle: deviceLabel(device.type),
                        leading: deviceIcon(device.type),
                        leadingColor: deviceAccent(device.type),
                        onTap: () => setState(() => _selectedDeviceId = device.id),
                      ),
                    ),
                  ),
                ),
              ] else ...[
                GlassCard(
                  child: Column(
                    children: [
                      Icon(deviceIcon(selected.type), size: 52, color: deviceAccent(selected.type)),
                      const SizedBox(height: AppSpacing.space16),
                      Text(selected.name, style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                      const SizedBox(height: AppSpacing.space8),
                      TextButton(
                        onPressed: () => setState(() {
                          _selectedDeviceId = null;
                          _lastResult = null;
                        }),
                        child: const Text('Choose a different device'),
                      ),
                      const SizedBox(height: AppSpacing.space12),
                      GradientButton(
                        label: 'End Gaming Session',
                        onPressed: _endSession,
                        isBusy: _busy,
                        destructive: true,
                        icon: const Icon(Icons.flash_on_rounded),
                      ),
                    ],
                  ),
                ),
                if (_lastResult != null) ...[
                  const SizedBox(height: AppSpacing.xl),
                  _ResultCard(result: _lastResult!),
                ],
              ],
            ],
          );
        },
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.result});

  final EndGamingSessionResult result;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusBadge(
            label: result.enqueued ? 'Queued for gateway-agent' : 'Not applied',
            color: result.enqueued ? colors.success : colors.warning,
            icon: result.enqueued ? Icons.check_circle_rounded : Icons.error_rounded,
          ),
          const SizedBox(height: AppSpacing.space12),
          if (result.strategies.isNotEmpty) ...[
            Text('Strategy priority queued:', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.space8),
            Text(result.strategies.join(' → '), style: Theme.of(context).textTheme.bodyMedium),
          ],
          if (result.reason != null) ...[
            const SizedBox(height: AppSpacing.space8),
            Text(
              result.reason!,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: AppSpacing.space8),
          Text(
            'Which strategy actually succeeded will show up in Diagnostics once gateway-agent reports back.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
