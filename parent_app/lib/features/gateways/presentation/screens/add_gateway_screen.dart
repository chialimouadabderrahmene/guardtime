import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/section_header.dart';

import 'package:parent_app/features/router_integration/domain/gateway_model.dart';

import '../../data/gateway_repository.dart';

/// Entry point of Gateway setup. Router Plugin (an existing router's own
/// management API does the enforcement) is the primary, recommended path —
/// no extra hardware, no separate agent host to maintain. Software Gateway
/// is a secondary, clearly-labeled Advanced/Experimental option for setups
/// with no router that exposes a supported management API.
class AddGatewayScreen extends ConsumerStatefulWidget {
  const AddGatewayScreen({super.key});

  @override
  ConsumerState<AddGatewayScreen> createState() => _AddGatewayScreenState();
}

class _AddGatewayScreenState extends ConsumerState<AddGatewayScreen> {
  bool _creatingRouterGateway = false;

  Future<void> _connectRouter() async {
    final name = await _promptForName(
      title: 'Name this gateway',
      initialValue: 'Home Router',
    );
    if (name == null || name.trim().isEmpty) return;

    setState(() => _creatingRouterGateway = true);
    try {
      final result = await ref.read(gatewayRepositoryProvider).register(
        name: name.trim(),
        gatewayType: GatewayType.routerPlugin,
      );
      if (!mounted) return;
      // Router Wizard already exists and owns vendor detection/credentials/
      // testing — reuse it rather than duplicating that flow here.
      context.push('/routers/${result.id}/wizard');
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _creatingRouterGateway = false);
    }
  }

  Future<String?> _promptForName({required String title, required String initialValue}) {
    final controller = TextEditingController(text: initialValue);
    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Gateway name'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Add Gateway', showBack: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.space12, AppSpacing.page, 48),
        children: [
          const SectionHeader(
            title: 'How should GuardTime connect?',
            uppercaseEyebrow: 'Add Gateway',
          ),
          const SizedBox(height: AppSpacing.md),
          _GatewayChoiceCard(
            icon: Icons.router_rounded,
            title: 'Connect Existing Router',
            recommended: true,
            description:
                'GuardTime talks to your router\'s own management features to enforce protection — no extra hardware, nothing else to keep running.',
            busy: _creatingRouterGateway,
            onTap: _creatingRouterGateway ? null : _connectRouter,
            primaryColor: context.colors.success,
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: Divider(color: context.colors.glassBorder)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.space12),
                child: Text('ADVANCED', style: Theme.of(context).textTheme.labelSmall?.copyWith(letterSpacing: 1.2)),
              ),
              Expanded(child: Divider(color: context.colors.glassBorder)),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          _GatewayChoiceCard(
            icon: Icons.dns_rounded,
            title: 'Software Gateway',
            experimental: true,
            description:
                'Install the GuardTime agent on a spare PC, mini PC, or server on your home network — it enforces protection directly, without needing your router\'s support. Experimental; the Router option above is recommended for most homes.',
            onTap: () => context.push('/gateways/add/software'),
            primaryColor: context.colors.warning,
          ),
        ],
      ),
    );
  }
}

class _GatewayChoiceCard extends StatelessWidget {
  const _GatewayChoiceCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.primaryColor,
    this.recommended = false,
    this.experimental = false,
    this.busy = false,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String description;
  final Color primaryColor;
  final bool recommended;
  final bool experimental;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GlassCard(
      onTap: onTap,
      border: recommended,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: primaryColor.withValues(alpha: 0.14), shape: BoxShape.circle),
                child: Icon(icon, color: primaryColor),
              ),
              const SizedBox(width: AppSpacing.space12),
              Expanded(
                child: Text(title, style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
              ),
              if (busy)
                const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(Icons.chevron_right_rounded, color: context.scheme.onSurfaceVariant),
            ],
          ),
          const SizedBox(height: AppSpacing.space12),
          Text(description, style: textTheme.bodyMedium?.copyWith(color: context.scheme.onSurfaceVariant)),
          const SizedBox(height: AppSpacing.space12),
          if (recommended)
            _Tag(label: 'RECOMMENDED', color: context.colors.success)
          else if (experimental)
            _Tag(label: 'EXPERIMENTAL', color: context.colors.warning),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700, letterSpacing: 0.6),
      ),
    );
  }
}
