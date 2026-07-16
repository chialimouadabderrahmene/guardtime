import 'package:parent_app/features/analytics/domain/usage_models.dart';
import 'package:parent_app/features/children/domain/child_model.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/features/sessions/domain/session_model.dart';
import 'package:parent_app/features/settings/domain/parent_profile.dart';

class DashboardBundle {
  const DashboardBundle({
    required this.profile,
    required this.children,
    required this.devices,
    required this.activeSessions,
    required this.dailyUsage,
  });

  final ParentProfile profile;
  final List<ChildModel> children;
  final List<DeviceModel> devices;
  final List<SessionModel> activeSessions;
  final Map<String, UsageSummary> dailyUsage;

  int get totalMinutesToday {
    return dailyUsage.values.fold(0, (sum, item) => sum + item.totalMinutes);
  }
}
