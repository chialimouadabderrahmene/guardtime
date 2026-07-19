import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/app_text_field.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';

import '../../data/router_repository.dart';
import '../providers/router_providers.dart';

/// One-Click Setup: for a vendor GuardTime has actually built a plugin for,
/// collect admin credentials once and hand them to gateway-agent (encrypted
/// at rest, decrypted only server-side for the owning gateway). For every
/// other vendor (Guide Only, or an official API GuardTime hasn't wired up
/// yet), this honestly says so instead of showing a form that can't work.
class OneClickSetupScreen extends ConsumerStatefulWidget {
  const OneClickSetupScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  ConsumerState<OneClickSetupScreen> createState() => _OneClickSetupScreenState();
}

class _OneClickSetupScreenState extends ConsumerState<OneClickSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _apiKeyController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _submit(bool usesApiKey) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      await ref
          .read(routerRepositoryProvider)
          .setup(
            widget.gatewayId,
            username: usesApiKey ? null : _usernameController.text.trim(),
            password: usesApiKey ? null : _passwordController.text,
            apiKey: usesApiKey ? _apiKeyController.text.trim() : null,
          );
      if (mounted) {
        showAppSnackbar(
          context,
          'Saved — testing the connection now. Check Diagnostics for the result.',
          type: SnackbarType.success,
        );
        ref.invalidate(routerDiagnosticsProvider(widget.gatewayId));
      }
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final featuresAsync = ref.watch(routerFeaturesProvider(widget.gatewayId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'One-Click Setup', showBack: true),
      child: featuresAsync.when(
        loading: () => const LoadingStateView(message: 'Checking what this router supports…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(routerFeaturesProvider(widget.gatewayId)),
        ),
        data: (features) {
          final capabilities = features.capabilities;

          if (!features.detected || capabilities == null) {
            return const Padding(
              padding: EdgeInsets.all(AppSpacing.page),
              child: InfoNoticeCard(
                title: 'No router detected yet',
                message: 'Run a detection scan from Router Details before setting up a connection.',
              ),
            );
          }

          if (!capabilities.isFullyIntegrated) {
            return Padding(
              padding: const EdgeInsets.all(AppSpacing.page),
              child: InfoNoticeCard(
                title: capabilities.isOfficialApi ? 'Coming soon' : 'Guide Only',
                message: capabilities.isOfficialApi
                    ? '${capabilities.vendorDisplayName} publishes an official API (${capabilities.protocol}), but GuardTime has not shipped an integration for it yet. Check Supported Features for details.'
                    : '${capabilities.vendorDisplayName} has no official API — GuardTime cannot connect to it automatically. See Supported Features for manual setup guidance.',
              ),
            );
          }

          final usesApiKey =
              capabilities.supportedAuthentication.contains('api-key') &&
              !capabilities.supportedAuthentication.any((a) => a.contains('password') || a.contains('digest') || a.contains('ssh'));

          return Form(
            key: _formKey,
            child: ListView(
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
                      Text('Connect to ${capabilities.vendorDisplayName}', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: AppSpacing.space8),
                      Text(
                        'These credentials are encrypted before storage and are only ever decrypted for your own gateway.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      if (usesApiKey)
                        GuardTimeTextField(
                          controller: _apiKeyController,
                          label: 'API key / token',
                          prefixIcon: Icons.vpn_key_rounded,
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                        )
                      else ...[
                        GuardTimeTextField(
                          controller: _usernameController,
                          label: 'Admin username',
                          prefixIcon: Icons.person_outline_rounded,
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        GuardTimeTextField(
                          controller: _passwordController,
                          label: 'Admin password',
                          obscureText: true,
                          prefixIcon: Icons.lock_outline_rounded,
                          validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
                        ),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      GradientButton(
                        label: 'Save & Test Connection',
                        onPressed: () => _submit(usesApiKey),
                        isBusy: _saving,
                      ),
                    ],
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
