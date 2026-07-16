import 'package:parent_app/core/utils/model_utils.dart';

class ReportTopApp {
  const ReportTopApp({required this.name, required this.minutes});

  final String name;
  final int minutes;

  factory ReportTopApp.fromJson(Map<String, dynamic> json) => ReportTopApp(
    name: json['name'] as String? ?? 'Unknown',
    minutes: json['minutes'] as int? ?? 0,
  );
}

class ReportChildBreakdown {
  const ReportChildBreakdown({
    required this.childId,
    required this.name,
    required this.screenMinutes,
    required this.sessions,
  });

  final String childId;
  final String name;
  final int screenMinutes;
  final int sessions;

  factory ReportChildBreakdown.fromJson(Map<String, dynamic> json) =>
      ReportChildBreakdown(
        childId: json['childId'] as String? ?? '',
        name: json['name'] as String? ?? 'Child',
        screenMinutes: json['screenMinutes'] as int? ?? 0,
        sessions: json['sessions'] as int? ?? 0,
      );
}

class ReportDeviceActivity {
  const ReportDeviceActivity({
    required this.deviceId,
    required this.name,
    required this.type,
    required this.isProtected,
  });

  final String deviceId;
  final String name;
  final String type;
  final bool isProtected;

  factory ReportDeviceActivity.fromJson(Map<String, dynamic> json) =>
      ReportDeviceActivity(
        deviceId: json['deviceId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? 'OTHER',
        isProtected: json['protected'] as bool? ?? false,
      );
}

class PeriodReport {
  const PeriodReport({
    required this.period,
    required this.label,
    required this.sessionsCount,
    required this.screenMinutes,
    required this.trackedMinutes,
    required this.gamingMinutes,
    required this.dailyMinutes,
    required this.topApps,
    required this.byChild,
    required this.devices,
    required this.protectedDevices,
    required this.totalDevices,
    required this.generatedAt,
  });

  final String period;
  final String label;
  final int sessionsCount;
  final int screenMinutes;
  final int trackedMinutes;
  final int gamingMinutes;
  final List<int> dailyMinutes;
  final List<ReportTopApp> topApps;
  final List<ReportChildBreakdown> byChild;
  final List<ReportDeviceActivity> devices;
  final int protectedDevices;
  final int totalDevices;
  final DateTime? generatedAt;

  bool get isEmpty =>
      sessionsCount == 0 && trackedMinutes == 0 && screenMinutes == 0;

  factory PeriodReport.fromJson(Map<String, dynamic> json) {
    return PeriodReport(
      period: json['period'] as String? ?? 'week',
      label: json['label'] as String? ?? '',
      sessionsCount: json['sessionsCount'] as int? ?? 0,
      screenMinutes: json['screenMinutes'] as int? ?? 0,
      trackedMinutes: json['trackedMinutes'] as int? ?? 0,
      gamingMinutes: json['gamingMinutes'] as int? ?? 0,
      dailyMinutes: (json['dailyMinutes'] as List<dynamic>? ?? const [])
          .map((v) => (v as num?)?.toInt() ?? 0)
          .toList(),
      topApps: (json['topApps'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReportTopApp.fromJson)
          .toList(),
      byChild: (json['byChild'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReportChildBreakdown.fromJson)
          .toList(),
      devices: (json['devices'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ReportDeviceActivity.fromJson)
          .toList(),
      protectedDevices: json['protectedDevices'] as int? ?? 0,
      totalDevices: json['totalDevices'] as int? ?? 0,
      generatedAt: parseDateTime(json['generatedAt']),
    );
  }
}
