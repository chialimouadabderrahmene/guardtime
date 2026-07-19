import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../providers/router_providers.dart';

class SupportedFeaturesScreen extends ConsumerWidget {
  const SupportedFeaturesScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final featuresAsync = ref.watch(routerFeaturesProvider(gatewayId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Supported Features', showBack: true),
      child: featuresAsync.when(
        loading: () => const LoadingStateView(message: 'Loading capabilities…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(routerFeaturesProvider(gatewayId)),
        ),
        data: (features) {
          final capabilities = features.capabilities;
          if (!features.detected || capabilities == null) {
            return const Padding(
              padding: EdgeInsets.all(AppSpacing.page),
              child: EmptyStateView(
                icon: Icons.help_outline_rounded,
                title: 'No router detected yet',
                message: 'Run a detection scan from Router Details first, then come back to see what it supports.',
              ),
            );
          }

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
                    Text(capabilities.vendorDisplayName, style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: AppSpacing.space8),
                    StatusBadge(
                      label: capabilities.isFullyIntegrated
                          ? 'Fully integrated'
                          : capabilities.isOfficialApi
                          ? 'Official API — GuardTime integration coming soon'
                          : 'Guide Only',
                      color: capabilities.isFullyIntegrated
                          ? context.colors.success
                          : capabilities.isOfficialApi
                          ? context.colors.warning
                          : Colors.grey,
                    ),
                    if (capabilities.protocol != null) ...[
                      const SizedBox(height: AppSpacing.space12),
                      Text('Protocol: ${capabilities.protocol}', style: Theme.of(context).textTheme.bodyMedium),
                    ],
                    if (capabilities.officialDocUrl != null) ...[
                      const SizedBox(height: AppSpacing.space4),
                      SelectableText(
                        capabilities.officialDocUrl!,
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(color: context.scheme.primary),
                      ),
                    ],
                  ],
                ),
              ),
              if (capabilities.scopeNote != null) ...[
                const SizedBox(height: AppSpacing.md),
                InfoNoticeCard(title: 'Scope', message: capabilities.scopeNote!),
              ],
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader(title: 'Capabilities'),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: Column(
                  children: capabilities.flags
                      .map(
                        (flag) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: AppSpacing.space8),
                          child: Row(
                            children: [
                              Expanded(child: Text(flag.label, style: Theme.of(context).textTheme.bodyMedium)),
                              StatusBadge(
                                label: flag.supported ? 'Supported' : 'Not supported',
                                color: flag.supported ? context.colors.success : Colors.grey,
                                icon: flag.supported ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded,
                              ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
