import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/utils/model_utils.dart';

class TopDomain {
  const TopDomain({required this.domain, required this.count});

  final String domain;
  final int count;

  factory TopDomain.fromJson(Map<String, dynamic> json) {
    return TopDomain(
      domain: json['domain'] as String? ?? '',
      count: parseNullableInt(json['count']) ?? 0,
    );
  }
}

class DeviceInsights {
  const DeviceInsights({
    required this.deviceId,
    required this.protectionScore,
    required this.protectionLevel,
    required this.breakdown,
    required this.protectionStatus,
    required this.lastDnsSeenAt,
    required this.bypassAttempts,
    required this.lastBypassDetectedAt,
    required this.checklistCompletedCount,
    required this.topDomains,
    required this.recommendations,
  });

  final String deviceId;
  final int protectionScore;
  final String protectionLevel;
  final Map<String, int> breakdown;
  final String protectionStatus;
  final DateTime? lastDnsSeenAt;
  final int bypassAttempts;
  final DateTime? lastBypassDetectedAt;
  final int checklistCompletedCount;
  final List<TopDomain> topDomains;
  final List<String> recommendations;

  bool get connected {
    if (lastDnsSeenAt == null) {
      return false;
    }
    return DateTime.now().difference(lastDnsSeenAt!) <=
        AppConfig.networkHeartbeatWindow;
  }

  factory DeviceInsights.fromJson(Map<String, dynamic> json) {
    return DeviceInsights(
      deviceId: json['deviceId'] as String? ?? '',
      protectionScore: parseNullableInt(json['protectionScore']) ?? 0,
      protectionLevel: json['protectionLevel'] as String? ?? 'LOW',
      breakdown: Map<String, int>.from(
        (json['breakdown'] as Map<String, dynamic>? ?? const {}).map(
          (key, value) => MapEntry(key, parseNullableInt(value) ?? 0),
        ),
      ),
      protectionStatus: json['protectionStatus'] as String? ?? 'NORMAL',
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      bypassAttempts: parseNullableInt(json['bypassAttempts']) ?? 0,
      lastBypassDetectedAt: parseDateTime(json['lastBypassDetectedAt']),
      checklistCompletedCount:
          parseNullableInt(json['checklistCompletedCount']) ?? 0,
      topDomains: (json['topDomains'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TopDomain.fromJson)
          .toList(),
      recommendations: (json['recommendations'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }
}
