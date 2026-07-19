import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/action_grid.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../../data/router_repository.dart';
import '../providers/router_providers.dart';

class RouterDetailsScreen extends ConsumerStatefulWidget {
  const RouterDetailsScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  ConsumerState<RouterDetailsScreen> createState() => _RouterDetailsScreenState();
}

class _RouterDetailsScreenState extends ConsumerState<RouterDetailsScreen> {
  bool _scanning = false;

  Future<void> _scanNow() async {
    setState(() => _scanning = true);
    try {
      await ref.read(routerRepositoryProvider).triggerDetection(widget.gatewayId);
      if (mounted) {
        showAppSnackbar(
          context,
          'Scan requested — gateway-agent will report back within its next poll cycle.',
          type: SnackbarType.success,
        );
      }
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final routerAsync = ref.watch(detectedRouterProvider(widget.gatewayId));
    final gatewayId = widget.gatewayId;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Router Details', showBack: true),
      child: routerAsync.when(
        loading: () => const LoadingStateView(message: 'Loading router details…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(detectedRouterProvider(gatewayId)),
        ),
        data: (router) {
          final detected = router != null && router.hasBeenDetected;
          return ListView(
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
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: context.colors.brandGradient.colors.first.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(AppRadius.sm),
                          ),
                          child: Icon(Icons.router_rounded, color: context.scheme.primary),
                        ),
                        const SizedBox(width: AppSpacing.space12),
                        Expanded(
                          child: Text(
                            detected ? (router.vendor ?? 'Unknown vendor') : 'No router detected yet',
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ),
                      ],
                    ),
                    if (detected) ...[
                      const SizedBox(height: AppSpacing.space16),
                      _detailRow(context, 'Model', router.model ?? 'Unknown'),
                      _detailRow(context, 'Firmware', router.firmwareVersion ?? 'Unknown'),
                      _detailRow(context, 'IP address', router.ipAddress ?? 'Unknown'),
                      _detailRow(context, 'Detected via', router.detectionMethod ?? 'Unknown'),
                      _detailRow(
                        context,
                        'Confidence',
                        router.confidence != null ? '${router.confidence}%' : 'Unknown',
                        isLast: true,
                      ),
                      const SizedBox(height: AppSpacing.space12),
                      StatusBadge(
                        label: switch (router.integrationStatus) {
                          'OFFICIAL_API' => 'Official API available',
                          'GUIDE_ONLY' => 'Guide Only — no official API',
                          _ => 'Undetected',
                        },
                        color: switch (router.integrationStatus) {
                          'OFFICIAL_API' => context.colors.success,
                          'GUIDE_ONLY' => context.colors.warning,
                          _ => Colors.grey,
                        },
                      ),
                    ] else ...[
                      const SizedBox(height: AppSpacing.space8),
                      Text(
                        'Automatic detection runs periodically on your gateway. You can also trigger a scan now.',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    GradientButton(label: 'Scan Now', onPressed: _scanNow, isBusy: _scanning),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader(title: 'Router Tools'),
              const SizedBox(height: AppSpacing.md),
              ActionGrid(
                items: [
                  ActionGridItem(
                    icon: Icons.checklist_rtl_rounded,
                    label: 'Supported Features',
                    onTap: () => context.push('/routers/$gatewayId/features'),
                  ),
                  ActionGridItem(
                    icon: Icons.bolt_rounded,
                    label: 'One-Click Setup',
                    onTap: () => context.push('/routers/$gatewayId/setup'),
                  ),
                  ActionGridItem(
                    icon: Icons.auto_fix_high_rounded,
                    label: 'Router Wizard',
                    onTap: () => context.push('/routers/$gatewayId/wizard'),
                  ),
                  ActionGridItem(
                    icon: Icons.sports_esports_rounded,
                    label: 'Gaming Devices',
                    onTap: () => context.push('/routers/$gatewayId/gaming-devices'),
                  ),
                  ActionGridItem(
                    icon: Icons.flash_on_rounded,
                    label: 'Instant Block',
                    onTap: () => context.push('/routers/$gatewayId/instant-block'),
                  ),
                  ActionGridItem(
                    icon: Icons.monitor_heart_rounded,
                    label: 'Diagnostics',
                    onTap: () => context.push('/routers/$gatewayId/diagnostics'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _detailRow(BuildContext context, String label, String value, {bool isLast = false}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.space10),
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
