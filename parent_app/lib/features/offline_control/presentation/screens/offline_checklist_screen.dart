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
import 'package:parent_app/features/offline_control/data/offline_control_repository.dart';
import 'package:parent_app/features/offline_control/presentation/providers/offline_control_providers.dart';
import 'package:parent_app/shared/constants/disclaimers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';

class OfflineChecklistScreen extends ConsumerStatefulWidget {
  const OfflineChecklistScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  ConsumerState<OfflineChecklistScreen> createState() => _OfflineChecklistScreenState();
}

class _OfflineChecklistScreenState extends ConsumerState<OfflineChecklistScreen> {
  final _notesController = TextEditingController();
  bool _initialized = false;
  bool _saving = false;
  bool _pinEnabled = false;
  bool _childAccountLinked = false;
  bool _playtimeLimitEnabled = false;
  bool _ageRatingEnabled = false;
  bool _purchasesBlocked = false;
  bool _networkSettingsLocked = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  void _hydrate(Map<String, dynamic> values, String? notes) {
    if (_initialized) {
      return;
    }
    _pinEnabled = values['pinEnabled'] as bool? ?? false;
    _childAccountLinked = values['childAccountLinked'] as bool? ?? false;
    _playtimeLimitEnabled = values['playTimeLimitEnabled'] as bool? ?? false;
    _ageRatingEnabled = values['ageRatingEnabled'] as bool? ?? false;
    _purchasesBlocked = values['purchasesBlocked'] as bool? ?? false;
    _networkSettingsLocked = values['networkSettingsLocked'] as bool? ?? false;
    _notesController.text = notes ?? '';
    _initialized = true;
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(offlineControlRepositoryProvider)
          .updateChecklist(widget.deviceId, {
            'pinEnabled': _pinEnabled,
            'childAccountLinked': _childAccountLinked,
            'playTimeLimitEnabled': _playtimeLimitEnabled,
            'ageRatingEnabled': _ageRatingEnabled,
            'purchasesBlocked': _purchasesBlocked,
            'networkSettingsLocked': _networkSettingsLocked,
            'notes': _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          }..removeWhere((key, value) => value == null));
      ref.invalidate(offlineStatusProvider(widget.deviceId));
      if (mounted) {
        showAppSnackbar(context, 'Offline checklist saved.', type: SnackbarType.success);
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusAsync = ref.watch(offlineStatusProvider(widget.deviceId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Offline Checklist', showBack: true),
      child: statusAsync.when(
        loading: () => const LoadingStateView(message: 'Loading checklist...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(offlineStatusProvider(widget.deviceId)),
        ),
        data: (status) {
          _hydrate({
            'pinEnabled': status.checklist?.pinEnabled,
            'childAccountLinked': status.checklist?.childAccountLinked,
            'playTimeLimitEnabled': status.checklist?.playTimeLimitEnabled,
            'ageRatingEnabled': status.checklist?.ageRatingEnabled,
            'purchasesBlocked': status.checklist?.purchasesBlocked,
            'networkSettingsLocked': status.checklist?.networkSettingsLocked,
          }, status.checklist?.notes);

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              const InfoNoticeCard(
                title: 'Required for real-world coverage',
                message: AppDisclaimers.offlineGamesNotice,
                icon: Icons.verified_user_outlined,
              ),
              const SizedBox(height: AppSpacing.xl),
              GlassCard(
                child: Column(
                  children: [
                    _ChecklistTile(
                      label: 'PIN enabled',
                      value: _pinEnabled,
                      onChanged: (value) => setState(() => _pinEnabled = value),
                    ),
                    _ChecklistTile(
                      label: 'Child account linked',
                      value: _childAccountLinked,
                      onChanged: (value) => setState(() => _childAccountLinked = value),
                    ),
                    _ChecklistTile(
                      label: 'Playtime limit enabled',
                      value: _playtimeLimitEnabled,
                      onChanged: (value) => setState(() => _playtimeLimitEnabled = value),
                    ),
                    _ChecklistTile(
                      label: 'Age rating enabled',
                      value: _ageRatingEnabled,
                      onChanged: (value) => setState(() => _ageRatingEnabled = value),
                    ),
                    _ChecklistTile(
                      label: 'Purchases blocked',
                      value: _purchasesBlocked,
                      onChanged: (value) => setState(() => _purchasesBlocked = value),
                    ),
                    _ChecklistTile(
                      label: 'Network settings locked',
                      value: _networkSettingsLocked,
                      onChanged: (value) => setState(() => _networkSettingsLocked = value),
                      isLast: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: GuardTimeTextField(
                  controller: _notesController,
                  label: 'Parent notes',
                  hint: 'Optional setup notes',
                  maxLines: 4,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              GradientButton(label: 'Save Checklist', onPressed: _save, isBusy: _saving),
            ],
          );
        },
      ),
    );
  }
}

class _ChecklistTile extends StatelessWidget {
  const _ChecklistTile({
    required this.label,
    required this.value,
    required this.onChanged,
    this.isLast = false,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: value,
          onChanged: onChanged,
          title: Text(label),
        ),
        if (!isLast) const Divider(),
      ],
    );
  }
}
