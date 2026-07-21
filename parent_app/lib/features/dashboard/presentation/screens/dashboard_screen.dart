import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/theme/app_theme.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/confirm_dialog.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/dashboard/domain/dashboard_bundle.dart';
import 'package:parent_app/features/dashboard/presentation/providers/dashboard_provider.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/domain/device_health.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/sessions/data/sessions_repository.dart';
import 'package:parent_app/features/sessions/domain/session_model.dart';

/// Home — rebuilt around one idea: don't lead with a static "everything's
/// fine" badge, lead with whatever is actually most relevant right now.
/// If a child's session is close to running out, that's the hero, with a
/// live countdown and a one-tap action. Only when nothing is time-critical
/// does the hero fall back to overall protection status. Everything below
/// it (family ring strip, today's numbers, quick actions, devices) is real
/// data from [dashboardProvider] — nothing here is invented placeholder
/// content.
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
              ref.invalidate(deviceHealthSummaryProvider);
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
                const SizedBox(height: AppSpacing.lg),
                _NextUpHero(bundle: bundle),
                const SizedBox(height: AppSpacing.xl),
                if (bundle.children.isNotEmpty) ...[
                  _FamilyRingStrip(bundle: bundle),
                  const SizedBox(height: AppSpacing.xl),
                ],
                _TodayStrip(bundle: bundle),
                const SizedBox(height: AppSpacing.lg),
                _QuickActionsRow(
                  bundle: bundle,
                  onPauseAll: bundle.devices.isEmpty ? null : () => _pauseAll(ref, context),
                ),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(title: 'Active Devices'),
                const SizedBox(height: AppSpacing.md),
                if (bundle.children.isEmpty && bundle.devices.isEmpty)
                  EmptyStateView(
                    icon: Icons.people_outline_rounded,
                    title: 'No children added',
                    message:
                        'Add your first child profile to start managing devices and schedules.',
                    actionLabel: 'Add Child',
                    onAction: () => context.push('/children/add'),
                  )
                else
                  SizedBox(
                    height: 172,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: bundle.devices.length + 1,
                      separatorBuilder: (context, index) =>
                          const SizedBox(width: AppSpacing.md),
                      itemBuilder: (context, index) {
                        final scheme = context.scheme;
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
                        final colors = context.colors;
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

SessionModel? _soonestSession(List<SessionModel> sessions) {
  if (sessions.isEmpty) return null;
  final sorted = [...sessions]..sort(
    (a, b) => a.remainingMinutes.compareTo(b.remainingMinutes),
  );
  return sorted.first;
}

/// The attention-first hero: whichever child's session is closest to
/// running out, live countdown + one-tap actions. Falls back to overall
/// protection status (from [deviceHealthSummaryProvider]) only when no
/// session is currently active — never a fabricated "next event".
class _NextUpHero extends ConsumerWidget {
  const _NextUpHero({required this.bundle});

  final DashboardBundle bundle;

  Future<void> _extend(WidgetRef ref, BuildContext context, SessionModel session) async {
    await ref.read(sessionsRepositoryProvider).extendSession(
      sessionId: session.id,
      extraMinutes: 15,
    );
    ref.invalidate(dashboardProvider);
    if (context.mounted) {
      showAppSnackbar(context, 'Added 15 minutes.', type: SnackbarType.success);
    }
  }

  Future<void> _endNow(WidgetRef ref, BuildContext context, SessionModel session) async {
    final confirmed = await ConfirmDialog.show(
      context,
      title: 'End this session now?',
      message: '${session.childName ?? 'This child'} will lose access to '
          '${session.deviceName ?? 'this device'} immediately.',
      confirmLabel: 'End now',
    );
    if (!confirmed) return;

    await ref.read(sessionsRepositoryProvider).stopSession(session.id);
    ref.invalidate(dashboardProvider);
    if (context.mounted) {
      showAppSnackbar(context, 'Session ended.', type: SnackbarType.success);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final soonest = _soonestSession(bundle.activeSessions);

    if (soonest != null) {
      final totalMinutes = soonest.durationMinutes + soonest.extendedMinutes;
      final progress = totalMinutes <= 0
          ? 0.0
          : (1 - (soonest.remainingMinutes / totalMinutes)).clamp(0.0, 1.0);
      return _HeroShell(
        label: 'Next up',
        title: '${soonest.childName ?? 'A child'} · ${soonest.deviceName ?? 'device'}',
        subtitle: '${soonest.remainingMinutes} min remaining in this session',
        progress: progress,
        ringValue: '${soonest.remainingMinutes}',
        ringUnit: 'min',
        primaryLabel: 'Add 15m',
        onPrimary: () => _extend(ref, context, soonest),
        secondaryLabel: 'End now',
        onSecondary: () => _endNow(ref, context, soonest),
      );
    }

    final healthAsync = ref.watch(deviceHealthSummaryProvider);
    return healthAsync.when(
      loading: () => const _HeroSkeleton(),
      error: (_, _) => const _HeroSkeleton(),
      data: (summary) => _ProtectionHero(summary: summary),
    );
  }
}

class _ProtectionHero extends StatelessWidget {
  const _ProtectionHero({required this.summary});

  final DeviceHealthSummary summary;

  @override
  Widget build(BuildContext context) {
    if (summary.total == 0) {
      return _HeroShell(
        label: 'Right now',
        title: 'No devices yet',
        subtitle: 'Add a device to start protecting it',
        progress: 0,
        ringValue: '0',
        ringUnit: 'devices',
        primaryLabel: 'Add device',
        onPrimary: () => context.push('/devices/add'),
      );
    }

    final attention = summary.needsAttentionCount;
    final allGood = attention == 0 && summary.notConfiguredCount == 0;

    return _HeroShell(
      label: 'Right now',
      title: allGood ? "Everyone's protected" : '$attention need${attention == 1 ? 's' : ''} attention',
      subtitle: allGood
          ? '${summary.total} of ${summary.total} devices enforced'
          : '${summary.protectedCount} of ${summary.total} devices fully protected',
      progress: summary.total == 0 ? 0 : summary.protectedCount / summary.total,
      ringValue: '${summary.total}',
      ringUnit: 'devices',
      primaryLabel: allGood ? 'Review' : 'Fix now',
      onPrimary: () => context.push('/protection-health'),
      accent: allGood ? null : Theme.of(context).colorScheme.error,
    );
  }
}

class _HeroSkeleton extends StatelessWidget {
  const _HeroSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 176,
      decoration: BoxDecoration(
        color: context.colors.glassFill,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: context.colors.glassBorder),
      ),
    );
  }
}

/// Shared hero shape used by both the "next up" and "protection status"
/// states — a gradient card with a countdown/status ring on the right and
/// one or two actions on the left, so switching between the two states
/// never feels like a different screen.
class _HeroShell extends StatelessWidget {
  const _HeroShell({
    required this.label,
    required this.title,
    required this.subtitle,
    required this.progress,
    required this.ringValue,
    required this.ringUnit,
    required this.primaryLabel,
    required this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
    this.accent,
  });

  final String label;
  final String title;
  final String subtitle;
  final double progress;
  final String ringValue;
  final String ringUnit;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final scheme = context.scheme;
    final ringColor = accent ?? colors.glow;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.space20),
      decoration: BoxDecoration(
        gradient: colors.brandGradient,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.32),
            blurRadius: 30,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label.toUpperCase(),
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: colors.onGradient.withValues(alpha: 0.75),
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: AppSpacing.space6),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: colors.onGradient,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppSpacing.space4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onGradient.withValues(alpha: 0.82),
                  ),
                ),
                const SizedBox(height: AppSpacing.space16),
                Row(
                  children: [
                    _HeroActionChip(
                      label: primaryLabel,
                      onTap: onPrimary,
                      filled: true,
                    ),
                    if (secondaryLabel != null) ...[
                      const SizedBox(width: AppSpacing.space8),
                      _HeroActionChip(
                        label: secondaryLabel!,
                        onTap: onSecondary,
                        filled: false,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.space16),
          SizedBox(
            width: 84,
            height: 84,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox.expand(
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: progress),
                    duration: const Duration(milliseconds: 900),
                    curve: Curves.easeOutCubic,
                    builder: (context, value, _) => CircularProgressIndicator(
                      value: value,
                      strokeWidth: 6,
                      strokeCap: StrokeCap.round,
                      backgroundColor: colors.onGradient.withValues(alpha: 0.22),
                      valueColor: AlwaysStoppedAnimation(ringColor),
                    ),
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(ringValue, style: context.metricStyle(size: 22, color: colors.onGradient)),
                    Text(
                      ringUnit.toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colors.onGradient.withValues(alpha: 0.7),
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroActionChip extends StatelessWidget {
  const _HeroActionChip({
    required this.label,
    required this.onTap,
    required this.filled,
  });

  final String label;
  final VoidCallback? onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: filled ? colors.onGradient : colors.onGradient.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.pill),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: filled ? Theme.of(context).colorScheme.primary : colors.onGradient,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Compact per-child ring strip — a progress ring (today's usage vs.
/// their daily limit) around initials, not a full row-card each. Purely
/// secondary to the hero above it.
class _FamilyRingStrip extends StatelessWidget {
  const _FamilyRingStrip({required this.bundle});

  final DashboardBundle bundle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: bundle.children.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.space16),
        itemBuilder: (context, index) {
          final scheme = context.scheme;
          final colors = context.colors;
          final child = bundle.children[index];
          final usage = bundle.dailyUsage[child.id];
          final liveSessions = bundle.activeSessions.where(
            (session) => session.childId == child.id,
          );
          final liveSession = liveSessions.isEmpty ? null : liveSessions.first;
          final limit = child.defaultLimitMinutes ?? 120;
          final used = usage?.totalMinutes ?? 0;
          final pct = limit <= 0 ? 0.0 : (used / limit).clamp(0.0, 1.0);
          final ringColor = liveSession != null
              ? colors.glow
              : (pct >= 0.9 ? scheme.error : scheme.primary);

          return GestureDetector(
            onTap: () => context.push('/children/${child.id}'),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 56,
                  height: 56,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox.expand(
                        child: CircularProgressIndicator(
                          value: pct,
                          strokeWidth: 3,
                          strokeCap: StrokeCap.round,
                          backgroundColor: scheme.surfaceContainerHighest,
                          valueColor: AlwaysStoppedAnimation(ringColor),
                        ),
                      ),
                      CircleAvatar(
                        radius: 21,
                        backgroundColor: scheme.surfaceContainerHigh,
                        child: Text(
                          child.name.isEmpty ? '?' : child.name.characters.first.toUpperCase(),
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.space6),
                SizedBox(
                  width: 64,
                  child: Text(
                    child.name,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall,
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

/// A quiet inline stat cluster (no boxed chips fighting the hero above),
/// dividers instead of cards.
class _TodayStrip extends ConsumerWidget {
  const _TodayStrip({required this.bundle});

  final DashboardBundle bundle;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final healthAsync = ref.watch(deviceHealthSummaryProvider);
    final alerts = healthAsync.maybeWhen(
      data: (summary) => summary.needsAttentionCount,
      orElse: () => 0,
    );
    final onlineCount = bundle.devices.where((d) => d.status == 'ONLINE').length;
    final scheme = context.scheme;

    return GlassCard(
      glass: false,
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space16),
      child: Row(
        children: [
          Expanded(
            child: _TodayStat(
              value: _formatMinutes(bundle.totalMinutesToday),
              label: 'Screen time',
            ),
          ),
          Container(width: 1, height: 28, color: scheme.outlineVariant),
          Expanded(
            child: _TodayStat(
              value: '$onlineCount/${bundle.devices.length}',
              label: 'Online',
            ),
          ),
          Container(width: 1, height: 28, color: scheme.outlineVariant),
          Expanded(
            child: _TodayStat(
              value: '$alerts',
              label: 'Alerts',
              accent: alerts > 0 ? scheme.error : null,
            ),
          ),
        ],
      ),
    );
  }
}

class _TodayStat extends StatelessWidget {
  const _TodayStat({required this.value, required this.label, this.accent});

  final String value;
  final String label;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value, style: context.metricStyle(size: 17, color: accent)),
        const SizedBox(height: AppSpacing.space2),
        Text(
          label.toUpperCase(),
          style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 0.5),
        ),
      ],
    );
  }
}

/// A pill scroller instead of a static icon grid — every action here is
/// a real, already-existing capability (pause, add time, add device,
/// review protection), nothing decorative.
class _QuickActionsRow extends StatelessWidget {
  const _QuickActionsRow({required this.bundle, required this.onPauseAll});

  final DashboardBundle bundle;
  final VoidCallback? onPauseAll;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _ActionPill(
            icon: Icons.pause_circle_outline_rounded,
            label: 'Pause all',
            onTap: onPauseAll,
          ),
          const SizedBox(width: AppSpacing.space8),
          _ActionPill(
            icon: Icons.add_circle_outline_rounded,
            label: 'Add time',
            onTap: bundle.devices.isEmpty
                ? null
                : () => context.push('/devices/${bundle.devices.first.id}/start-session'),
          ),
          const SizedBox(width: AppSpacing.space8),
          _ActionPill(
            icon: Icons.add_rounded,
            label: 'Add device',
            onTap: () => context.push('/devices/add'),
          ),
          const SizedBox(width: AppSpacing.space8),
          _ActionPill(
            icon: Icons.verified_user_outlined,
            label: 'Protection',
            onTap: () => context.push('/protection-health'),
          ),
        ],
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    final disabled = onTap == null;

    return Opacity(
      opacity: disabled ? 0.45 : 1,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.glassFill,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: colors.glassBorder),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(999),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: scheme.primaryContainer,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(icon, size: 14, color: scheme.onPrimaryContainer),
                  ),
                  const SizedBox(width: AppSpacing.space8),
                  Text(
                    label,
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
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
