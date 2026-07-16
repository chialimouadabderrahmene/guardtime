import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/utils/model_utils.dart';

class DeviceModel {
  const DeviceModel({
    required this.id,
    required this.name,
    required this.type,
    required this.platform,
    required this.status,
    required this.controlMethod,
    required this.ipAddress,
    required this.dnsSourceIp,
    required this.dnsConfigured,
    required this.lastDnsSeenAt,
    required this.internetLocked,
    required this.blockingMode,
    required this.protectionStatus,
    required this.protectionScore,
    required this.offlineControlSupported,
    required this.offlineControlMethod,
    required this.recommendedControlMethod,
    required this.supportNotes,
    this.childId,
    this.childName,
  });

  final String id;
  final String? childId;
  final String? childName;
  final String name;
  final String type;
  final String? platform;
  final String status;
  final String controlMethod;
  final String? ipAddress;
  final String? dnsSourceIp;
  final bool dnsConfigured;
  final DateTime? lastDnsSeenAt;
  final bool internetLocked;
  final String blockingMode;
  final String protectionStatus;
  final int? protectionScore;
  final bool offlineControlSupported;
  final String? offlineControlMethod;
  final String? recommendedControlMethod;
  final String? supportNotes;

  bool get dnsConnected {
    if (lastDnsSeenAt == null) {
      return false;
    }
    return DateTime.now().difference(lastDnsSeenAt!) <=
        AppConfig.networkHeartbeatWindow;
  }

  factory DeviceModel.fromJson(Map<String, dynamic> json) {
    final child = json['child'];
    return DeviceModel(
      id: json['id'] as String? ?? '',
      childId: json['childId'] as String?,
      childName: child is Map<String, dynamic>
          ? child['name'] as String?
          : null,
      name: json['name'] as String? ?? '',
      type: json['type'] as String? ?? 'OTHER',
      platform: json['platform'] as String?,
      status: json['status'] as String? ?? 'ONLINE',
      controlMethod: json['controlMethod'] as String? ?? 'MOCK',
      ipAddress: json['ipAddress'] as String?,
      dnsSourceIp: json['dnsSourceIp'] as String?,
      dnsConfigured: json['dnsConfigured'] as bool? ?? false,
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      internetLocked: json['internetLocked'] as bool? ?? false,
      blockingMode: json['blockingMode'] as String? ?? 'GAMING_ONLY',
      protectionStatus: json['protectionStatus'] as String? ?? 'NORMAL',
      protectionScore: parseNullableInt(json['protectionScore']),
      offlineControlSupported:
          json['offlineControlSupported'] as bool? ?? false,
      offlineControlMethod: json['offlineControlMethod'] as String?,
      recommendedControlMethod: json['recommendedControlMethod'] as String?,
      supportNotes: json['supportNotes'] as String?,
    );
  }
}
