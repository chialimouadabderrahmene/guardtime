import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/action_grid.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/metric_tile.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/analytics/presentation/providers/analytics_providers.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/features/devices/domain/network_status_model.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/pairing/domain/pairing_models.dart';
import 'package:parent_app/features/pairing/presentation/providers/pairing_providers.dart';
import 'package:parent_app/features/sessions/presentation/providers/session_providers.dart';
import 'package:parent_app/shared/constants/disclaimers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

class DeviceDetailsScreen extends ConsumerWidget {
  const DeviceDetailsScreen({super.key, required this.deviceId});

  final String deviceId;

  Future<void> _toggleLock(WidgetRef ref, bool locked) async {
    final repo = ref.read(devicesRepositoryProvider);
    if (locked) {
      await repo.unlockInternet(deviceId);
    } else {
      await repo.lockInternet(deviceId);
    }
    ref.invalidate(deviceDetailsProvider(deviceId));
    ref.invalidate(networkStatusProvider(deviceId));
    ref.invalidate(devicesListProvider);
  }

  Future<void> _renameDevice(
    BuildContext context,
    WidgetRef ref,
    String currentName,
  ) async {
    final controller = TextEditingController(text: currentName);
    final newName = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Rename device'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Device name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (newName == null || newName.isEmpty || newName == currentName) return;
    if (!context.mounted) return;

    try {
      await ref.read(devicesRepositoryProvider).updateDevice(deviceId, name: newName);
      ref.invalidate(deviceDetailsProvider(deviceId));
      ref.invalidate(devicesListProvider);
      if (context.mounted) {
        showAppSnackbar(context, 'Device renamed', type: SnackbarType.success);
      }
    } catch (error) {
      if (context.mounted) {
        showAppSnackbar(context, error.toString(), type: SnackbarType.error);
      }
    }
  }

  Future<void> _deleteDevice(
    BuildContext context,
    WidgetRef ref,
    String deviceName,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete device?'),
        content: Text(
          'This removes "$deviceName" and its protection history. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.error,
            ),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!context.mounted) return;

    try {
      await ref.read(devicesRepositoryProvider).deleteDevice(deviceId);
      ref.invalidate(devicesListProvider);
      if (context.mounted) {
        showAppSnackbar(context, 'Device deleted', type: SnackbarType.success);
        context.go('/devices');
      }
    } catch (error) {
      if (context.mounted) {
        showAppSnackbar(context, error.toString(), type: SnackbarType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceAsync = ref.watch(deviceDetailsProvider(deviceId));
    final loadedDevice = deviceAsync.valueOrNull;

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        showBack: true,
        actions: [
          if (loadedDevice != null)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert_rounded),
              onSelected: (value) {
                if (value == 'rename') {
                  _renameDevice(context, ref, loadedDevice.name);
                } else if (value == 'delete') {
                  _deleteDevice(context, ref, loadedDevice.name);
                }
              },
              itemBuilder: (menuContext) => [
                const PopupMenuItem(
                  value: 'rename',
                  child: ListTile(
                    leading: Icon(Icons.edit_outlined),
                    title: Text('Rename'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                PopupMenuItem(
                  value: 'delete',
                  child: ListTile(
                    leading: Icon(
                      Icons.delete_outline_rounded,
                      color: Theme.of(menuContext).colorScheme.error,
                    ),
                    title: Text(
                      'Delete',
                      style: TextStyle(color: Theme.of(menuContext).colorScheme.error),
                    ),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
        ],
      ),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading device details...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceDetailsProvider(deviceId)),
        ),
        data: (device) {
          final usageAsync = ref.watch(deviceUsageProvider(deviceId));
          final networkAsync = ref.watch(networkStatusProvider(deviceId));
          final sessionsAsync = ref.watch(activeSessionsProvider);
          final connectionStatsAsync = ref.watch(connectionStatsProvider(deviceId));

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              _DeviceHeaderCard(device: device),
              const SizedBox(height: AppSpacing.xl),
              SectionHeader(
                title: 'Connection',
                actionLabel: device.paired ? null : 'Finish setup',
                onAction: device.paired
                    ? null
                    : () => context.push(
                        '/devices/$deviceId/pair-setup',
                        extra: device.name,
                      ),
              ),
              const SizedBox(height: AppSpacing.md),
              connectionStatsAsync.when(
                loading: () => const LoadingStateView(
                  message: 'Loading connection status...',
                  compact: true,
                ),
                error: (error, _) => Text(error.toString()),
                data: (stats) => _ConnectionStatusCard(
                  device: device,
                  stats: stats,
                  onFinishPairing: () => context.push(
                    '/devices/$deviceId/pair-setup',
                    extra: device.name,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              usageAsync.when(
                loading: () =>
                    const LoadingStateView(message: 'Loading usage...', compact: true),
                error: (error, _) => Text(error.toString()),
                data: (usage) => MetricTileRow(
                  tiles: [
                    MetricTile(
                      icon: Icons.timer_outlined,
                      value: '${usage.totalMinutes}m',
                      label: "Today's usage",
                    ),
                    sessionsAsync.when(
                      data: (sessions) {
                        final active = sessions.where(
                          (session) => session.deviceId == device.id,
                        );
                        final current = active.isEmpty ? null : active.first;
                        return MetricTile(
                          icon: Icons.bolt_rounded,
                          value: current == null ? 'Idle' : '${current.remainingMinutes}m',
                          label: current == null ? 'No live session' : current.status,
                        );
                      },
                      loading: () => const MetricTile(
                        icon: Icons.bolt_rounded,
                        value: '--',
                        label: 'Loading',
                      ),
                      error: (error, stackTrace) => const MetricTile(
                        icon: Icons.bolt_rounded,
                        value: '--',
                        label: 'Unavailable',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              GradientButton(
                label: device.internetLocked ? 'Resume Gaming' : 'Pause Gaming',
                onPressed: () => _toggleLock(ref, device.internetLocked),
                icon: Icon(
                  device.internetLocked
                      ? Icons.play_circle_rounded
                      : Icons.pause_circle_rounded,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              ActionGrid(
                items: [
                  ActionGridItem(
                    icon: Icons.timer_outlined,
                    label: 'Start Session',
                    onTap: () => context.push('/devices/$deviceId/start-session'),
                  ),
                  ActionGridItem(
                    icon: Icons.lan_outlined,
                    label: 'Network Status',
                    onTap: () => context.push('/devices/$deviceId/network-status'),
                  ),
                  ActionGridItem(
                    icon: Icons.sports_esports_rounded,
                    label: 'Gaming Control',
                    onTap: () => context.push('/devices/$deviceId/gaming'),
                  ),
                  ActionGridItem(
                    icon: Icons.route_rounded,
                    label: 'DNS Guide',
                    onTap: () => context.push('/devices/$deviceId/dns-guide'),
                  ),
                  ActionGridItem(
                    icon: Icons.lock_outline_rounded,
                    label: 'Full Lock',
                    onTap: () => context.push('/devices/$deviceId/full-lock'),
                  ),
                  ActionGridItem(
                    icon: Icons.schedule_rounded,
                    label: 'Schedule Rules',
                    onTap: () => context.push('/devices/$deviceId/schedule'),
                  ),
                  ActionGridItem(
                    icon: Icons.shield_outlined,
                    label: 'Protection',
                    onTap: () => context.push('/devices/$deviceId/protection'),
                  ),
                  ActionGridItem(
                    icon: Icons.analytics_outlined,
                    label: 'Insights',
                    onTap: () => context.push('/devices/$deviceId/insights'),
                  ),
                  ActionGridItem(
                    icon: Icons.menu_book_outlined,
                    label: 'Offline Guide',
                    onTap: () => context.push('/devices/$deviceId/offline-guide'),
                  ),
                  ActionGridItem(
                    icon: Icons.checklist_rounded,
                    label: 'Checklist',
                    onTap: () => context.push('/devices/$deviceId/offline-checklist'),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              SectionHeader(
                title: 'Protection Status',
                actionLabel: 'View guide',
                onAction: () => context.push('/devices/$deviceId/dns-guide'),
              ),
              const SizedBox(height: AppSpacing.md),
              networkAsync.when(
                loading: () =>
                    const LoadingStateView(message: 'Loading DNS status...', compact: true),
                error: (error, _) => Text(error.toString()),
                data: (network) => _ProtectionStatusCard(network: network),
              ),
              if (hasOfflineLimitations(device.type)) ...[
                const SizedBox(height: AppSpacing.xl),
                const InfoNoticeCard(
                  title: 'Important limitation',
                  message: AppDisclaimers.offlineGamesNotice,
                  icon: Icons.info_outline_rounded,
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader(title: 'Recent Activity'),
              const SizedBox(height: AppSpacing.md),
              usageAsync.when(
                loading: () => const LoadingStateView(
                  message: 'Loading recent activity...',
                  compact: true,
                ),
                error: (error, _) => Text(error.toString()),
                data: (usage) {
                  if (usage.recentLogs.isEmpty) {
                    return const GlassCard(
                      child: Text('No usage logs yet for this device.'),
                    );
                  }
                  return Column(
                    children: usage.recentLogs.take(5).map((log) {
                      final minutes = (log.durationSeconds / 60).round();
                      final time = log.loggedAt == null
                          ? ''
                          : '${log.loggedAt!.hour.toString().padLeft(2, '0')}:${log.loggedAt!.minute.toString().padLeft(2, '0')}';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: GlassCard(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.space16,
                            vertical: AppSpacing.space4,
                          ),
                          child: AppListTile(
                            title: log.appName ?? 'Unknown app',
                            subtitle: time.isEmpty ? '${minutes}m' : '${minutes}m • $time',
                            leading: Icons.sports_esports_rounded,
                          ),
                        ),
                      );
                    }).toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _DeviceHeaderCard extends StatelessWidget {
  const _DeviceHeaderCard({required this.device});

  final DeviceModel device;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    final accent = deviceAccent(device.type);
    return GlassCard(
      child: Column(
        children: [
          Container(
            width: 84,
            height: 84,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(AppRadius.xl),
            ),
            child: Icon(deviceIcon(device.type), size: 42, color: accent),
          ),
          const SizedBox(height: AppSpacing.space16),
          Text(device.name, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: AppSpacing.space4 + 2),
          Text(
            '${deviceLabel(device.type)}${device.childName != null ? ' | ${device.childName}' : ''}',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.space12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: [
              ConnectedBadge(
                connected: device.dnsConnected,
                connectedLabel: 'DNS Connected',
                disconnectedLabel: 'DNS Waiting',
              ),
              if (device.protectionScore != null)
                StatusBadge(
                  label: 'Score ${device.protectionScore}',
                  color: scheme.primary,
                ),
              StatusBadge(
                label: device.protectionStatus,
                color: device.internetLocked ? scheme.error : colors.warning,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ConnectionStatusCard extends StatelessWidget {
  const _ConnectionStatusCard({
    required this.device,
    required this.stats,
    required this.onFinishPairing,
  });

  final DeviceModel device;
  final ConnectionStats stats;
  final VoidCallback onFinishPairing;

  String _qualityLabel(ConnectionQuality quality) {
    switch (quality) {
      case ConnectionQuality.excellent:
        return 'Excellent';
      case ConnectionQuality.good:
        return 'Good';
      case ConnectionQuality.poor:
        return 'Poor';
      case ConnectionQuality.offline:
        return 'Offline';
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;

    if (!stats.paired) {
      return GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.error_outline_rounded, color: colors.warning),
                const SizedBox(width: AppSpacing.space8),
                Text('Not paired yet', style: Theme.of(context).textTheme.titleLarge),
              ],
            ),
            const SizedBox(height: AppSpacing.space12),
            Text(
              'This device has never confirmed a DNS connection. Finish the guided setup to pair it automatically.',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: AppSpacing.space16),
            GradientButton(label: 'Finish Setup', onPressed: onFinishPairing),
          ],
        ),
      );
    }

    final quality = stats.connectionQuality;
    final connected = quality != ConnectionQuality.offline;
    final qualityColor = switch (quality) {
      ConnectionQuality.excellent => colors.success,
      ConnectionQuality.good => colors.success,
      ConnectionQuality.poor => colors.warning,
      ConnectionQuality.offline => scheme.error,
    };

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                connected ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                color: qualityColor,
              ),
              const SizedBox(width: AppSpacing.space8),
              Text(
                connected ? 'Connected' : 'Not seen recently',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const Spacer(),
              StatusBadge(label: _qualityLabel(quality), color: qualityColor),
            ],
          ),
          const SizedBox(height: AppSpacing.space16),
          _ConnectionDetailRow(
            label: 'Resolver',
            value: stats.resolverRegion ?? 'Default',
          ),
          _ConnectionDetailRow(
            label: 'Public IP',
            value: stats.publicIp ?? 'Unknown',
          ),
          _ConnectionDetailRow(
            label: 'Last DNS query',
            value: stats.lastQueryDomain ?? 'None yet',
          ),
          _ConnectionDetailRow(
            label: 'Queries today',
            value: '${stats.queriesToday}',
          ),
          _ConnectionDetailRow(
            label: 'Last heartbeat',
            value: stats.lastDnsSeenAt == null
                ? 'No heartbeat yet'
                : DateFormat('MMM d, HH:mm').format(stats.lastDnsSeenAt!),
          ),
          _ConnectionDetailRow(
            label: 'Protection',
            value: device.internetLocked ? 'Full lock active' : 'Active',
          ),
        ],
      ),
    );
  }
}

class _ConnectionDetailRow extends StatelessWidget {
  const _ConnectionDetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProtectionStatusCard extends StatelessWidget {
  const _ProtectionStatusCard({required this.network});

  final NetworkStatusModel network;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    final connected = network.dnsConnected;
    final lastSeenAt = network.lastDnsSeenAt;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                connected ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                color: connected ? colors.success : colors.warning,
              ),
              const SizedBox(width: AppSpacing.space8),
              Text(
                connected ? 'DNS Connected' : 'DNS Setup Needed',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.space12),
          Text(network.note, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: AppSpacing.space8),
          Text(
            'Last DNS heartbeat: ${lastSeenAt == null ? 'No heartbeat yet' : DateFormat('MMM d, HH:mm').format(lastSeenAt)}',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
