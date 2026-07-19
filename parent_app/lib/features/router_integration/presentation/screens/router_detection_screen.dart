import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../../domain/gateway_model.dart';
import '../providers/router_providers.dart';

/// Router Detection — entry point of the Router Integration Engine. Lists
/// every gateway the parent owns, with a live detection-status badge per
/// gateway (auto-refreshed by gateway-agent's own periodic scan; no manual
/// action needed here beyond opening a gateway's details).
class RouterDetectionScreen extends ConsumerWidget {
  const RouterDetectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gatewaysAsync = ref.watch(gatewaysListProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Router Detection', showBack: true),
      child: gatewaysAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 2),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(gatewaysListProvider),
        ),
        data: (gateways) {
          if (gateways.isEmpty) {
            return const _NoGatewayEmptyState();
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(gatewaysListProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space12,
                AppSpacing.page,
                48,
              ),
              children: [
                const SectionHeader(
                  title: 'Your Gateways',
                  uppercaseEyebrow: 'Router Integration Engine',
                ),
                const SizedBox(height: AppSpacing.md),
                ...gateways.map(
                  (gateway) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _GatewayCard(gateway: gateway),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GatewayCard extends ConsumerWidget {
  const _GatewayCard({required this.gateway});

  final GatewayModel gateway;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final routerAsync = ref.watch(detectedRouterProvider(gateway.id));

    return GlassCard(
      onTap: () => context.push('/routers/${gateway.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppListTile(
            title: gateway.name,
            subtitle: gateway.paired ? 'Paired' : 'Not paired',
            leading: Icons.router_rounded,
            onTap: () => context.push('/routers/${gateway.id}'),
          ),
          const SizedBox(height: AppSpacing.space8),
          routerAsync.when(
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (_, _) => Text(
              'Could not load detection status',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            data: (router) {
              if (router == null || !router.hasBeenDetected) {
                return const StatusBadge(
                  label: 'Not detected yet',
                  color: Colors.grey,
                  icon: Icons.help_outline_rounded,
                );
              }
              final (label, color) = switch (router.integrationStatus) {
                'OFFICIAL_API' => ('${router.vendor} • Official API', context.colors.success),
                'GUIDE_ONLY' => ('${router.vendor} • Guide Only', context.colors.warning),
                _ => (router.vendor ?? 'Unknown', context.colors.warning),
              };
              return StatusBadge(label: label, color: color, icon: Icons.wifi_rounded);
            },
          ),
        ],
      ),
    );
  }
}

class _NoGatewayEmptyState extends StatelessWidget {
  const _NoGatewayEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(AppSpacing.page),
      child: EmptyStateView(
        icon: Icons.router_outlined,
        title: 'No gateway paired yet',
        message:
            'Pair a GuardTime Gateway on your home network first — once it is paired, it automatically detects your router and reports back here.',
      ),
    );
  }
}
