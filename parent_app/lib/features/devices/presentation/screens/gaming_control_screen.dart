import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/sessions/data/sessions_repository.dart';
import 'package:parent_app/features/sessions/presentation/providers/session_providers.dart';
import 'package:parent_app/shared/constants/disclaimers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';

class GamingControlScreen extends ConsumerWidget {
  const GamingControlScreen({super.key, required this.deviceId});

  final String deviceId;

  Future<void> _toggle(WidgetRef ref, bool locked) async {
    final repo = ref.read(devicesRepositoryProvider);
    if (locked) {
      await repo.unlockInternet(deviceId);
    } else {
      await repo.lockInternet(deviceId);
    }
    ref.invalidate(deviceDetailsProvider(deviceId));
    ref.invalidate(networkStatusProvider(deviceId));
  }

  Future<void> _startTwoHourSession(WidgetRef ref, BuildContext context) async {
    await ref
        .read(sessionsRepositoryProvider)
        .startSession(deviceId: deviceId, durationMinutes: 120);
    ref.invalidate(activeSessionsProvider);
    if (context.mounted) {
      showAppSnackbar(context, '2-hour session started.', type: SnackbarType.success);
    }
  }

  Future<void> _stopSession(WidgetRef ref, BuildContext context, String sessionId) async {
    await ref.read(sessionsRepositoryProvider).stopSession(sessionId);
    ref.invalidate(activeSessionsProvider);
    if (context.mounted) {
      showAppSnackbar(context, 'Session stopped.');
    }
  }

  Future<void> _extendSession(WidgetRef ref, BuildContext context, String sessionId) async {
    await ref
        .read(sessionsRepositoryProvider)
        .extendSession(sessionId: sessionId, extraMinutes: 30);
    ref.invalidate(activeSessionsProvider);
    if (context.mounted) {
      showAppSnackbar(context, 'Session extended by 30 minutes.', type: SnackbarType.success);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceAsync = ref.watch(deviceDetailsProvider(deviceId));
    final networkAsync = ref.watch(networkStatusProvider(deviceId));
    final sessionsAsync = ref.watch(activeSessionsProvider);
    final colors = context.colors;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Gaming Control', showBack: true),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading controls...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceDetailsProvider(deviceId)),
        ),
        data: (device) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(device.name, style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: AppSpacing.space8),
                  Text(
                    device.internetLocked
                        ? 'Internet is currently blocked for this device.'
                        : 'Gaming is allowed right now. Use Pause Gaming to trigger full internet lock.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            GradientButton(
              label: device.internetLocked ? 'Resume Gaming' : 'Pause Gaming',
              onPressed: () => _toggle(ref, device.internetLocked),
              icon: Icon(
                device.internetLocked
                    ? Icons.play_circle_rounded
                    : Icons.pause_circle_rounded,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            sessionsAsync.when(
              loading: () =>
                  const LoadingStateView(message: 'Loading live sessions...', compact: true),
              error: (error, _) => Text(error.toString()),
              data: (sessions) {
                final matching = sessions.where((session) => session.deviceId == device.id);
                final activeSession = matching.isEmpty ? null : matching.first;

                if (activeSession == null) {
                  return Column(
                    children: [
                      GradientButton(
                        label: 'Allow 2 Hours',
                        onPressed: () => _startTwoHourSession(ref, context),
                        icon: const Icon(Icons.av_timer_rounded),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      SecondaryGlassButton(
                        label: 'Custom Session',
                        onPressed: () => context.push('/devices/$deviceId/start-session'),
                        icon: const Icon(Icons.timer_rounded),
                      ),
                    ],
                  );
                }

                return Column(
                  children: [
                    GlassCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Active session', style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: AppSpacing.space8),
                          Text('${activeSession.remainingMinutes} minutes remaining'),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Row(
                      children: [
                        Expanded(
                          child: SecondaryGlassButton(
                            label: 'Stop Session',
                            onPressed: () => _stopSession(ref, context, activeSession.id),
                            icon: const Icon(Icons.stop_circle_outlined),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: SecondaryGlassButton(
                            label: 'Extend 30 Min',
                            onPressed: () => _extendSession(ref, context, activeSession.id),
                            icon: const Icon(Icons.more_time_rounded),
                          ),
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: AppSpacing.md),
            SecondaryGlassButton(
              label: 'Open DNS Guide',
              onPressed: () => context.push('/devices/$deviceId/dns-guide'),
              icon: const Icon(Icons.route_rounded),
            ),
            const SizedBox(height: AppSpacing.xl),
            networkAsync.when(
              loading: () =>
                  const LoadingStateView(message: 'Loading network state...', compact: true),
              error: (error, _) => Text(error.toString()),
              data: (network) => GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          network.dnsConnected
                              ? Icons.check_circle_rounded
                              : Icons.warning_amber_rounded,
                          color: network.dnsConnected ? colors.success : colors.warning,
                        ),
                        const SizedBox(width: AppSpacing.space10),
                        Text(
                          network.dnsConnected ? 'DNS Connected' : 'DNS not verified',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.space12),
                    Text(network.note, style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const InfoNoticeCard(
              title: 'Important limitation',
              message: AppDisclaimers.offlineGamesNotice,
            ),
          ],
        ),
      ),
    );
  }
}
