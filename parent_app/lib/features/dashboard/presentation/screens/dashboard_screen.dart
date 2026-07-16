import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/confirm_dialog.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/dashboard/presentation/providers/dashboard_provider.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  Future<void> _pauseAll(WidgetRef ref, BuildContext context) async {
    final confirmed = await ConfirmDialog.show(
      context,
      title: 'Pause all devices?',
      message: 'Every registered device will lose internet access until resumed.',
      confirmLabel: 'Pause all',
    );
    if (!confirmed) return;

    final devices = await ref.read(devicesListProvider.future);
    final repo = ref.read(devicesRepositoryProvider);
    for (final device in devices) {
      await repo.lockInternet(device.id);
    }
    ref.invalidate(devicesListProvider);
    ref.invalidate(dashboardProvider);
    if (context.mounted) {
      showAppSnackbar(
        context,
        'All registered devices were paused.',
        type: SnackbarType.success,
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(dashboardProvider);
    final scheme = context.scheme;
    final colors = context.colors;

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        actions: [
          IconButton(
            onPressed: () => context.push('/notifications'),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
        ],
      ),
      extendBody: true,
      child: dashboardAsync.when(
        loading: () => const LoadingStateView(message: 'Loading your family dashboard...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(dashboardProvider),
        ),
        data: (bundle) {
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(dashboardProvider);
              ref.invalidate(devicesListProvider);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.sm,
                AppSpacing.page,
                120,
              ),
              children: [
                SectionHeader(
                  uppercaseEyebrow: 'Welcome back',
                  title: 'Hi ${bundle.profile.firstName ?? 'Parent'}',
                ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05, end: 0),
                const SizedBox(height: AppSpacing.md),
                GlassCard(
                  padding: const EdgeInsets.all(AppSpacing.space24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Today's Total Screen Time",
                        style: Theme.of(
                          context,
                        ).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: AppSpacing.space8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _formatMinutes(bundle.totalMinutesToday),
                            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                              fontSize: 48,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.space12),
                          if (bundle.activeSessions.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: scheme.error.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(AppRadius.pill),
                                ),
                                child: Text(
                                  '${bundle.activeSessions.length} live',
                                  style: Theme.of(
                                    context,
                                  ).textTheme.labelMedium?.copyWith(color: scheme.error),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Row(
                        children: [
                          Expanded(
                            child: GradientButton(
                              label: 'Add Time',
                              onPressed: bundle.devices.isEmpty
                                  ? null
                                  : () => context.push(
                                      '/devices/${bundle.devices.first.id}/start-session',
                                    ),
                              icon: const Icon(Icons.add_circle_outline_rounded),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: SecondaryGlassButton(
                              label: 'Pause All',
                              emphasisColor: scheme.tertiary,
                              icon: const Icon(Icons.pause_circle_outline_rounded),
                              onPressed: bundle.devices.isEmpty
                                  ? null
                                  : () => _pauseAll(ref, context),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                const _ProtectionHealthCard(),
                const SizedBox(height: AppSpacing.xl),
                SectionHeader(
                  title: 'Children',
                  actionLabel: 'Manage',
                  onAction: () => context.go('/children'),
                ),
                const SizedBox(height: AppSpacing.md),
                if (bundle.children.isEmpty)
                  EmptyStateView(
                    icon: Icons.people_outline_rounded,
                    title: 'No children added',
                    message:
                        'Add your first child profile to start managing devices and schedules.',
                    actionLabel: 'Add Child',
                    onAction: () => context.push('/children/add'),
                  )
                else
                  ...bundle.children.map((child) {
                    final usage = bundle.dailyUsage[child.id];
                    final matchingSessions = bundle.activeSessions.where(
                      (session) => session.childId == child.id,
                    );
                    final liveSession = matchingSessions.isEmpty
                        ? null
                        : matchingSessions.first;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: GlassCard(
                        onTap: () => context.push('/children/${child.id}'),
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.space16,
                          vertical: AppSpacing.space4,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: _ChildRow(
                                name: child.name,
                                subtitle: liveSession != null
                                    ? '${liveSession.remainingMinutes}m left'
                                    : '${usage?.totalMinutes ?? 0}m today',
                              ),
                            ),
                            Container(
                              width: 4,
                              height: 44,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(AppRadius.pill),
                                color: liveSession != null
                                    ? scheme.primary
                                    : scheme.tertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(title: 'Active Devices'),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  height: 172,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: bundle.devices.length + 1,
                    separatorBuilder: (context, index) =>
                        const SizedBox(width: AppSpacing.md),
                    itemBuilder: (context, index) {
                      if (index == bundle.devices.length) {
                        return SizedBox(
                          width: 170,
                          child: OutlinedButton(
                            onPressed: () => context.push('/devices/add'),
                            style: OutlinedButton.styleFrom(
                              side: BorderSide(color: scheme.outlineVariant),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(24),
                              ),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.add_rounded, color: scheme.primary),
                                const SizedBox(height: 10),
                                const Text('Add Device'),
                              ],
                            ),
                          ),
                        );
                      }

                      final device = bundle.devices[index];
                      return SizedBox(
                        width: 170,
                        child: GlassCard(
                          onTap: () => context.push('/devices/${device.id}'),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 56,
                                height: 56,
                                decoration: BoxDecoration(
                                  color: deviceAccent(device.type).withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Icon(
                                  deviceIcon(device.type),
                                  color: deviceAccent(device.type),
                                ),
                              ),
                              const SizedBox(height: 14),
                              Text(
                                device.name,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.labelLarge,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                device.dnsConnected ? 'DNS Connected' : 'Needs setup',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                                  color: device.dnsConnected ? colors.success : colors.warning,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
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

class _ChildRow extends StatelessWidget {
  const _ChildRow({required this.name, required this.subtitle});

  final String name;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Row(
      children: [
        CircleAvatar(
          radius: 24,
          backgroundColor: scheme.surfaceContainerHigh,
          child: Text(
            name.isEmpty ? '?' : name.characters.first.toUpperCase(),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.space12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProtectionHealthCard extends ConsumerWidget {
  const _ProtectionHealthCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(deviceHealthSummaryProvider);
    final scheme = context.scheme;
    final colors = context.colors;

    return healthAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (summary) {
        if (summary.total == 0) return const SizedBox.shrink();

        final attention = summary.needsAttentionCount;
        final allGood = attention == 0 && summary.notConfiguredCount == 0;
        final accent = attention > 0 ? scheme.error : colors.success;
        final icon = attention > 0
            ? Icons.gpp_maybe_rounded
            : Icons.verified_user_rounded;
        final subtitle = allGood
            ? 'All ${summary.total} device${summary.total == 1 ? '' : 's'} protected'
            : [
                if (attention > 0) '$attention need${attention == 1 ? 's' : ''} attention',
                if (summary.notConfiguredCount > 0)
                  '${summary.notConfiguredCount} not set up',
              ].join(' • ');

        return GlassCard(
          onTap: () => context.push('/protection-health'),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(icon, color: accent),
              ),
              const SizedBox(width: AppSpacing.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Protection health', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: scheme.outline),
            ],
          ),
        );
      },
    );
  }
}

String _formatMinutes(int totalMinutes) {
  final hours = totalMinutes ~/ 60;
  final minutes = totalMinutes % 60;
  if (hours == 0) {
    return '${minutes}m';
  }
  return '${hours}h ${minutes}m';
}
