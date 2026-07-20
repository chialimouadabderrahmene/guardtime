import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

import '../../data/pairing_repository.dart';
import '../../domain/pairing_models.dart';
import '../providers/pairing_providers.dart';

/// Five-step guided setup that replaces manual IP entry entirely: create →
/// configure DNS (QR + copyable token) → instructions → live connection
/// test → success. See backend/src/pairing/pairing.constants.ts for why the
/// "test" step works the way it does (a raw UDP probe from this phone, not
/// a normal DNS lookup).
class PairingWizardScreen extends ConsumerStatefulWidget {
  const PairingWizardScreen({
    super.key,
    required this.deviceId,
    required this.deviceName,
  });

  final String deviceId;
  final String deviceName;

  @override
  ConsumerState<PairingWizardScreen> createState() => _PairingWizardScreenState();
}

enum _TestPhase { idle, sendingProbe, waitingForConfirmation, success, timedOut, error }

class _PairingWizardScreenState extends ConsumerState<PairingWizardScreen> {
  final _pageController = PageController();
  int _step = 0;

  bool _startingPairing = false;
  String? _startError;
  PairingStartResult? _pairing;
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;

  _TestPhase _testPhase = _TestPhase.idle;
  String? _testMessage;
  Timer? _pollTimer;
  int _pollElapsedSeconds = 0;
  static const _pollTimeout = Duration(seconds: 45);
  static const _pollInterval = Duration(seconds: 2);

  PairingStatus? _finalStatus;

  @override
  void dispose() {
    _pageController.dispose();
    _countdownTimer?.cancel();
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _goToStep(int step) async {
    setState(() => _step = step);
    await _pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _startPairing() async {
    setState(() {
      _startingPairing = true;
      _startError = null;
    });
    try {
      final result = await ref
          .read(pairingRepositoryProvider)
          .startPairing(widget.deviceId);
      if (!mounted) return;
      setState(() {
        _pairing = result;
        _startingPairing = false;
      });
      _startCountdown();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _startError = error.toString();
        _startingPairing = false;
      });
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    final expiresAt = _pairing?.expiresAt;
    if (expiresAt == null) return;
    void tick() {
      final remaining = expiresAt.difference(DateTime.now());
      if (!mounted) return;
      setState(() => _remaining = remaining.isNegative ? Duration.zero : remaining);
    }

    tick();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => tick());
  }

  Future<void> _runConnectionTest() async {
    final pairing = _pairing;
    if (pairing == null) return;

    _pollTimer?.cancel();
    setState(() {
      _testPhase = _TestPhase.sendingProbe;
      _testMessage = 'Sending pairing probe…';
      _pollElapsedSeconds = 0;
    });

    final probeResult = await ref
        .read(pairingProbeServiceProvider)
        .sendProbe(
          resolverHost: pairing.dnsServer.isNotEmpty
              ? pairing.dnsServer
              : AppConfig.dnsResolverIp,
          pairDomainSuffix: AppConfig.pairDomainSuffix,
          token: pairing.token,
        );

    if (!mounted) return;

    if (!probeResult.sent) {
      setState(() {
        _testPhase = _TestPhase.error;
        _testMessage = 'Could not reach the resolver from this network (${probeResult.error}). '
            'Make sure your phone has an internet connection and try again.';
      });
      return;
    }

    setState(() {
      _testPhase = _TestPhase.waitingForConfirmation;
      _testMessage = 'Waiting for resolver confirmation…';
    });
    _pollStatus();
  }

  void _pollStatus() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(_pollInterval, (timer) async {
      _pollElapsedSeconds += _pollInterval.inSeconds;

      PairingStatus status;
      try {
        status = await ref.read(pairingRepositoryProvider).getStatus(widget.deviceId);
      } catch (_) {
        return; // transient network hiccup — keep polling until timeout
      }
      if (!mounted) return;

      if (status.paired) {
        timer.cancel();
        setState(() {
          _testPhase = _TestPhase.success;
          _finalStatus = status;
        });
        ref.invalidate(deviceDetailsProvider(widget.deviceId));
        ref.invalidate(devicesListProvider);
        await Future<void>.delayed(const Duration(milliseconds: 900));
        if (mounted) _goToStep(4);
        return;
      }

      if (status.pairStatus == PairStatus.expired || status.pairStatus == PairStatus.failed) {
        timer.cancel();
        setState(() {
          _testPhase = _TestPhase.error;
          _testMessage = status.pairStatus == PairStatus.expired
              ? 'The pairing code expired. Go back and generate a new one.'
              : 'Too many attempts — go back and generate a new pairing code.';
        });
        return;
      }

      if (_pollElapsedSeconds >= _pollTimeout.inSeconds) {
        timer.cancel();
        setState(() {
          _testPhase = _TestPhase.timedOut;
          _testMessage =
              "We haven't seen the probe reach our resolver yet. Double-check the device's "
              'network/DNS settings, then try again.';
        });
      }
    });
  }

  void _copy(String label, String value) {
    Clipboard.setData(ClipboardData(text: value));
    showAppSnackbar(context, '$label copied', type: SnackbarType.success);
  }

  @override
  Widget build(BuildContext context) {
    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        title: 'Connect ${widget.deviceName}',
        showBack: _step == 0,
      ),
      child: Column(
        children: [
          _StepDots(current: _step, total: 5),
          const SizedBox(height: AppSpacing.md),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _DeviceCreatedStep(
                  deviceName: widget.deviceName,
                  onContinue: () async {
                    await _goToStep(1);
                    if (_pairing == null && !_startingPairing) {
                      await _startPairing();
                    }
                  },
                ),
                _ConfigureDnsStep(
                  loading: _startingPairing,
                  error: _startError,
                  pairing: _pairing,
                  remaining: _remaining,
                  onRetry: _startPairing,
                  onCopy: _copy,
                  onContinue: () => _goToStep(2),
                ),
                _InstructionsStep(onContinue: () => _goToStep(3)),
                _TestConnectionStep(
                  phase: _testPhase,
                  message: _testMessage,
                  onTest: _runConnectionTest,
                  onBackToInstructions: () => _goToStep(2),
                  onRestartPairing: () async {
                    setState(() {
                      _pairing = null;
                      _testPhase = _TestPhase.idle;
                    });
                    await _goToStep(1);
                    await _startPairing();
                  },
                ),
                _SuccessStep(
                  deviceName: widget.deviceName,
                  status: _finalStatus,
                  onFinish: () => context.go('/devices/${widget.deviceId}'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StepDots extends StatelessWidget {
  const _StepDots({required this.current, required this.total});

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
      child: Row(
        children: List.generate(total, (i) {
          final active = i <= current;
          return Expanded(
            child: Container(
              margin: EdgeInsets.only(right: i == total - 1 ? 0 : AppSpacing.space8),
              height: 4,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadius.pill),
                gradient: active ? context.colors.brandGradient : null,
                color: active ? null : context.colors.glassBorder,
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _WizardPage extends StatelessWidget {
  const _WizardPage({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.page,
        AppSpacing.space8,
        AppSpacing.page,
        48,
      ),
      children: children,
    );
  }
}

class _DeviceCreatedStep extends StatelessWidget {
  const _DeviceCreatedStep({required this.deviceName, required this.onContinue});

  final String deviceName;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return _WizardPage(
      children: [
        const SizedBox(height: AppSpacing.space32),
        Center(
          child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  gradient: context.colors.brandGradient,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.devices_rounded, color: Colors.white, size: 44),
              )
              .animate()
              .scale(duration: 400.ms, curve: Curves.easeOutBack)
              .fadeIn(duration: 300.ms),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          '$deviceName is created',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: AppSpacing.space8),
        Text(
          'No IP address to type in — GuardTime pairs this device automatically over DNS. '
          "Next, we'll show you a QR code and DNS server to configure.",
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.space32),
        GradientButton(label: 'Continue', onPressed: onContinue),
      ],
    );
  }
}

class _ConfigureDnsStep extends StatelessWidget {
  const _ConfigureDnsStep({
    required this.loading,
    required this.error,
    required this.pairing,
    required this.remaining,
    required this.onRetry,
    required this.onCopy,
    required this.onContinue,
  });

  final bool loading;
  final String? error;
  final PairingStartResult? pairing;
  final Duration remaining;
  final VoidCallback onRetry;
  final void Function(String label, String value) onCopy;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const _WizardPage(
        children: [
          SizedBox(height: 120),
          Center(child: CircularProgressIndicator()),
          SizedBox(height: AppSpacing.md),
          Center(child: Text('Generating your pairing code…')),
        ],
      );
    }

    if (error != null || pairing == null) {
      return _WizardPage(
        children: [
          const SizedBox(height: AppSpacing.space32),
          Icon(Icons.error_outline_rounded, size: 48, color: context.scheme.error),
          const SizedBox(height: AppSpacing.md),
          Text(
            error ?? 'Could not generate a pairing code.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          GradientButton(label: 'Try Again', onPressed: onRetry),
        ],
      );
    }

    final minutes = remaining.inMinutes;
    final seconds = remaining.inSeconds % 60;
    final expiringSoon = remaining.inSeconds > 0 && remaining.inSeconds < 60;

    return _WizardPage(
      children: [
        Text('Configure DNS', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: AppSpacing.space8),
        Text(
          'Scan the QR code on the device, or enter these values manually in its network / router DNS settings.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.lg),
        GlassCard(
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(AppSpacing.space12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: QrImageView(
                  data: pairing!.qrPayload,
                  size: 180,
                  backgroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _CopyableField(
          label: 'DNS Server',
          value: pairing!.dnsServer,
          icon: Icons.dns_rounded,
          onCopy: () => onCopy('DNS server', pairing!.dnsServer),
        ),
        const SizedBox(height: AppSpacing.sm),
        _CopyableField(
          label: 'Pair Token',
          value: pairing!.token,
          icon: Icons.key_rounded,
          onCopy: () => onCopy('Pair token', pairing!.token),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          remaining.inSeconds > 0
              ? 'Code expires in ${minutes}m ${seconds.toString().padLeft(2, '0')}s'
              : 'Code expired — go back to generate a new one.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: expiringSoon ? context.scheme.error : null,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        GradientButton(label: 'Continue', onPressed: onContinue),
      ],
    );
  }
}

class _CopyableField extends StatelessWidget {
  const _CopyableField({
    required this.label,
    required this.value,
    required this.icon,
    required this.onCopy,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.space16,
        vertical: AppSpacing.space12,
      ),
      child: Row(
        children: [
          Icon(icon, color: context.scheme.primary, size: 20),
          const SizedBox(width: AppSpacing.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.labelSmall),
                SelectableText(
                  value,
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy_rounded),
            tooltip: 'Copy',
            onPressed: onCopy,
          ),
        ],
      ),
    );
  }
}

class _InstructionsStep extends StatelessWidget {
  const _InstructionsStep({required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    const steps = [
      'Open the network or Wi-Fi settings on the device (or your router, to cover every device on the network at once).',
      'Find the DNS settings — usually under "Advanced" or "Network configuration".',
      'Replace the automatic/ISP DNS with the DNS Server shown on the previous step.',
      'Save the settings. Some devices reconnect to Wi-Fi automatically to apply it.',
      'Come back here and run the connection test — pairing finishes automatically, no code to re-enter.',
    ];

    return _WizardPage(
      children: [
        Text('Setup Instructions', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: AppSpacing.space8),
        Text(
          'These steps work for consoles, smart TVs, streaming boxes, and routers alike.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.lg),
        ...steps.asMap().entries.map(
          (entry) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: GlassCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: context.colors.brandGradient,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '${entry.key + 1}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.space12),
                  Expanded(
                    child: Text(entry.value, style: Theme.of(context).textTheme.bodyMedium),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        GradientButton(label: "I've Configured DNS", onPressed: onContinue),
      ],
    );
  }
}

class _TestConnectionStep extends StatelessWidget {
  const _TestConnectionStep({
    required this.phase,
    required this.message,
    required this.onTest,
    required this.onBackToInstructions,
    required this.onRestartPairing,
  });

  final _TestPhase phase;
  final String? message;
  final VoidCallback onTest;
  final VoidCallback onBackToInstructions;
  final VoidCallback onRestartPairing;

  bool get _busy =>
      phase == _TestPhase.sendingProbe || phase == _TestPhase.waitingForConfirmation;

  @override
  Widget build(BuildContext context) {
    return _WizardPage(
      children: [
        const SizedBox(height: AppSpacing.space24),
        Text(
          'Test DNS Connection',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: AppSpacing.space8),
        Text(
          'Tap below once the device is using the new DNS settings.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: AppSpacing.space40),
        Center(
          child: GestureDetector(
            onTap: _busy ? null : onTest,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: phase == _TestPhase.success
                    ? LinearGradient(colors: [context.colors.success, context.colors.success])
                    : context.colors.brandGradient,
                boxShadow: [
                  BoxShadow(
                    color: context.colors.ambientShadow,
                    blurRadius: 30,
                    spreadRadius: 4,
                  ),
                ],
              ),
              child: Icon(
                phase == _TestPhase.success ? Icons.check_rounded : Icons.wifi_tethering_rounded,
                color: Colors.white,
                size: 64,
              ),
            ).animate(target: _busy ? 1 : 0).scaleXY(
              begin: 1,
              end: 1.08,
              duration: 700.ms,
              curve: Curves.easeInOut,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.space24),
        if (message != null)
          Text(
            message!,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: phase == _TestPhase.error || phase == _TestPhase.timedOut
                  ? context.scheme.error
                  : null,
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        if (phase == _TestPhase.idle || phase == _TestPhase.error || phase == _TestPhase.timedOut)
          GradientButton(label: 'Test DNS Connection', onPressed: onTest),
        if (phase == _TestPhase.timedOut) ...[
          const SizedBox(height: AppSpacing.md),
          SecondaryGlassButton(label: 'Review Instructions', onPressed: onBackToInstructions),
        ],
        if (phase == _TestPhase.error) ...[
          const SizedBox(height: AppSpacing.md),
          SecondaryGlassButton(label: 'Generate New Code', onPressed: onRestartPairing),
        ],
      ],
    );
  }
}

class _SuccessStep extends StatelessWidget {
  const _SuccessStep({
    required this.deviceName,
    required this.status,
    required this.onFinish,
  });

  final String deviceName;
  final PairingStatus? status;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return _WizardPage(
      children: [
        const SizedBox(height: AppSpacing.space32),
        Center(
          child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(color: context.colors.success, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, color: Colors.white, size: 56),
              )
              .animate()
              .scale(duration: 450.ms, curve: Curves.elasticOut)
              .fadeIn(duration: 250.ms),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          '$deviceName is protected',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: AppSpacing.space8),
        Text(
          'Pairing finished automatically. GuardTime will keep tracking this device even if the '
          "network's public IP changes later — no reconfiguration needed.",
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        if (status?.publicIp != null) ...[
          const SizedBox(height: AppSpacing.lg),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SummaryRow(label: 'Public IP', value: status!.publicIp!),
                if (status?.resolverRegion != null)
                  _SummaryRow(label: 'Resolver', value: status!.resolverRegion!),
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.space32),
        GradientButton(label: 'Done', onPressed: onFinish),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          Text(value, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}
