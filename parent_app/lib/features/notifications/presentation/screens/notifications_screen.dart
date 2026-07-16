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
import 'package:parent_app/features/notifications/data/notifications_repository.dart';
import 'package:parent_app/features/notifications/domain/notification_item.dart';
import 'package:parent_app/features/notifications/presentation/providers/notifications_providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  IconData _iconForType(String type) {
    return switch (type) {
      'TIME_10_MIN_LEFT' => Icons.timer_outlined,
      'TIME_ENDED' => Icons.lock_clock_rounded,
      'CHILD_REQUEST_MORE_TIME' => Icons.more_time_rounded,
      'POSSIBLE_DNS_BYPASS' => Icons.wifi_off_rounded,
      _ => Icons.notifications_outlined,
    };
  }

  Future<void> _markRead(WidgetRef ref, NotificationItem item) async {
    if (item.read) {
      return;
    }
    await ref.read(notificationsRepositoryProvider).markRead(item.id);
    ref.invalidate(notificationsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationsProvider);
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Notifications', showBack: true),
      child: notificationsAsync.when(
        loading: () => const LoadingStateView(message: 'Loading alerts…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(notificationsProvider),
        ),
        data: (items) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            48,
          ),
          children: [
            Text('Activity Stream', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: AppSpacing.space8),
            Text(
              "Manage your family's digital footprint and alerts.",
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.xl),
            if (items.isEmpty)
              const EmptyStateView(
                icon: Icons.notifications_none_rounded,
                title: 'All caught up',
                message:
                    "No notifications yet. We'll alert you about sessions and DNS issues here.",
              )
            else
              ...items.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: GlassCard(
                    onTap: () => _markRead(ref, item),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: item.read
                                ? scheme.surfaceContainerHigh
                                : scheme.primary.withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(AppRadius.sm),
                          ),
                          child: Icon(_iconForType(item.type), color: scheme.primary),
                        ),
                        const SizedBox(width: AppSpacing.space12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context).textTheme.labelLarge,
                                    ),
                                  ),
                                  Text(
                                    item.createdAt == null
                                        ? ''
                                        : '${item.createdAt!.hour.toString().padLeft(2, '0')}:${item.createdAt!.minute.toString().padLeft(2, '0')}',
                                    style: Theme.of(context).textTheme.labelMedium,
                                  ),
                                ],
                              ),
                              const SizedBox(height: AppSpacing.space6),
                              Text(
                                item.message,
                                style: Theme.of(
                                  context,
                                ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
