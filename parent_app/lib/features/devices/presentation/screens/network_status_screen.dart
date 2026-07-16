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
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

class NetworkStatusScreen extends ConsumerWidget {
  const NetworkStatusScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final networkAsync = ref.watch(networkStatusProvider(deviceId));
    final offlineAsync = ref.watch(offlineControlProvider(deviceId));
    final colors = context.colors;
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Network Status', showBack: true),
      child: networkAsync.when(
        loading: () => const LoadingStateView(message: 'Checking DNS status…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(networkStatusProvider(deviceId)),
        ),
        data: (network) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            GlassCard(
              child: Column(
                children: [
                  Icon(
                    network.dnsConnected ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                    size: 52,
                    color: network.dnsConnected ? colors.success : colors.warning,
                  ),
                  const SizedBox(height: AppSpacing.space14),
                  Text(
                    network.dnsConnected ? 'DNS Connected' : 'Waiting for DNS heartbeat',
                    style: Theme.of(context).textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.space8),
                  Text(
                    network.note,
                    style: Theme.of(context).textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Network Details'),
            const SizedBox(height: AppSpacing.md),
            GlassCard(
              child: Column(
                children: [
                  _DetailRow(label: 'Blocking mode', value: network.blockingMode),
                  _DetailRow(label: 'Local IP', value: network.ipAddress ?? 'Not provided'),
                  _DetailRow(
                    label: 'DNS source IP',
                    value: network.dnsSourceIp ?? 'Not provided',
                  ),
                  _DetailRow(
                    label: 'Last DNS seen',
                    value: network.lastDnsSeenAt?.toString() ?? 'No heartbeat yet',
                    isLast: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Offline Control'),
            const SizedBox(height: AppSpacing.md),
            offlineAsync.when(
              loading: () =>
                  const LoadingStateView(message: 'Loading offline control…', compact: true),
              error: (error, _) => Text(error.toString()),
              data: (offline) => GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offline.setupRequired ? 'Setup still required' : 'Setup complete',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: AppSpacing.space8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                      child: LinearProgressIndicator(
                        value: offline.checklistCompletedCount / 6,
                        minHeight: 8,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.space12),
                    Text(
                      '${offline.checklistCompletedCount}/6 checklist items done',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: AppSpacing.space10),
                    Text(
                      offline.recommendedNextStep,
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, this.isLast = false});

  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.space14),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant),
            ),
          ),
          Expanded(child: Text(value, textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}
