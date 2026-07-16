import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/analytics/analytics_service.dart';
import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/network/api_exception.dart';
import 'package:parent_app/core/platform/external_link_service.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/confirm_dialog.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:parent_app/features/settings/data/settings_repository.dart';

class PrivacyAccountScreen extends ConsumerStatefulWidget {
  const PrivacyAccountScreen({super.key});

  @override
  ConsumerState<PrivacyAccountScreen> createState() => _PrivacyAccountScreenState();
}

class _PrivacyAccountScreenState extends ConsumerState<PrivacyAccountScreen> {
  bool _isDeleting = false;

  Future<void> _openExternal(String url, String label) async {
    final opened = await ref.read(externalLinkServiceProvider).openUrl(url);
    if (!mounted) {
      return;
    }

    if (opened) {
      return;
    }

    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) {
      return;
    }

    showAppSnackbar(context, '$label link copied to clipboard.');
  }

  Future<void> _deleteAccount() async {
    final auth = ref.read(authControllerProvider);
    if (!auth.isAuthenticated) {
      showAppSnackbar(
        context,
        'Sign in first to delete your account in-app.',
        type: SnackbarType.info,
      );
      return;
    }

    final confirmed = await ConfirmDialog.show(
      context,
      title: 'Delete account',
      message:
          'This permanently removes your GuardTime parent account and associated children, devices, sessions, and notifications, except records retained for security, fraud prevention, or legal compliance.',
      confirmLabel: 'Delete account',
      destructive: true,
    );

    if (!confirmed || !mounted) {
      return;
    }

    setState(() => _isDeleting = true);
    try {
      await ref.read(settingsRepositoryProvider).deleteAccount();
      AnalyticsService.instance.deleteAccount(source: 'in_app');
      await ref.read(authControllerProvider.notifier).clearSession();
      if (!mounted) {
        return;
      }
      showAppSnackbar(
        context,
        'Your account has been deleted.',
        type: SnackbarType.success,
      );
      context.go('/login');
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error is ApiException ? error.message : 'Unable to delete account.';
      showAppSnackbar(context, message, type: SnackbarType.error);
    } finally {
      if (mounted) {
        setState(() => _isDeleting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Privacy & Account', showBack: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.page,
          AppSpacing.space12,
          AppSpacing.page,
          120,
        ),
        children: [
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your data controls', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: AppSpacing.space10),
                Text(
                  'GuardTime gives parents a clear in-app path to review data use, open the public privacy policy, request deletion from the web, and delete an active account directly in the app.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _PolicySection(
            title: 'In-app privacy policy',
            children: const [
              _PolicyBullet(
                text:
                    'GuardTime stores account details, child profiles, device setup data, DNS and network status, gaming sessions, schedules, notifications, and protection signals needed to run the service.',
              ),
              _PolicyBullet(
                text:
                    'The app uses this data to authenticate parents, show dashboards, apply DNS-based controls, surface insights, and troubleshoot service health.',
              ),
              _PolicyBullet(
                text:
                    'GuardTime does not sell personal data. Some data may be processed by hosting or security providers or retained where required for security, fraud prevention, or legal compliance.',
              ),
              _PolicyBullet(
                text:
                    'Validated deletion requests remove the parent account and associated app data, except records that must be retained for the reasons above.',
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Public web resources', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: AppSpacing.space10),
                Text(
                  'Google Play also requires public web access for privacy information and account deletion requests.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: SecondaryGlassButton(
                    label: 'Open privacy policy',
                    onPressed: () =>
                        _openExternal(AppConfig.privacyPolicyUrl, 'Privacy policy'),
                    icon: const Icon(Icons.open_in_new_rounded),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: SecondaryGlassButton(
                    label: 'Open privacy and deletion page',
                    onPressed: () =>
                        _openExternal(AppConfig.privacyRequestUrl, 'Privacy request'),
                    icon: const Icon(Icons.public_rounded),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  AppConfig.privacyRequestUrl,
                  style: Theme.of(
                    context,
                  ).textTheme.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Delete account', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: AppSpacing.space10),
                Text(
                  auth.isAuthenticated
                      ? 'Deleting your account here permanently removes your GuardTime parent account and associated app data on the backend.'
                      : 'If you are signed out or already uninstalled the app, use the public privacy and deletion page above to submit a request.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: AppSpacing.lg),
                GradientButton(
                  label: auth.isAuthenticated ? 'Delete account now' : 'Sign in to delete in-app',
                  onPressed: auth.isAuthenticated ? _deleteAccount : () => context.go('/login'),
                  isBusy: _isDeleting,
                  destructive: auth.isAuthenticated,
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PolicySection extends StatelessWidget {
  const _PolicySection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.md),
          ...children,
        ],
      ),
    );
  }
}

class _PolicyBullet extends StatelessWidget {
  const _PolicyBullet({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.space12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
          ),
          const SizedBox(width: AppSpacing.space12),
          Expanded(
            child: Text(
              text,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}
