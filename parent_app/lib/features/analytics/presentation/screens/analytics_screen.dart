import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerBlock, ShimmerCardList;
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/core/widgets/usage_bar.dart';
import 'package:parent_app/features/analytics/presentation/providers/analytics_providers.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  String? _selectedChildId;

  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(childrenListProvider);

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        title: 'Analytics',
        actions: [
          IconButton(
            tooltip: 'Reports',
            onPressed: () => context.push('/reports'),
            icon: const Icon(Icons.summarize_outlined),
          ),
        ],
      ),
      child: childrenAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 3),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(childrenListProvider),
        ),
        data: (children) {
          if (children.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: GlassCard(
                  child: Text('Add a child first to unlock usage analytics.'),
                ),
              ),
            );
          }

          _selectedChildId ??= children.first.id;
          final selectedChild = children.firstWhere(
            (child) => child.id == _selectedChildId,
          );
          final dailyAsync = ref.watch(dailyUsageProvider(selectedChild.id));
          final weeklyAsync = ref.watch(weeklyUsageProvider(selectedChild.id));

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              120,
            ),
            children: [
              const SectionHeader(uppercaseEyebrow: 'Insights', title: 'Usage Analytics'),
              const SizedBox(height: AppSpacing.md),
              DropdownButtonFormField<String>(
                initialValue: _selectedChildId,
                decoration: const InputDecoration(labelText: 'Child'),
                items: children
                    .map((child) => DropdownMenuItem(value: child.id, child: Text(child.name)))
                    .toList(),
                onChanged: (value) => setState(() => _selectedChildId = value),
              ),
              const SizedBox(height: AppSpacing.xl),
              dailyAsync.when(
                loading: () =>
                    const ShimmerBlock(width: double.infinity, height: 160, borderRadius: 20),
                error: (error, _) => Text(error.toString()),
                data: (daily) => GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Today', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: AppSpacing.space8),
                      Text(
                        '${daily.totalMinutes} minutes',
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: AppSpacing.space12),
                      ...daily.bySegment.entries.take(5).map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.space10),
                          child: UsageBar(
                            label: entry.key,
                            value: entry.value ~/ 60,
                            maxValue: daily.totalMinutes == 0 ? 1 : daily.totalMinutes,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              weeklyAsync.when(
                loading: () =>
                    const ShimmerBlock(width: double.infinity, height: 160, borderRadius: 20),
                error: (error, _) => Text(error.toString()),
                data: (weekly) => GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Weekly trend', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: AppSpacing.space12),
                      ...weekly.bySegment.entries.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.space10),
                          child: UsageBar(
                            label: entry.key,
                            value: entry.value ~/ 60,
                            maxValue: weekly.totalMinutes == 0 ? 1 : weekly.totalMinutes,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
