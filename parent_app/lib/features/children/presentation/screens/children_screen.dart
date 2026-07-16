import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';

class ChildrenScreen extends ConsumerWidget {
  const ChildrenScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final childrenAsync = ref.watch(childrenListProvider);

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        actions: [
          IconButton(
            onPressed: () => context.push('/children/add'),
            icon: const Icon(Icons.add_rounded),
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
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(childrenListProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space8,
                AppSpacing.page,
                120,
              ),
              children: [
                const SectionHeader(uppercaseEyebrow: 'Family', title: 'Children'),
                const SizedBox(height: AppSpacing.md),
                if (children.isEmpty)
                  EmptyStateView(
                    icon: Icons.smart_toy_rounded,
                    title: 'No children added',
                    message:
                        'Start by adding a child profile so you can connect devices, set sessions, and monitor DNS protection.',
                    actionLabel: 'Add Child',
                    onAction: () => context.push('/children/add'),
                  )
                else
                  ...children.map(
                    (child) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: GlassCard(
                        onTap: () => context.push('/children/${child.id}'),
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.space16,
                          vertical: AppSpacing.space4,
                        ),
                        child: AppListTile(
                          title: child.name,
                          subtitle: '${child.devices.length} connected devices'
                              '${child.defaultLimitMinutes != null ? ' • ${child.defaultLimitMinutes}m default limit' : ''}',
                          leading: Icons.face_rounded,
                          onTap: () => context.push('/children/${child.id}'),
                        ),
                      ),
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
