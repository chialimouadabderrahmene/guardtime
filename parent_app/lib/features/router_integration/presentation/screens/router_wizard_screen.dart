import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/core/widgets/step_list_item.dart';

import '../../data/router_repository.dart';
import '../providers/router_providers.dart';

/// Router Wizard — a guided checklist rather than a strict linear stepper,
/// since each step (detect / confirm vendor / enter credentials / test) can
/// reasonably be redone independently as conditions change.
class RouterWizardScreen extends ConsumerStatefulWidget {
  const RouterWizardScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  ConsumerState<RouterWizardScreen> createState() => _RouterWizardScreenState();
}

class _RouterWizardScreenState extends ConsumerState<RouterWizardScreen> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String successMessage) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) showAppSnackbar(context, successMessage, type: SnackbarType.success);
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickVendor(List<String> vendorLabels, List<String> vendorIds) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView.builder(
          shrinkWrap: true,
          itemCount: vendorLabels.length,
          itemBuilder: (context, index) => ListTile(
            title: Text(vendorLabels[index]),
            onTap: () => Navigator.of(context).pop(vendorIds[index]),
          ),
        ),
      ),
    );
    if (selected == null) return;
    await _run(
      () => ref.read(routerRepositoryProvider).setup(widget.gatewayId, vendorPluginId: selected),
      'Vendor updated.',
    );
    ref.invalidate(detectedRouterProvider(widget.gatewayId));
    ref.invalidate(routerFeaturesProvider(widget.gatewayId));
  }

  @override
  Widget build(BuildContext context) {
    final routerAsync = ref.watch(detectedRouterProvider(widget.gatewayId));
    final featuresAsync = ref.watch(routerFeaturesProvider(widget.gatewayId));
    final vendorsAsync = ref.watch(routerVendorsProvider);
    final gatewayId = widget.gatewayId;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Router Wizard', showBack: true),
      child: routerAsync.when(
        loading: () => const LoadingStateView(message: 'Loading wizard…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(detectedRouterProvider(gatewayId)),
        ),
        data: (router) {
          final detected = router != null && router.hasBeenDetected;
          final capabilities = featuresAsync.valueOrNull?.capabilities;
          final canSetup = capabilities?.isFullyIntegrated ?? false;

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              const SectionHeader(title: 'Guided Setup'),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: Column(
                  children: [
                    StepListItem(
                      index: 1,
                      title: 'Detect your router',
                      description: detected ? 'Detected: ${router.vendor}' : 'Not detected yet',
                      trailing: FilledButton.tonal(
                        onPressed: _busy
                            ? null
                            : () => _run(() async {
                                await ref.read(routerRepositoryProvider).triggerDetection(gatewayId);
                                ref.invalidate(detectedRouterProvider(gatewayId));
                              }, 'Scan requested.'),
                        child: const Text('Scan'),
                      ),
                    ),
                    const Divider(),
                    StepListItem(
                      index: 2,
                      title: 'Confirm vendor',
                      description: detected
                          ? '${router.vendor} — tap Change if this is wrong'
                          : 'Detect the router first',
                      trailing: vendorsAsync.when(
                        loading: () => const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                        error: (_, _) => const SizedBox.shrink(),
                        data: (vendors) => TextButton(
                          onPressed: _busy
                              ? null
                              : () => _pickVendor(
                                  vendors.map((v) => v.vendorDisplayName).toList(),
                                  vendors.map((v) => v.pluginId).toList(),
                                ),
                          child: const Text('Change'),
                        ),
                      ),
                    ),
                    const Divider(),
                    StepListItem(
                      index: 3,
                      title: 'Enter credentials',
                      description: canSetup
                          ? 'GuardTime can connect automatically'
                          : 'Not available for this router — see Supported Features',
                      trailing: FilledButton.tonal(
                        onPressed: canSetup ? () => context.push('/routers/$gatewayId/setup') : null,
                        child: const Text('Open'),
                      ),
                    ),
                    const Divider(),
                    StepListItem(
                      index: 4,
                      title: 'Test connection',
                      description: 'Confirms GuardTime can reach and control the router',
                      trailing: FilledButton.tonal(
                        onPressed: (_busy || !canSetup)
                            ? null
                            : () => _run(
                                () => ref.read(routerRepositoryProvider).testConnection(gatewayId),
                                'Test requested — check Diagnostics for the result.',
                              ),
                        child: const Text('Test'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
