import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/step_list_item.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

class PlatformGuideDetailScreen extends ConsumerWidget {
  const PlatformGuideDetailScreen({super.key, required this.platform});

  final String platform;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final guideAsync = ref.watch(platformGuideProvider(platform));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Guide', showBack: true),
      child: guideAsync.when(
        loading: () => const LoadingStateView(message: 'Loading platform guide…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(platformGuideProvider(platform)),
        ),
        data: (guide) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            GlassCard(
              child: Text(guide.title, style: Theme.of(context).textTheme.headlineMedium),
            ),
            const SizedBox(height: AppSpacing.xl),
            GlassCard(
              child: Column(
                children: [
                  for (var i = 0; i < guide.steps.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    StepListItem(
                      index: guide.steps[i].step,
                      title: guide.steps[i].title,
                      description: guide.steps[i].description,
                    ),
                  ],
                ],
              ),
            ),
            if (guide.videoUrl != null) ...[
              const SizedBox(height: AppSpacing.md),
              GlassCard(child: Text('Official URL: ${guide.videoUrl}')),
            ],
          ],
        ),
      ),
    );
  }
}
