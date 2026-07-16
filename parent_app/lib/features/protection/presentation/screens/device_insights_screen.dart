import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/protection/presentation/providers/protection_providers.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

class DeviceInsightsScreen extends ConsumerWidget {
  const DeviceInsightsScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final insightsAsync = ref.watch(deviceInsightsProvider(deviceId));
    final dateFormat = DateFormat('MMM d, HH:mm');
    final colors = context.colors;
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Device Insights', showBack: true),
      child: insightsAsync.when(
        loading: () => const LoadingStateView(message: 'Loading device insights...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceInsightsProvider(deviceId)),
        ),
        data: (insights) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            Row(
              children: [
                ConnectedBadge(connected: insights.connected),
                const SizedBox(width: AppSpacing.space10),
                StatusBadge(
                  label: insights.protectionLevel,
                  color: switch (insights.protectionLevel) {
                    'HIGH' => colors.success,
                    'MEDIUM' => colors.warning,
                    _ => scheme.error,
                  },
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Protection status', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.space10),
                  Text(
                    insights.protectionStatus,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: AppSpacing.space12),
                  _FactRow(label: 'Protection score', value: '${insights.protectionScore}/100'),
                  _FactRow(label: 'Bypass attempts', value: '${insights.bypassAttempts}'),
                  _FactRow(
                    label: 'Checklist completed',
                    value: '${insights.checklistCompletedCount}/6',
                  ),
                  _FactRow(
                    label: 'Last DNS seen',
                    value: insights.lastDnsSeenAt == null
                        ? 'No heartbeat yet'
                        : dateFormat.format(insights.lastDnsSeenAt!),
                    isLast: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Recommendations'),
            const SizedBox(height: AppSpacing.md),
            ...insights.recommendations.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: GlassCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check_circle_outline_rounded, color: scheme.primary),
                      const SizedBox(width: AppSpacing.space12),
                      Expanded(child: Text(item)),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Top Domains'),
            const SizedBox(height: AppSpacing.md),
            if (insights.topDomains.isEmpty)
              const GlassCard(child: Text('No recent DNS query insights are available yet.'))
            else
              ...insights.topDomains.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: GlassCard(
                    child: Row(
                      children: [
                        Expanded(child: Text(item.domain)),
                        Text('${item.count}'),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton.icon(
              onPressed: () => context.push('/devices/$deviceId/offline-checklist'),
              icon: const Icon(Icons.checklist_rounded),
              label: const Text('Open offline checklist'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FactRow extends StatelessWidget {
  const _FactRow({required this.label, required this.value, this.isLast = false});

  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.space12),
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
