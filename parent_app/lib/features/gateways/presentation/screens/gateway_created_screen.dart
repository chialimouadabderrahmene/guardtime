import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import 'package:parent_app/features/router_integration/presentation/providers/router_providers.dart';

import '../../domain/gateway_registration_result.dart';

/// The ONE screen where the gateway token is ever visible — it arrives via
/// route `extra` (never re-fetched: GET /gateway deliberately omits the
/// token field) and is held only in this widget's memory, never written to
/// storage. Once the parent leaves this screen there is no way to see this
/// token again short of Rotate Token, which issues a new one through this
/// exact same one-time-reveal flow.
class GatewayCreatedScreen extends ConsumerStatefulWidget {
  const GatewayCreatedScreen({super.key, required this.result});

  final GatewayRegistrationResult result;

  @override
  ConsumerState<GatewayCreatedScreen> createState() => _GatewayCreatedScreenState();
}

class _GatewayCreatedScreenState extends ConsumerState<GatewayCreatedScreen> {
  Timer? _pollTimer;
  bool _connected = false;

  String get _configJson => jsonEncode({
    'gatewayId': widget.result.id,
    'token': widget.result.token,
    'backendUrl': AppConfig.apiBaseUrl,
    'gatewayType': widget.result.gatewayType.toJson(),
  });

  String get _envSnippet => 'BACKEND_URL=${AppConfig.apiBaseUrl}\nGATEWAY_TOKEN=${widget.result.token}';

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) => _checkConnection());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkConnection() async {
    if (!mounted || _connected) return;
    ref.invalidate(gatewaysListProvider);
    final gateways = await ref.read(gatewaysListProvider.future);
    var isOnline = false;
    for (final gateway in gateways) {
      if (gateway.id == widget.result.id) {
        isOnline = gateway.online;
        break;
      }
    }
    if (isOnline && mounted) {
      setState(() => _connected = true);
      _pollTimer?.cancel();
    }
  }

  void _copy(String value, String label) {
    Clipboard.setData(ClipboardData(text: value));
    showAppSnackbar(context, '$label copied to clipboard.', type: SnackbarType.success);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textTheme = Theme.of(context).textTheme;

    return PopScope(
      canPop: false,
      child: GuardTimeScaffold(
        appBar: const GuardTimeBrandAppBar(title: 'Gateway Created'),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.space12, AppSpacing.page, 48),
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.check_circle_rounded, color: colors.success, size: 32),
                      const SizedBox(width: AppSpacing.space12),
                      Expanded(
                        child: Text(
                          'Gateway Created Successfully',
                          style: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.space8),
                  Text('"${widget.result.name}" is ready. Install the Enforcement Engine to bring it online.', style: textTheme.bodyMedium),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            const SectionHeader(title: 'Install Enforcement Engine'),
            const SizedBox(height: AppSpacing.md),
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scan this QR code from the machine running the Enforcement Engine, or copy the config below. You will not be able to see this token again — if you lose it, use Rotate Token from the gateway\'s Manage menu.',
                    style: textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Center(
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(AppRadius.lg)),
                      child: QrImageView(data: _configJson, size: 180, backgroundColor: Colors.white),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _CopyableBlock(label: '.env configuration', value: _envSnippet, onCopy: () => _copy(_envSnippet, 'Configuration'), monospace: true),
                  const SizedBox(height: AppSpacing.md),
                  OutlinedButton.icon(
                    onPressed: () => _copy(widget.result.token, 'Token'),
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: const Text('Copy Token Only'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            _InstallInstructions(),
            const SizedBox(height: AppSpacing.lg),
            GlassCard(
              child: Row(
                children: [
                  if (_connected) ...[
                    Icon(Icons.wifi_rounded, color: colors.success),
                    const SizedBox(width: AppSpacing.space12),
                    Expanded(
                      child: Text('Gateway Connected', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700, color: colors.success)),
                    ),
                  ] else ...[
                    const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                    const SizedBox(width: AppSpacing.space12),
                    Expanded(child: Text('Waiting for the Enforcement Engine to connect…', style: textTheme.bodyMedium)),
                    const StatusBadge(label: 'Offline', color: Colors.grey, icon: Icons.wifi_off_rounded),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => context.go('/routers'),
                child: Text(_connected ? 'Done' : 'Continue to Dashboard'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CopyableBlock extends StatelessWidget {
  const _CopyableBlock({required this.label, required this.value, required this.onCopy, this.monospace = false});

  final String label;
  final String value;
  final VoidCallback onCopy;
  final bool monospace;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: Theme.of(context).textTheme.labelMedium),
            IconButton(
              onPressed: onCopy,
              icon: const Icon(Icons.copy_rounded, size: 18),
              tooltip: 'Copy',
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(color: scheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(AppRadius.md)),
          child: SelectableText(
            value,
            style: monospace ? const TextStyle(fontFamily: 'monospace', fontSize: 13) : Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _InstallInstructions extends StatefulWidget {
  @override
  State<_InstallInstructions> createState() => _InstallInstructionsState();
}

class _InstallInstructionsState extends State<_InstallInstructions> {
  int _selected = 0;

  static const _tabs = ['Linux', 'Docker', 'Windows / macOS'];

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Run the Enforcement Engine', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<int>(
            segments: List.generate(_tabs.length, (i) => ButtonSegment(value: i, label: Text(_tabs[i]))),
            selected: {_selected},
            onSelectionChanged: (value) => setState(() => _selected = value.first),
          ),
          const SizedBox(height: AppSpacing.md),
          switch (_selected) {
            0 => const _CodeBlock(
                'git clone https://github.com/chialimouadabderrahmene/guardtime.git\n'
                'cd guardtime/gateway-agent\n'
                'npm ci --omit=dev\n'
                'cp .env.example .env   # then paste the config above into .env\n'
                'npm start',
              ),
            1 => const _CodeBlock(
                'cd gateway-agent\n'
                'docker build -t guardtime-gateway-agent .\n'
                'docker run -d --name guardtime-gateway \\\n'
                '  --network host --cap-add=NET_ADMIN --cap-add=NET_RAW \\\n'
                '  -e BACKEND_URL=... -e GATEWAY_TOKEN=... \\\n'
                '  guardtime-gateway-agent',
              ),
            _ => const _CodeBlock(
                'GuardTime\'s enforcement layer (firewall rules) runs on Linux.\n'
                'On Windows or macOS: install Docker Desktop, then run the\n'
                'Docker command from the Docker tab inside its Linux VM.\n'
                'Note: host networking is only fully supported on native Linux —\n'
                'a Linux mini PC or VM gives the most reliable enforcement.',
              ),
          },
        ],
      ),
    );
  }
}

class _CodeBlock extends StatelessWidget {
  const _CodeBlock(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: context.scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: SelectableText(text, style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5, height: 1.5)),
    );
  }
}
