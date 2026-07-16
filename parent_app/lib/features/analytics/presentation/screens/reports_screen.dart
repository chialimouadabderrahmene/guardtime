import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
import 'package:parent_app/core/widgets/metric_tile.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/core/widgets/usage_bar.dart';
import 'package:parent_app/features/analytics/domain/report_models.dart';
import 'package:parent_app/features/analytics/presentation/providers/analytics_providers.dart';

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _period = 'weekly';

  @override
  Widget build(BuildContext context) {
    final query = (period: _period, childId: null);
    final reportAsync = ref.watch(reportProvider(query));

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Reports', showBack: true),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              AppSpacing.space8,
            ),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'weekly', label: Text('This week'), icon: Icon(Icons.calendar_view_week_rounded)),
                ButtonSegment(value: 'monthly', label: Text('This month'), icon: Icon(Icons.calendar_month_rounded)),
              ],
              selected: {_period},
              onSelectionChanged: (s) => setState(() => _period = s.first),
            ),
          ),
          Expanded(
            child: reportAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.page),
                child: ShimmerCardList(itemCount: 4),
              ),
              error: (error, _) => ErrorStateView(
                message: error.toString(),
                onRetry: () => ref.invalidate(reportProvider(query)),
              ),
              data: (report) => RefreshIndicator(
                onRefresh: () async => ref.invalidate(reportProvider(query)),
                child: _ReportBody(report: report),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReportBody extends StatelessWidget {
  const _ReportBody({required this.report});

  final PeriodReport report;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;

    if (report.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.page),
        children: [
          Text(
            report.label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.md),
          const EmptyStateView(
            icon: Icons.insights_rounded,
            title: 'No activity yet',
            message:
                'Once sessions run and devices report usage, this report fills in automatically.',
          ),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.page,
        AppSpacing.space4,
        AppSpacing.page,
        48,
      ),
      children: [
        Text(
          report.label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppSpacing.md),
        MetricTileRow(
          tiles: [
            MetricTile(
              icon: Icons.timelapse_rounded,
              value: _fmt(report.screenMinutes),
              label: 'Screen time',
            ),
            MetricTile(
              icon: Icons.play_circle_outline_rounded,
              value: '${report.sessionsCount}',
              label: 'Sessions',
            ),
            MetricTile(
              icon: Icons.sports_esports_rounded,
              value: _fmt(report.gamingMinutes),
              label: 'Gaming',
              accent: context.colors.warning,
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
        const SectionHeader(title: 'Daily activity'),
        const SizedBox(height: AppSpacing.md),
        GlassCard(child: _DailyBars(values: report.dailyMinutes, weekly: report.period == 'week')),
        if (report.topApps.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          const SectionHeader(title: 'Top apps'),
          const SizedBox(height: AppSpacing.md),
          GlassCard(
            child: Column(
              children: [
                for (final app in report.topApps)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.space12),
                    child: UsageBar(
                      label: app.name,
                      value: app.minutes,
                      maxValue: report.topApps.first.minutes == 0 ? 1 : report.topApps.first.minutes,
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (report.byChild.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          const SectionHeader(title: 'By child'),
          const SizedBox(height: AppSpacing.md),
          ...report.byChild.map(
            (child) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: GlassCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.space16,
                  vertical: AppSpacing.space4,
                ),
                child: AppListTile(
                  title: child.name,
                  subtitle: '${_fmt(child.screenMinutes)} • ${child.sessions} session${child.sessions == 1 ? '' : 's'}',
                  leading: Icons.face_rounded,
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        const SectionHeader(title: 'Device activity'),
        const SizedBox(height: AppSpacing.md),
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${report.protectedDevices} of ${report.totalDevices} device${report.totalDevices == 1 ? '' : 's'} verified protected',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.space10),
              for (final device in report.devices)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.space6),
                  child: Row(
                    children: [
                      Icon(deviceIcon(device.type), size: 18, color: deviceAccent(device.type)),
                      const SizedBox(width: AppSpacing.space10),
                      Expanded(
                        child: Text(
                          device.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                      Icon(
                        device.isProtected ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded,
                        size: 18,
                        color: device.isProtected ? context.colors.success : scheme.outline,
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DailyBars extends StatelessWidget {
  const _DailyBars({required this.values, required this.weekly});

  final List<int> values;
  final bool weekly;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final maxVal = values.fold<int>(0, (m, v) => v > m ? v : m);
    final safeMax = maxVal == 0 ? 1 : maxVal;

    return SizedBox(
      height: 120,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < values.length; i++)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Container(
                      height: (values[i] / safeMax) * 92 + 2,
                      decoration: BoxDecoration(
                        color: values[i] == 0
                            ? scheme.surfaceContainerHighest
                            : scheme.primary,
                        borderRadius: BorderRadius.circular(AppRadius.xs),
                      ),
                    ),
                    if (weekly && i < values.length) ...[
                      const SizedBox(height: 4),
                      Text(
                        _weekdayInitial(i, values.length),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Bars are ordered oldest→newest ending today; label the last as "today".
  String _weekdayInitial(int index, int length) {
    final now = DateTime.now();
    final day = now.subtract(Duration(days: length - 1 - index));
    const initials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return initials[(day.weekday - 1) % 7];
  }
}

String _fmt(int minutes) {
  if (minutes <= 0) return '0m';
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '${m}m';
  return m == 0 ? '${h}h' : '${h}h ${m}m';
}
