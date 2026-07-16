import 'package:parent_app/core/utils/model_utils.dart';

class UsageSummary {
  const UsageSummary({
    required this.childId,
    required this.totalMinutes,
    required this.totalSeconds,
    required this.logCount,
    required this.bySegment,
    this.periodLabel,
    this.recentLogs = const [],
  });

  final String childId;
  final int totalMinutes;
  final int totalSeconds;
  final int logCount;
  final String? periodLabel;
  final Map<String, int> bySegment;
  final List<UsageLogItem> recentLogs;

  factory UsageSummary.fromDailyJson(Map<String, dynamic> json) {
    return UsageSummary(
      childId: json['childId'] as String? ?? '',
      totalMinutes: parseNullableInt(json['totalMinutes']) ?? 0,
      totalSeconds: parseNullableInt(json['totalSeconds']) ?? 0,
      logCount: parseNullableInt(json['logCount']) ?? 0,
      periodLabel: json['date'] as String?,
      bySegment: Map<String, int>.from(
        (json['byApp'] as Map<String, dynamic>? ?? const {}).map(
          (key, value) => MapEntry(key, parseNullableInt(value) ?? 0),
        ),
      ),
    );
  }

  factory UsageSummary.fromWeeklyJson(Map<String, dynamic> json) {
    return UsageSummary(
      childId: json['childId'] as String? ?? '',
      totalMinutes: parseNullableInt(json['totalMinutes']) ?? 0,
      totalSeconds: parseNullableInt(json['totalSeconds']) ?? 0,
      logCount: parseNullableInt(json['logCount']) ?? 0,
      periodLabel: json['weekStart'] as String?,
      bySegment: Map<String, int>.from(
        (json['byDay'] as Map<String, dynamic>? ?? const {}).map(
          (key, value) => MapEntry(key, parseNullableInt(value) ?? 0),
        ),
      ),
    );
  }

  factory UsageSummary.fromDeviceJson(Map<String, dynamic> json) {
    return UsageSummary(
      childId: json['deviceId'] as String? ?? '',
      totalMinutes: parseNullableInt(json['totalMinutes']) ?? 0,
      totalSeconds: parseNullableInt(json['totalSeconds']) ?? 0,
      logCount: (json['recentLogs'] as List<dynamic>? ?? const []).length,
      bySegment: const {},
      recentLogs: (json['recentLogs'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(UsageLogItem.fromJson)
          .toList(),
    );
  }
}

class UsageLogItem {
  const UsageLogItem({
    required this.id,
    required this.appName,
    required this.category,
    required this.durationSeconds,
    required this.loggedAt,
  });

  final String id;
  final String? appName;
  final String? category;
  final int durationSeconds;
  final DateTime? loggedAt;

  factory UsageLogItem.fromJson(Map<String, dynamic> json) {
    return UsageLogItem(
      id: json['id'] as String? ?? '',
      appName: json['appName'] as String?,
      category: json['category'] as String?,
      durationSeconds:
          parseNullableInt(json['durationSec'] ?? json['durationSeconds']) ?? 0,
      loggedAt: parseDateTime(json['loggedAt']),
    );
  }
}
