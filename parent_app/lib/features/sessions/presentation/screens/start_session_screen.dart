import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/sessions/data/sessions_repository.dart';
import 'package:parent_app/features/sessions/presentation/providers/session_providers.dart';

class StartSessionScreen extends ConsumerStatefulWidget {
  const StartSessionScreen({super.key, required this.deviceId});

  final String deviceId;

  @override
  ConsumerState<StartSessionScreen> createState() => _StartSessionScreenState();
}

class _StartSessionScreenState extends ConsumerState<StartSessionScreen> {
  int _duration = 60;
  bool _saving = false;

  Future<void> _start() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(sessionsRepositoryProvider)
          .startSession(deviceId: widget.deviceId, durationMinutes: _duration);
      ref.invalidate(activeSessionsProvider);
      if (mounted) {
        context.pop();
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

  Future<void> _stopSession(String sessionId) async {
    try {
      await ref.read(sessionsRepositoryProvider).stopSession(sessionId);
      ref.invalidate(activeSessionsProvider);
      if (mounted) {
        showAppSnackbar(context, 'Session stopped.', type: SnackbarType.success);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackbar(context, error.toString(), type: SnackbarType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final deviceAsync = ref.watch(deviceDetailsProvider(widget.deviceId));
    final sessionsAsync = ref.watch(activeSessionsProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Start Session', showBack: true),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading session screen…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceDetailsProvider(widget.deviceId)),
        ),
        data: (device) => ListView(
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
                  Text(device.name, style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: AppSpacing.space8),
                  Text(
                    'Choose how long ${device.childName ?? 'your child'} can stay online on this device.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            sessionsAsync.when(
              loading: () =>
                  const LoadingStateView(message: 'Loading live sessions…', compact: true),
              error: (error, _) => Text(error.toString()),
              data: (sessions) {
                final matching = sessions.where((item) => item.deviceId == device.id).toList();
                if (matching.isEmpty) {
                  return const SizedBox.shrink();
                }
                final session = matching.first;
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                  child: GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Active session', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: AppSpacing.space8),
                        Text('${session.remainingMinutes} minutes left'),
                        const SizedBox(height: AppSpacing.space12),
                        SecondaryGlassButton(
                          label: 'Stop current session',
                          onPressed: () => _stopSession(session.id),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Session length', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: AppSpacing.space8),
                  Text('$_duration minutes'),
                  Slider(
                    value: _duration.toDouble(),
                    min: 15,
                    max: 180,
                    divisions: 11,
                    label: '$_duration minutes',
                    onChanged: (value) => setState(() => _duration = value.round()),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.space10,
                    children: [30, 45, 60, 90, 120].map((value) {
                      return ChoiceChip(
                        label: Text('${value}m'),
                        selected: _duration == value,
                        onSelected: (_) => setState(() => _duration = value),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  GradientButton(label: 'Start Session', onPressed: _start, isBusy: _saving),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
