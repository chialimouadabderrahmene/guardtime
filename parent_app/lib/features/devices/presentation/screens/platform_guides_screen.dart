import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

class PlatformGuidesScreen extends ConsumerWidget {
  const PlatformGuidesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final guidesAsync = ref.watch(platformGuidesProvider);
    final supportAsync = ref.watch(supportMatrixProvider);
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Platform Guides', showBack: true),
      child: guidesAsync.when(
        loading: () => const LoadingStateView(message: 'Loading support guides…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(platformGuidesProvider),
        ),
        data: (guides) => ListView(
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
                  Text('System limitations', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: AppSpacing.space10),
                  Text(
                    'GuardTime is honest: DNS can block online services, but offline games on unsupported hardware still require vendor parental controls.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Available Guides'),
            const SizedBox(height: AppSpacing.md),
            ...guides.map(
              (guide) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: GlassCard(
                  onTap: () => context.push('/guides/${guide.platform}'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.space16,
                    vertical: AppSpacing.space4,
                  ),
                  child: AppListTile(
                    title: guide.title,
                    subtitle: '${guide.steps.length} setup steps',
                    leading: deviceIcon(guide.platform == 'ROUTER' ? 'OTHER' : guide.platform),
                    onTap: () => context.push('/guides/${guide.platform}'),
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const SectionHeader(title: 'Support Matrix'),
            const SizedBox(height: AppSpacing.md),
            supportAsync.when(
              loading: () =>
                  const LoadingStateView(message: 'Loading support matrix…', compact: true),
              error: (error, _) => Text(error.toString()),
              data: (supportItems) => Column(
                children: supportItems
                    .map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: GlassCard(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                deviceLabel(item.deviceType),
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: AppSpacing.space6),
                              Text(item.notes, style: Theme.of(context).textTheme.bodyMedium),
                              const SizedBox(height: AppSpacing.space10),
                              Text(
                                'Recommended: ${item.recommendedControlMethod}',
                                style: Theme.of(
                                  context,
                                ).textTheme.labelLarge?.copyWith(color: scheme.primary),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
