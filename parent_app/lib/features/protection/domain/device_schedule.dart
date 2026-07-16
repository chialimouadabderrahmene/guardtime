import 'package:parent_app/core/utils/model_utils.dart';

class DeviceSchedule {
  const DeviceSchedule({
    required this.deviceId,
    required this.dailyLimitMinutes,
    required this.bedtimeStart,
    required this.bedtimeEnd,
    required this.autoBlockEnabled,
  });

  final String deviceId;
  final int? dailyLimitMinutes;
  final String? bedtimeStart;
  final String? bedtimeEnd;
  final bool autoBlockEnabled;

  factory DeviceSchedule.fromJson(Map<String, dynamic> json) {
    return DeviceSchedule(
      deviceId: json['deviceId'] as String? ?? '',
      dailyLimitMinutes: parseNullableInt(json['dailyLimitMinutes']),
      bedtimeStart: json['bedtimeStart'] as String?,
      bedtimeEnd: json['bedtimeEnd'] as String?,
      autoBlockEnabled: json['autoBlockEnabled'] as bool? ?? false,
    );
  }
}
