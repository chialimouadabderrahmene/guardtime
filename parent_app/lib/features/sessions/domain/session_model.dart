import 'package:parent_app/core/utils/model_utils.dart';

class SessionModel {
  const SessionModel({
    required this.id,
    required this.deviceId,
    required this.childId,
    required this.parentId,
    required this.status,
    required this.startedAt,
    required this.pausedAt,
    required this.resumedAt,
    required this.durationMinutes,
    required this.remainingMinutes,
    required this.extendedMinutes,
    required this.deviceName,
    required this.childName,
  });

  final String id;
  final String deviceId;
  final String childId;
  final String parentId;
  final String status;
  final DateTime? startedAt;
  final DateTime? pausedAt;
  final DateTime? resumedAt;
  final int durationMinutes;
  final int remainingMinutes;
  final int extendedMinutes;
  final String? deviceName;
  final String? childName;

  factory SessionModel.fromJson(Map<String, dynamic> json) {
    final device = json['device'];
    final child = json['child'];
    return SessionModel(
      id: json['id'] as String? ?? '',
      deviceId: json['deviceId'] as String? ?? '',
      childId: json['childId'] as String? ?? '',
      parentId: json['parentId'] as String? ?? '',
      status: json['status'] as String? ?? 'ACTIVE',
      startedAt: parseDateTime(json['startedAt']),
      pausedAt: parseDateTime(json['pausedAt']),
      resumedAt: parseDateTime(json['resumedAt']),
      durationMinutes: parseNullableInt(json['durationMinutes']) ?? 0,
      remainingMinutes: parseNullableInt(json['remainingMinutes']) ?? 0,
      extendedMinutes: parseNullableInt(json['extendedMinutes']) ?? 0,
      deviceName: device is Map<String, dynamic>
          ? device['name'] as String?
          : null,
      childName: child is Map<String, dynamic>
          ? child['name'] as String?
          : null,
    );
  }
}
