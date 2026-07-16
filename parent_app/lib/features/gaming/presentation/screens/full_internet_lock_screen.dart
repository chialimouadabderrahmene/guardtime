import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/shared/constants/disclaimers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

class FullInternetLockScreen extends ConsumerStatefulWidget {
  const FullInternetLockScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  ConsumerState<FullInternetLockScreen> createState() => _FullInternetLockScreenState();
}

class _FullInternetLockScreenState extends ConsumerState<FullInternetLockScreen> {
  bool _saving = false;

  Future<void> _toggleLock(bool currentlyLocked) async {
    setState(() => _saving = true);
    final repo = ref.read(devicesRepositoryProvider);
    try {
      if (currentlyLocked) {
        await repo.unlockInternet(widget.deviceId);
      } else {
        await repo.lockInternet(widget.deviceId);
      }
      ref.invalidate(deviceDetailsProvider(widget.deviceId));
      ref.invalidate(networkStatusProvider(widget.deviceId));
      ref.invalidate(devicesListProvider);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final deviceAsync = ref.watch(deviceDetailsProvider(widget.deviceId));
    final scheme = context.scheme;
    final colors = context.colors;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Full Internet Lock', showBack: true),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading lock status...'),
        error: (error, _) => Center(child: Text(error.toString())),
        data: (device) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            Row(
              children: [
                ConnectedBadge(
                  connected: device.dnsConnected,
                  connectedLabel: 'DNS Connected',
                  disconnectedLabel: 'DNS Waiting',
                ),
                const SizedBox(width: AppSpacing.space10),
                StatusBadge(
                  label: device.internetLocked ? 'Locked' : 'Unlocked',
                  color: device.internetLocked ? scheme.error : colors.success,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            Text(device.name, style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: AppSpacing.space10),
            Text(
              'Use full internet lock when you want this device completely offline for online services right now.',
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.xl),
            GradientButton(
              label: device.internetLocked ? 'Resume Internet Access' : 'Pause Gaming',
              onPressed: () => _toggleLock(device.internetLocked),
              isBusy: _saving,
              icon: Icon(
                device.internetLocked
                    ? Icons.play_circle_rounded
                    : Icons.pause_circle_rounded,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              onPressed: () => context.push('/devices/${widget.deviceId}/start-session'),
              icon: const Icon(Icons.timer_outlined),
              label: const Text('Allow 2 Hours or custom session'),
            ),
            const SizedBox(height: AppSpacing.xl),
            const InfoNoticeCard(
              title: 'Honest limitation',
              message: AppDisclaimers.offlineGamesNotice,
              icon: Icons.report_gmailerrorred_rounded,
            ),
          ],
        ),
      ),
    );
  }
}
