import 'package:parent_app/core/utils/model_utils.dart';

/// Protection-health verdict for one device (mirrors the backend
/// `DeviceHealthState`). Kept honest: a quiet device reads as IDLE, not broken.
enum DeviceHealthState {
  verified,
  idle,
  needsAttention,
  neverVerified,
  notConfigured,
  unknown;

  static DeviceHealthState fromApi(String? raw) {
    switch (raw) {
      case 'VERIFIED':
        return DeviceHealthState.verified;
      case 'IDLE':
        return DeviceHealthState.idle;
      case 'NEEDS_ATTENTION':
        return DeviceHealthState.needsAttention;
      case 'NEVER_VERIFIED':
        return DeviceHealthState.neverVerified;
      case 'NOT_CONFIGURED':
        return DeviceHealthState.notConfigured;
      default:
        return DeviceHealthState.unknown;
    }
  }
}

class DeviceHealth {
  const DeviceHealth({
    required this.deviceId,
    required this.name,
    required this.type,
    required this.childId,
    required this.state,
    required this.severity,
    required this.filteringActive,
    required this.title,
    required this.message,
    required this.recommendedAction,
    required this.lastDnsSeenAt,
    required this.ageMinutes,
  });

  final String deviceId;
  final String name;
  final String type;
  final String? childId;
  final DeviceHealthState state;
  final String severity; // ok | info | warning
  final bool filteringActive;
  final String title;
  final String message;
  final String? recommendedAction;
  final DateTime? lastDnsSeenAt;
  final int? ageMinutes;

  factory DeviceHealth.fromJson(Map<String, dynamic> json) {
    return DeviceHealth(
      deviceId: json['deviceId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'OTHER',
      childId: json['childId'] as String?,
      state: DeviceHealthState.fromApi(json['state'] as String?),
      severity: json['severity'] as String? ?? 'info',
      filteringActive: json['filteringActive'] as bool? ?? false,
      title: json['title'] as String? ?? '',
      message: json['message'] as String? ?? '',
      recommendedAction: json['recommendedAction'] as String?,
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      ageMinutes: json['ageMinutes'] as int?,
    );
  }
}

class DeviceHealthSummary {
  const DeviceHealthSummary({
    required this.generatedAt,
    required this.total,
    required this.protectedCount,
    required this.needsAttentionCount,
    required this.notConfiguredCount,
    required this.devices,
  });

  final DateTime? generatedAt;
  final int total;
  final int protectedCount;
  final int needsAttentionCount;
  final int notConfiguredCount;
  final List<DeviceHealth> devices;

  factory DeviceHealthSummary.fromJson(Map<String, dynamic> json) {
    return DeviceHealthSummary(
      generatedAt: parseDateTime(json['generatedAt']),
      total: json['total'] as int? ?? 0,
      protectedCount: json['protectedCount'] as int? ?? 0,
      needsAttentionCount: json['needsAttentionCount'] as int? ?? 0,
      notConfiguredCount: json['notConfiguredCount'] as int? ?? 0,
      devices: (json['devices'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(DeviceHealth.fromJson)
          .toList(),
    );
  }
}
