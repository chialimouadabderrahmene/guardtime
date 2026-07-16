import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/core/widgets/step_list_item.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/offline_control/data/offline_control_repository.dart';
import 'package:parent_app/features/offline_control/presentation/providers/offline_control_providers.dart';
import 'package:parent_app/shared/constants/disclaimers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';

class OfflineControlGuideScreen extends ConsumerStatefulWidget {
  const OfflineControlGuideScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  ConsumerState<OfflineControlGuideScreen> createState() =>
      _OfflineControlGuideScreenState();
}

class _OfflineControlGuideScreenState extends ConsumerState<OfflineControlGuideScreen> {
  bool _saving = false;

  Future<void> _markSetupComplete({required bool completed, required String? method}) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(offlineControlRepositoryProvider)
          .updateSetupStatus(
            widget.deviceId,
            completed: completed,
            verified: completed,
            method: method,
          );
      ref.invalidate(offlineStatusProvider(widget.deviceId));
      ref.invalidate(deviceDetailsProvider(widget.deviceId));
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final deviceAsync = ref.watch(deviceDetailsProvider(widget.deviceId));
    final statusAsync = ref.watch(offlineStatusProvider(widget.deviceId));
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Offline Control Guide', showBack: true),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading offline guide...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceDetailsProvider(widget.deviceId)),
        ),
        data: (device) {
          final guideAsync = ref.watch(offlineGuideByTypeProvider(device.type));
          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              const InfoNoticeCard(
                title: 'Honest limitation',
                message: AppDisclaimers.offlineGamesNotice,
                icon: Icons.lock_outline_rounded,
              ),
              const SizedBox(height: AppSpacing.xl),
              guideAsync.when(
                loading: () =>
                    const LoadingStateView(message: 'Loading official setup steps...'),
                error: (error, _) => ErrorStateView(
                  message: error.toString(),
                  onRetry: () => ref.invalidate(offlineGuideByTypeProvider(device.type)),
                ),
                data: (guide) => GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(guide.title, style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: AppSpacing.space10),
                      Text(
                        'Method: ${guide.method}',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: AppSpacing.space8),
                      for (var i = 0; i < guide.steps.length; i++) ...[
                        if (i > 0) const Divider(height: 1),
                        StepListItem(index: i + 1, title: guide.steps[i]),
                      ],
                      if (guide.officialUrl.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.space10),
                        Text(
                          guide.officialUrl,
                          style: Theme.of(
                            context,
                          ).textTheme.bodyMedium?.copyWith(color: scheme.primary),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              const SectionHeader(title: 'Current setup status'),
              const SizedBox(height: AppSpacing.md),
              statusAsync.when(
                loading: () =>
                    const LoadingStateView(message: 'Loading setup status...', compact: true),
                error: (error, _) => Text(error.toString()),
                data: (status) => GlassCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        status.offlineControlEnabled
                            ? 'Offline control marked complete'
                            : 'Offline setup still needed',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: AppSpacing.space8),
                      Text(
                        status.recommendedNextStep,
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                      const SizedBox(height: AppSpacing.space16),
                      GradientButton(
                        label: status.offlineControlEnabled
                            ? 'Mark as needs review'
                            : 'Mark setup complete',
                        onPressed: () => _markSetupComplete(
                          completed: !status.offlineControlEnabled,
                          method: status.offlineControlMethod,
                        ),
                        isBusy: _saving,
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
