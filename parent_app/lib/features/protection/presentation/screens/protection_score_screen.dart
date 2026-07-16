import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/protection/presentation/providers/protection_providers.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

class ProtectionScoreScreen extends ConsumerWidget {
  const ProtectionScoreScreen({super.key, required this.deviceId});

  final String deviceId;

  Color _levelColor(BuildContext context, String level) {
    final colors = context.colors;
    return switch (level) {
      'HIGH' => colors.success,
      'MEDIUM' => colors.warning,
      _ => context.scheme.error,
    };
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scoreAsync = ref.watch(protectionScoreProvider(deviceId));
    final deviceAsync = ref.watch(deviceDetailsProvider(deviceId));
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Protection Score', showBack: true),
      child: scoreAsync.when(
        loading: () => const LoadingStateView(message: 'Loading protection score...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(protectionScoreProvider(deviceId)),
        ),
        data: (score) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            deviceAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (error, stackTrace) => const SizedBox.shrink(),
              data: (device) => Row(
                children: [
                  ConnectedBadge(
                    connected: device.dnsConnected,
                    connectedLabel: 'Connected',
                    disconnectedLabel: 'Disconnected',
                  ),
                  const SizedBox(width: AppSpacing.space10),
                  StatusBadge(
                    label: device.protectionStatus,
                    color: _levelColor(context, score.level),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            GlassCard(
              child: Column(
                children: [
                  SizedBox(
                    width: 160,
                    height: 160,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        SizedBox(
                          width: 160,
                          height: 160,
                          child: CircularProgressIndicator(
                            value: (score.score.clamp(0, 100)) / 100,
                            strokeWidth: 12,
                            backgroundColor: scheme.surfaceContainerHigh,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              _levelColor(context, score.level),
                            ),
                          ),
                        ),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${score.score}',
                              style: Theme.of(
                                context,
                              ).textTheme.headlineLarge?.copyWith(fontSize: 46),
                            ),
                            const SizedBox(height: AppSpacing.space4),
                            Text(
                              score.level,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                color: _levelColor(context, score.level),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space16),
                  Text('Protection Score', style: Theme.of(context).textTheme.headlineMedium),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Breakdown'),
            const SizedBox(height: AppSpacing.md),
            ...score.breakdown.entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: GlassCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _labelForKey(entry.key),
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      Text('${entry.value}', style: Theme.of(context).textTheme.titleLarge),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              onPressed: () => context.push('/devices/$deviceId/insights'),
              icon: const Icon(Icons.analytics_outlined),
              label: const Text('Open device insights'),
            ),
          ],
        ),
      ),
    );
  }
}

String _labelForKey(String key) {
  return switch (key) {
    'dnsVisibility' => 'DNS visibility',
    'lockState' => 'Lock state',
    'offlineSetup' => 'Offline setup',
    'bypassHistory' => 'Bypass history',
    _ => key,
  };
}
