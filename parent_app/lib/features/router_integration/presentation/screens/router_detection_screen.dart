import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import 'package:parent_app/features/gateways/data/gateway_repository.dart';

import '../../data/router_repository.dart';
import '../../domain/gateway_model.dart';
import '../providers/router_providers.dart';

/// Gateway Dashboard — every gateway the parent owns, of either type
/// (Router Plugin or Software Agent), each showing real, currently-tracked
/// status rather than router-only detection info the way this screen
/// originally did.
class RouterDetectionScreen extends ConsumerWidget {
  const RouterDetectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final gatewaysAsync = ref.watch(gatewaysListProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Gateways', showBack: true),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/gateways/add'),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Gateway'),
      ),
      child: gatewaysAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 2),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(gatewaysListProvider),
        ),
        data: (gateways) {
          if (gateways.isEmpty) {
            return const _NoGatewayEmptyState();
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(gatewaysListProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space12,
                AppSpacing.page,
                96,
              ),
              children: [
                const SectionHeader(
                  title: 'Your Gateways',
                  uppercaseEyebrow: 'Enforcement Engine',
                ),
                const SizedBox(height: AppSpacing.md),
                ...gateways.map(
                  (gateway) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: _GatewayCard(gateway: gateway),
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

String _formatLastSeen(DateTime? lastSeen) {
  if (lastSeen == null) return 'Never connected';
  final diff = DateTime.now().difference(lastSeen);
  if (diff.inSeconds < 60) return 'Just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

class _GatewayCard extends ConsumerWidget {
  const _GatewayCard({required this.gateway});

  final GatewayModel gateway;

  Future<void> _manage(BuildContext context, WidgetRef ref) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_rounded),
              title: const Text('Rename'),
              onTap: () => Navigator.of(context).pop('rename'),
            ),
            if (gateway.gatewayType == GatewayType.routerPlugin)
              ListTile(
                leading: const Icon(Icons.wifi_tethering_rounded),
                title: const Text('Reconnect / Re-test'),
                onTap: () => Navigator.of(context).pop('reconnect'),
              ),
            ListTile(
              leading: const Icon(Icons.key_rounded),
              title: const Text('Rotate Token'),
              subtitle: const Text('Issues a new token; the old one keeps working for 24h'),
              onTap: () => Navigator.of(context).pop('rotate'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline_rounded, color: Theme.of(context).colorScheme.error),
              title: Text('Delete', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              onTap: () => Navigator.of(context).pop('delete'),
            ),
          ],
        ),
      ),
    );

    if (!context.mounted || action == null) return;

    switch (action) {
      case 'rename':
        await _rename(context, ref);
      case 'reconnect':
        await _reconnect(context, ref);
      case 'rotate':
        await _rotate(context, ref);
      case 'delete':
        await _delete(context, ref);
    }
  }

  Future<void> _rename(BuildContext context, WidgetRef ref) async {
    final controller = TextEditingController(text: gateway.name);
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rename gateway'),
        content: TextField(controller: controller, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(controller.text), child: const Text('Save')),
        ],
      ),
    );
    if (name == null || name.trim().isEmpty || !context.mounted) return;

    try {
      await ref.read(gatewayRepositoryProvider).rename(gateway.id, name: name.trim());
      ref.invalidate(gatewaysListProvider);
      if (context.mounted) showAppSnackbar(context, 'Gateway renamed.', type: SnackbarType.success);
    } catch (error) {
      if (context.mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    }
  }

  Future<void> _reconnect(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(routerRepositoryProvider).testConnection(gateway.id);
      ref.invalidate(gatewaysListProvider);
      if (context.mounted) showAppSnackbar(context, 'Connection test requested — check Diagnostics for the result.', type: SnackbarType.success);
    } catch (error) {
      if (context.mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    }
  }

  Future<void> _rotate(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rotate token?'),
        content: const Text('The old token keeps working for 24 hours so an already-running agent isn\'t locked out — update it with the new one before then.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Rotate')),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      final token = await ref.read(gatewayRepositoryProvider).rotateToken(gateway.id);
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('New token'),
          content: SelectableText(token, style: const TextStyle(fontFamily: 'monospace')),
          actions: [
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
          ],
        ),
      );
    } catch (error) {
      if (context.mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete "${gateway.name}"?'),
        content: const Text('This gateway will stop enforcing protection. Devices it discovered are kept and stay independently DNS-protected.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(gatewayRepositoryProvider).delete(gateway.id);
      ref.invalidate(gatewaysListProvider);
      if (context.mounted) showAppSnackbar(context, 'Gateway deleted.', type: SnackbarType.success);
    } catch (error) {
      if (context.mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final textTheme = Theme.of(context).textTheme;
    final isRouterPlugin = gateway.gatewayType == GatewayType.routerPlugin;
    final router = gateway.detectedRouter;

    final typeLabel = isRouterPlugin
        ? (router?.vendor != null ? 'Router Plugin · ${router!.vendor}' : 'Router Plugin · not detected yet')
        : 'Software Agent · Experimental';

    return GlassCard(
      onTap: () => context.push('/routers/${gateway.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isRouterPlugin ? Icons.router_rounded : Icons.dns_rounded, color: context.scheme.primary),
              const SizedBox(width: AppSpacing.space12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(gateway.name, style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    Text(typeLabel, style: textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              StatusBadge(
                label: gateway.online ? 'Online' : 'Offline',
                color: gateway.online ? context.colors.success : Colors.grey,
                icon: gateway.online ? Icons.wifi_rounded : Icons.wifi_off_rounded,
              ),
              IconButton(
                onPressed: () => _manage(context, ref),
                icon: const Icon(Icons.more_vert_rounded),
                tooltip: 'Manage',
              ),
            ],
          ),
          const Divider(height: AppSpacing.lg),
          Wrap(
            spacing: AppSpacing.lg,
            runSpacing: AppSpacing.space8,
            children: [
              _StatChip(icon: Icons.devices_rounded, label: '${gateway.deviceCount} device${gateway.deviceCount == 1 ? '' : 's'}'),
              _StatChip(icon: Icons.schedule_rounded, label: _formatLastSeen(gateway.lastSeen)),
              if (gateway.agentVersion != null) _StatChip(icon: Icons.memory_rounded, label: 'v${gateway.agentVersion}'),
              if (gateway.vpnDetectionCount24h > 0)
                _StatChip(icon: Icons.vpn_key_rounded, label: '${gateway.vpnDetectionCount24h} VPN (24h)', color: context.colors.warning),
              if (gateway.dohDetectionCount24h > 0)
                _StatChip(icon: Icons.dns_rounded, label: '${gateway.dohDetectionCount24h} DoH (24h)', color: context.colors.warning),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? context.scheme.onSurfaceVariant;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: effectiveColor),
        const SizedBox(width: 4),
        Text(label, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: effectiveColor)),
      ],
    );
  }
}

class _NoGatewayEmptyState extends StatelessWidget {
  const _NoGatewayEmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.page),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const EmptyStateView(
            icon: Icons.router_outlined,
            title: 'No gateway yet',
            message:
                'Add a gateway to unlock router-level protection — connect your existing router (recommended) or set up a Software Gateway.',
          ),
          const SizedBox(height: AppSpacing.lg),
          FilledButton.icon(
            onPressed: () => context.push('/gateways/add'),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Add Gateway'),
          ),
        ],
      ),
    );
  }
}
