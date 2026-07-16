import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/theme/theme_mode_provider.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/confirm_dialog.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:parent_app/features/settings/presentation/providers/settings_providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final confirmed = await ConfirmDialog.show(
      context,
      title: 'Log out',
      message: 'Are you sure you want to sign out?',
      confirmLabel: 'Log out',
      destructive: true,
    );
    if (confirmed) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }

  Future<void> _pickAppearance(BuildContext context, WidgetRef ref) async {
    final current = ref.read(themeModeProvider);
    await AppBottomSheet.show<void>(
      context,
      title: 'Appearance',
      child: RadioGroup<ThemeMode>(
        groupValue: current,
        onChanged: (mode) {
          if (mode != null) {
            ref.read(themeModeProvider.notifier).setThemeMode(mode);
          }
          Navigator.of(context).pop();
        },
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final option in const [
              (ThemeMode.system, 'System', Icons.brightness_auto_rounded),
              (ThemeMode.light, 'Light', Icons.light_mode_rounded),
              (ThemeMode.dark, 'Dark', Icons.dark_mode_rounded),
            ])
              RadioListTile<ThemeMode>(
                contentPadding: EdgeInsets.zero,
                value: option.$1,
                title: Row(
                  children: [
                    Icon(option.$3, size: 20),
                    const SizedBox(width: AppSpacing.space12),
                    Text(option.$2),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(parentProfileProvider);
    final subscriptionAsync = ref.watch(subscriptionProvider);
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        actions: [
          IconButton(
            onPressed: () => context.push('/notifications'),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
        ],
      ),
      child: profileAsync.when(
        loading: () => const LoadingStateView(message: 'Loading settings...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(parentProfileProvider),
        ),
        data: (profile) => ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            AppSpacing.space12,
            AppSpacing.page,
            120,
          ),
          children: [
            GlassCard(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 34,
                    backgroundColor: scheme.surfaceContainerHigh,
                    child: Text(
                      profile.displayName.characters.first.toUpperCase(),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.space12),
                  Text(profile.displayName, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.space4),
                  Text(
                    profile.email,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.space14),
                  subscriptionAsync.when(
                    loading: () => const SizedBox.shrink(),
                    error: (error, stackTrace) => const SizedBox.shrink(),
                    data: (subscription) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: scheme.secondaryContainer.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                      child: Text(
                        '${subscription.badgeLabel} plan',
                        style: Theme.of(
                          context,
                        ).textTheme.labelLarge?.copyWith(color: scheme.onSecondaryContainer),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            _SettingsGroup(
              title: 'General',
              children: [
                AppListTile(
                  leading: Icons.person_outline_rounded,
                  title: 'Account',
                  subtitle: 'Personal info, privacy, deletion',
                  onTap: () => context.push('/legal'),
                ),
                AppListTile(
                  leading: Icons.people_outline_rounded,
                  title: 'Children',
                  subtitle: 'Manage profiles and restrictions',
                  onTap: () => context.go('/children'),
                ),
                AppListTile(
                  leading: Icons.devices_rounded,
                  title: 'Devices',
                  subtitle: 'Connected hardware, DNS status',
                  onTap: () => context.go('/devices'),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            _SettingsGroup(
              title: 'Preferences',
              children: [
                AppListTile(
                  leading: Icons.palette_outlined,
                  title: 'Appearance',
                  subtitle: 'Light, dark, or match system',
                  onTap: () => _pickAppearance(context, ref),
                ),
                AppListTile(
                  leading: Icons.notifications_none_rounded,
                  title: 'Notifications',
                  subtitle: 'Alert thresholds, email, push',
                  onTap: () => context.push('/notifications'),
                ),
                const AppListTile(
                  leading: Icons.workspace_premium_outlined,
                  title: 'Subscription',
                  subtitle: 'Manage plan and billing history',
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            _SettingsGroup(
              title: 'Trust & Support',
              children: [
                AppListTile(
                  leading: Icons.privacy_tip_outlined,
                  title: 'Privacy & Account',
                  subtitle: 'Policy, web deletion path, in-app deletion',
                  onTap: () => context.push('/legal'),
                ),
                AppListTile(
                  leading: Icons.help_outline_rounded,
                  title: 'Support',
                  subtitle: 'Guides, platform limits, DNS help',
                  onTap: () => context.push('/guides'),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xl),
            GradientButton(
              label: 'Log Out',
              onPressed: () => _confirmLogout(context, ref),
              icon: const Icon(Icons.logout_rounded),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'GuardTime v1.0.1\n© 2026 Smart Family Systems',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 14, 10, 6),
            child: Text(
              title.toUpperCase(),
              style: Theme.of(
                context,
              ).textTheme.labelMedium?.copyWith(color: context.scheme.onSurfaceVariant),
            ),
          ),
          for (final child in children)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space8),
              child: child,
            ),
          const SizedBox(height: AppSpacing.space4),
        ],
      ),
    );
  }
}
