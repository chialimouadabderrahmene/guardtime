import 'package:parent_app/core/utils/model_utils.dart';

class NetworkStatusModel {
  const NetworkStatusModel({
    required this.deviceId,
    required this.name,
    required this.type,
    required this.blockingMode,
    required this.internetLocked,
    required this.internetLockedReason,
    required this.internetLockedAt,
    required this.ipAddress,
    required this.dnsSourceIp,
    required this.lastDnsSeenAt,
    required this.offlineControlSupported,
    required this.offlineControlMethod,
    required this.note,
  });

  final String deviceId;
  final String name;
  final String type;
  final String blockingMode;
  final bool internetLocked;
  final String? internetLockedReason;
  final DateTime? internetLockedAt;
  final String? ipAddress;
  final String? dnsSourceIp;
  final DateTime? lastDnsSeenAt;
  final bool offlineControlSupported;
  final String? offlineControlMethod;
  final String note;

  bool get dnsConnected {
    if (lastDnsSeenAt == null) {
      return false;
    }
    return DateTime.now().difference(lastDnsSeenAt!) <=
        const Duration(minutes: 10);
  }

  factory NetworkStatusModel.fromJson(Map<String, dynamic> json) {
    return NetworkStatusModel(
      deviceId: json['deviceId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'OTHER',
      blockingMode: json['blockingMode'] as String? ?? 'GAMING_ONLY',
      internetLocked: json['internetLocked'] as bool? ?? false,
      internetLockedReason: json['internetLockedReason'] as String?,
      internetLockedAt: parseDateTime(json['internetLockedAt']),
      ipAddress: json['ipAddress'] as String?,
      dnsSourceIp: json['dnsSourceIp'] as String?,
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      offlineControlSupported:
          json['offlineControlSupported'] as bool? ?? false,
      offlineControlMethod: json['offlineControlMethod'] as String?,
      note: json['note'] as String? ?? '',
    );
  }
}
