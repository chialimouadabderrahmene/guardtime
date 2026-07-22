import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../providers/router_providers.dart';
import '../widgets/capability_score_badge.dart';

/// Router Compatibility Center — one place answering "how well does my
/// router actually work with GuardTime, and why." Every number here comes
/// from RouterCapabilityScoreService (computed once, server-side) — this
/// screen only presents it.
class RouterCompatibilityScreen extends ConsumerWidget {
  const RouterCompatibilityScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final routerAsync = ref.watch(detectedRouterProvider(gatewayId));
    final featuresAsync = ref.watch(routerFeaturesProvider(gatewayId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Router Compatibility', showBack: true),
      child: routerAsync.when(
        loading: () => const LoadingStateView(message: 'Checking compatibility…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () {
            ref.invalidate(detectedRouterProvider(gatewayId));
            ref.invalidate(routerFeaturesProvider(gatewayId));
          },
        ),
        data: (router) {
          if (router == null || !router.hasBeenDetected) {
            return _NotDetectedState(gatewayId: gatewayId);
          }

          final scoreAsync = featuresAsync;

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(detectedRouterProvider(gatewayId));
              ref.invalidate(routerFeaturesProvider(gatewayId));
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.space12, AppSpacing.page, 48),
              children: [
                const SectionHeader(title: 'Router', uppercaseEyebrow: 'Compatibility Center'),
                const SizedBox(height: AppSpacing.md),
                GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _InfoRow(label: 'Model', value: router.model ?? 'Unknown'),
                      _InfoRow(label: 'Vendor', value: router.vendor ?? 'Unknown'),
                      _InfoRow(label: 'Firmware', value: router.firmwareVersion ?? 'Not reported'),
                      _InfoRow(label: 'Plugin', value: router.pluginId ?? 'None'),
                      const Divider(height: AppSpacing.lg),
                      Row(
                        children: [
                          Text('Connection', style: Theme.of(context).textTheme.bodyMedium),
                          const Spacer(),
                          _connectionBadge(router.lastTestResult),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                const SectionHeader(title: 'Compatibility'),
                const SizedBox(height: AppSpacing.md),
                scoreAsync.when(
                  loading: () => const LoadingStateView(message: 'Scoring capabilities…'),
                  error: (error, _) => ErrorStateView(
                    message: error.toString(),
                    onRetry: () => ref.invalidate(routerFeaturesProvider(gatewayId)),
                  ),
                  data: (features) {
                    final score = features.score;
                    if (score == null) return const SizedBox.shrink();
                    return GlassCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CapabilityScoreBadge(score: score),
                          const Divider(height: AppSpacing.lg),
                          CapabilityScoreBreakdownView(score: score),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.lg),
                FilledButton.icon(
                  onPressed: () => context.push('/routers/$gatewayId/features'),
                  icon: const Icon(Icons.list_alt_rounded),
                  label: const Text('View Supported Features'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _connectionBadge(bool? lastTestResult) {
    if (lastTestResult == null) {
      return const StatusBadge(label: 'Not tested', color: Colors.grey, icon: Icons.help_outline_rounded);
    }
    return lastTestResult
        ? StatusBadge(label: 'Connected', color: Colors.green.shade600, icon: Icons.check_circle_rounded)
        : StatusBadge(label: 'Connection failed', color: Colors.red.shade600, icon: Icons.error_outline_rounded);
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant)),
          const Spacer(),
          Text(value, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Never a generic error — a specific explanation plus a real, actionable
/// alternative (per this feature's explicit "never generic errors" rule).
class _NotDetectedState extends ConsumerWidget {
  const _NotDetectedState({required this.gatewayId});

  final String gatewayId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.page),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const EmptyStateView(
            icon: Icons.router_outlined,
            title: 'No router detected yet',
            message:
                'GuardTime hasn\'t identified a router on this gateway yet, so compatibility can\'t be scored. Run a scan from the Router Wizard, or — if this network has no router with a supported management API — use a Software Gateway instead for full pause/block enforcement.',
          ),
          const SizedBox(height: AppSpacing.lg),
          FilledButton.icon(
            onPressed: () => context.push('/routers/$gatewayId/wizard'),
            icon: const Icon(Icons.wifi_find_rounded),
            label: const Text('Open Router Wizard'),
          ),
        ],
      ),
    );
  }
}
