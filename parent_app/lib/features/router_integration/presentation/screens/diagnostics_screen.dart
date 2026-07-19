import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/empty_state_view.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

import '../../data/router_repository.dart';
import '../../domain/router_command_model.dart';
import '../providers/router_providers.dart';

class DiagnosticsScreen extends ConsumerStatefulWidget {
  const DiagnosticsScreen({super.key, required this.gatewayId});

  final String gatewayId;

  @override
  ConsumerState<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _DiagnosticsScreenState extends ConsumerState<DiagnosticsScreen> {
  bool _testing = false;

  Future<void> _testConnection() async {
    setState(() => _testing = true);
    try {
      await ref.read(routerRepositoryProvider).testConnection(widget.gatewayId);
      if (mounted) {
        showAppSnackbar(context, 'Test requested — refresh in a few seconds for the result.', type: SnackbarType.success);
      }
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final diagnosticsAsync = ref.watch(routerDiagnosticsProvider(widget.gatewayId));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Diagnostics', showBack: true),
      child: diagnosticsAsync.when(
        loading: () => const LoadingStateView(message: 'Loading diagnostics…'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(routerDiagnosticsProvider(widget.gatewayId)),
        ),
        data: (diagnostics) {
          final router = diagnostics.router;
          final lastTestResult = router?['lastTestResult'] as bool?;
          final lastTestedAt = router?['lastTestedAt'] as String?;

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(routerDiagnosticsProvider(widget.gatewayId)),
            child: ListView(
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
                      Text('Connection Health', style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: AppSpacing.space12),
                      StatusBadge(
                        label: switch (lastTestResult) {
                          true => 'Last test succeeded',
                          false => 'Last test failed',
                          null => 'Never tested',
                        },
                        color: switch (lastTestResult) {
                          true => context.colors.success,
                          false => context.scheme.error,
                          null => Colors.grey,
                        },
                      ),
                      if (lastTestedAt != null) ...[
                        const SizedBox(height: AppSpacing.space8),
                        Text('Last tested: $lastTestedAt', style: Theme.of(context).textTheme.bodySmall),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      GradientButton(label: 'Test Connection', onPressed: _testConnection, isBusy: _testing),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(title: 'Recent Router Commands'),
                const SizedBox(height: AppSpacing.md),
                if (diagnostics.recentCommands.isEmpty)
                  const EmptyStateView(
                    icon: Icons.receipt_long_outlined,
                    title: 'No commands yet',
                    message: 'Actions like Instant Block, DNS changes, and MAC filtering will show up here once run.',
                  )
                else
                  ...diagnostics.recentCommands.map(
                    (command) => Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.md),
                      child: _CommandTile(command: command),
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

class _CommandTile extends StatelessWidget {
  const _CommandTile({required this.command});

  final RouterCommandModel command;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (color, icon) = switch (command.status) {
      'ACKNOWLEDGED' => (colors.success, Icons.check_circle_rounded),
      'FAILED' => (context.scheme.error, Icons.error_rounded),
      'DELIVERED' => (colors.warning, Icons.hourglass_top_rounded),
      _ => (Colors.grey, Icons.schedule_rounded),
    };

    return GlassCard(
      glass: false,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(command.type, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(
                  command.createdAt.toLocal().toString(),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
                ),
                if (command.resultData?['message'] != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    command.resultData!['message'].toString(),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          StatusBadge(label: command.status, color: color, icon: icon),
        ],
      ),
    );
  }
}
