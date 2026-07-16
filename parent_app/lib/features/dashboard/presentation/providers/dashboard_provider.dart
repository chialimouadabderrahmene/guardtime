import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/analytics/data/analytics_repository.dart';
import 'package:parent_app/features/analytics/domain/usage_models.dart';
import 'package:parent_app/features/children/data/children_repository.dart';
import 'package:parent_app/features/dashboard/domain/dashboard_bundle.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/sessions/data/sessions_repository.dart';
import 'package:parent_app/features/settings/data/settings_repository.dart';

final dashboardProvider = FutureProvider<DashboardBundle>((ref) async {
  final profile = await ref.read(settingsRepositoryProvider).fetchProfile();
  final children = await ref.read(childrenRepositoryProvider).fetchChildren();
  final devices = await ref.read(devicesRepositoryProvider).fetchDevices();
  final activeSessions = await ref
      .read(sessionsRepositoryProvider)
      .fetchActiveSessions();

  final analyticsRepo = ref.read(analyticsRepositoryProvider);
  final usageEntries = await Future.wait(
    children.map((child) async {
      final usage = await analyticsRepo.fetchDailyUsage(child.id);
      return MapEntry<String, UsageSummary>(child.id, usage);
    }),
  );

  return DashboardBundle(
    profile: profile,
    children: children,
    devices: devices,
    activeSessions: activeSessions,
    dailyUsage: Map<String, UsageSummary>.fromEntries(usageEntries),
  );
});
