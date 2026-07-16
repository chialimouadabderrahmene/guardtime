import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/protection/data/protection_repository.dart';
import 'package:parent_app/features/protection/presentation/providers/protection_providers.dart';

class ScheduleRulesScreen extends ConsumerStatefulWidget {
  const ScheduleRulesScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  ConsumerState<ScheduleRulesScreen> createState() => _ScheduleRulesScreenState();
}

class _ScheduleRulesScreenState extends ConsumerState<ScheduleRulesScreen> {
  bool _initialized = false;
  bool _saving = false;
  bool _autoBlockEnabled = false;
  bool _dailyLimitEnabled = true;
  double _dailyLimitMinutes = 120;
  TimeOfDay? _bedtimeStart;
  TimeOfDay? _bedtimeEnd;

  void _initializeFromRemote({
    required bool autoBlockEnabled,
    required int? dailyLimitMinutes,
    required String? bedtimeStart,
    required String? bedtimeEnd,
  }) {
    if (_initialized) {
      return;
    }
    _autoBlockEnabled = autoBlockEnabled;
    _dailyLimitEnabled = dailyLimitMinutes != null;
    _dailyLimitMinutes = (dailyLimitMinutes ?? 120).toDouble().clamp(30, 600);
    _bedtimeStart = _parseTime(bedtimeStart);
    _bedtimeEnd = _parseTime(bedtimeEnd);
    _initialized = true;
  }

  Future<void> _pickTime({required bool isStart}) async {
    final initialTime =
        (isStart ? _bedtimeStart : _bedtimeEnd) ?? const TimeOfDay(hour: 21, minute: 0);
    final picked = await showTimePicker(context: context, initialTime: initialTime);
    if (picked == null || !mounted) {
      return;
    }
    setState(() {
      if (isStart) {
        _bedtimeStart = picked;
      } else {
        _bedtimeEnd = picked;
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(protectionRepositoryProvider)
          .saveSchedule(
            widget.deviceId,
            autoBlockEnabled: _autoBlockEnabled,
            dailyLimitMinutes: _dailyLimitEnabled ? _dailyLimitMinutes.round() : null,
            bedtimeStart: _formatTime24(_bedtimeStart),
            bedtimeEnd: _formatTime24(_bedtimeEnd),
          );
      ref.invalidate(deviceScheduleProvider(widget.deviceId));
      if (mounted) {
        showAppSnackbar(context, 'Schedule saved.', type: SnackbarType.success);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackbar(context, error.toString(), type: SnackbarType.error);
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheduleAsync = ref.watch(deviceScheduleProvider(widget.deviceId));
    final formatter = DateFormat('HH:mm');

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Schedule Rules', showBack: true),
      child: scheduleAsync.when(
        loading: () => const LoadingStateView(message: 'Loading schedule...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceScheduleProvider(widget.deviceId)),
        ),
        data: (schedule) {
          _initializeFromRemote(
            autoBlockEnabled: schedule.autoBlockEnabled,
            dailyLimitMinutes: schedule.dailyLimitMinutes,
            bedtimeStart: schedule.bedtimeStart,
            bedtimeEnd: schedule.bedtimeEnd,
          );

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              GlassCard(
                child: SwitchListTile.adaptive(
                  value: _autoBlockEnabled,
                  contentPadding: EdgeInsets.zero,
                  onChanged: (value) => setState(() => _autoBlockEnabled = value),
                  title: const Text('Enable auto-block'),
                  subtitle: const Text(
                    'Automatically enforce daily limit and bedtime windows.',
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: Column(
                  children: [
                    SwitchListTile.adaptive(
                      value: _dailyLimitEnabled,
                      contentPadding: EdgeInsets.zero,
                      onChanged: (value) => setState(() => _dailyLimitEnabled = value),
                      title: const Text('Daily time limit'),
                      subtitle: Text(
                        _dailyLimitEnabled
                            ? '${_dailyLimitMinutes.round()} minutes per day'
                            : 'Disabled',
                      ),
                    ),
                    if (_dailyLimitEnabled) ...[
                      Slider(
                        value: _dailyLimitMinutes,
                        min: 30,
                        max: 360,
                        divisions: 11,
                        label: '${_dailyLimitMinutes.round()} min',
                        onChanged: (value) => setState(() => _dailyLimitMinutes = value),
                      ),
                      Text(
                        '${(_dailyLimitMinutes / 60).floor()}h ${_dailyLimitMinutes.round() % 60}m',
                        style: Theme.of(
                          context,
                        ).textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              GlassCard(
                child: Column(
                  children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Bedtime start'),
                      subtitle: Text(
                        _bedtimeStart == null
                            ? 'Not set'
                            : formatter.format(
                                DateTime(0, 1, 1, _bedtimeStart!.hour, _bedtimeStart!.minute),
                              ),
                      ),
                      trailing: const Icon(Icons.schedule_rounded),
                      onTap: () => _pickTime(isStart: true),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Bedtime end'),
                      subtitle: Text(
                        _bedtimeEnd == null
                            ? 'Not set'
                            : formatter.format(
                                DateTime(0, 1, 1, _bedtimeEnd!.hour, _bedtimeEnd!.minute),
                              ),
                      ),
                      trailing: const Icon(Icons.schedule_rounded),
                      onTap: () => _pickTime(isStart: false),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              GradientButton(label: 'Save Rules', onPressed: _save, isBusy: _saving),
            ],
          );
        },
      ),
    );
  }
}

TimeOfDay? _parseTime(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  final parts = value.split(':');
  if (parts.length != 2) {
    return null;
  }
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null) {
    return null;
  }
  return TimeOfDay(hour: hour, minute: minute);
}

String? _formatTime24(TimeOfDay? time) {
  if (time == null) {
    return null;
  }
  final hour = time.hour.toString().padLeft(2, '0');
  final minute = time.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}
