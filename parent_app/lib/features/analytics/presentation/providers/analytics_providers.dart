import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/analytics/data/analytics_repository.dart';
import 'package:parent_app/features/analytics/domain/report_models.dart';
import 'package:parent_app/features/analytics/domain/usage_models.dart';

/// Identifies a report request: period ('weekly'/'monthly') + optional child.
typedef ReportQuery = ({String period, String? childId});

final reportProvider = FutureProvider.family<PeriodReport, ReportQuery>((
  ref,
  query,
) async {
  return ref
      .read(analyticsRepositoryProvider)
      .fetchReport(period: query.period, childId: query.childId);
});

final dailyUsageProvider = FutureProvider.family<UsageSummary, String>((
  ref,
  childId,
) async {
  return ref.read(analyticsRepositoryProvider).fetchDailyUsage(childId);
});

final weeklyUsageProvider = FutureProvider.family<UsageSummary, String>((
  ref,
  childId,
) async {
  return ref.read(analyticsRepositoryProvider).fetchWeeklyUsage(childId);
});

final deviceUsageProvider = FutureProvider.family<UsageSummary, String>((
  ref,
  deviceId,
) async {
  return ref.read(analyticsRepositoryProvider).fetchDeviceUsage(deviceId);
});
