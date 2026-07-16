import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/action_grid.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceAsync = ref.watch(deviceDetailsProvider(deviceId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(showBack: true),
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
