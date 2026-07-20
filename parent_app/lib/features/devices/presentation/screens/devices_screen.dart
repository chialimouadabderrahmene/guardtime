import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_list_tile.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart' show ShimmerCardList;
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key});

  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

/// `devicesListProvider` is a plain (non-autoDispose) FutureProvider, and
/// this screen lives inside a `StatefulShellRoute.indexedStack` branch, so
/// switching tabs never disposes or re-fetches it — the list can go stale
/// indefinitely with only pull-to-refresh as an escape hatch. A periodic
/// background refresh (silent — `ref.invalidate` doesn't flip the provider
/// back to a loading state for existing subscribers with cached data) plus
/// a refresh on app foreground keeps it honestly current without user action.
class _DevicesScreenState extends ConsumerState<DevicesScreen>
    with WidgetsBindingObserver {
  Timer? _refreshTimer;
  static const _refreshInterval = Duration(seconds: 20);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshTimer = Timer.periodic(
      _refreshInterval,
      (_) => ref.invalidate(devicesListProvider),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(devicesListProvider);
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final devicesAsync = ref.watch(devicesListProvider);
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: GuardTimeBrandAppBar(
        actions: [
          IconButton(
            onPressed: () => context.push('/routers'),
            icon: const Icon(Icons.router_outlined),
            tooltip: 'Router Integration',
          ),
          IconButton(
            onPressed: () => context.push('/guides'),
            icon: const Icon(Icons.library_books_outlined),
          ),
          IconButton(
            onPressed: () => context.push('/devices/add'),
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
      child: devicesAsync.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(AppSpacing.page),
          child: ShimmerCardList(itemCount: 4),
        ),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(devicesListProvider),
        ),
        data: (devices) {
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(devicesListProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.page,
                AppSpacing.space12,
                AppSpacing.page,
                120,
              ),
              children: [
                GlassCard(
                  child: Column(
                    children: [
                      const SizedBox(height: AppSpacing.space4),
                      const _PulseIcon(),
                      const SizedBox(height: AppSpacing.space16),
                      Text(
                        'Scanning Network',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: AppSpacing.space8),
                      Text(
                        'Searching for unprotected devices on your home Wi‑Fi and surfacing DNS health.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                          height: 1.45,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                SectionHeader(
                  title: 'Detected Devices',
                  actionLabel: '${devices.length} found',
                  onAction: () {},
                ),
                const SizedBox(height: AppSpacing.md),
                if (devices.isEmpty)
                  EmptyStateView(
                    icon: Icons.router_rounded,
                    title: 'No devices found',
                    message:
                        'Add a console, TV, phone, or tablet manually so you can connect DNS protection and gaming controls.',
                    actionLabel: 'Add Device',
                    onAction: () => context.push('/devices/add'),
                  )
                else
                  ...devices.map(
                    (device) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: GlassCard(
                        onTap: () => context.push('/devices/${device.id}'),
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.space16,
                          vertical: AppSpacing.space4,
                        ),
                        child: AppListTile(
                          title: device.name,
                          subtitle:
                              '${deviceLabel(device.type)}${device.ipAddress != null ? ' • ${device.ipAddress}' : ''}',
                          leading: deviceIcon(device.type),
                          leadingColor: deviceAccent(device.type),
                          onTap: () => context.push('/devices/${device.id}'),
                          trailing: OutlinedButton(
                            onPressed: () => context.push('/devices/${device.id}'),
                            child: Text(device.dnsConnected ? 'Open' : 'Setup'),
                          ),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: AppSpacing.md),
                OutlinedButton.icon(
                  onPressed: () => context.push('/devices/add'),
                  icon: const Icon(Icons.add_circle_outline_rounded),
                  label: const Text('Add Device Manually'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _PulseIcon extends StatelessWidget {
  const _PulseIcon();

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return SizedBox(
      width: 124,
      height: 124,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.primary.withValues(alpha: 0.04),
            ),
          ),
          Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.primary.withValues(alpha: 0.08),
            ),
          ),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: scheme.primary.withValues(alpha: 0.14),
            ),
            child: Icon(Icons.router_rounded, color: scheme.primary),
          ),
        ],
      ),
    );
  }
}
