import 'package:parent_app/core/utils/model_utils.dart';

class DetectedRouterModel {
  const DetectedRouterModel({
    required this.gatewayId,
    required this.integrationStatus,
    this.vendor,
    this.model,
    this.firmwareVersion,
    this.pluginId,
    this.detectionMethod,
    this.confidence,
    this.ipAddress,
    this.hostname,
    this.lastDetectedAt,
    this.lastTestedAt,
    this.lastTestResult,
  });

  final String gatewayId;
  final String integrationStatus; // 'OFFICIAL_API' | 'GUIDE_ONLY' | 'UNDETECTED'
  final String? vendor;
  final String? model;
  final String? firmwareVersion;
  final String? pluginId;
  final String? detectionMethod;
  final int? confidence;
  final String? ipAddress;
  final String? hostname;
  final DateTime? lastDetectedAt;
  final DateTime? lastTestedAt;
  final bool? lastTestResult;

  bool get hasBeenDetected => vendor != null;

  factory DetectedRouterModel.fromJson(Map<String, dynamic> json) {
    return DetectedRouterModel(
      gatewayId: json['gatewayId'] as String? ?? '',
      integrationStatus: json['integrationStatus'] as String? ?? 'UNDETECTED',
      vendor: json['vendor'] as String?,
      model: json['model'] as String?,
      firmwareVersion: json['firmwareVersion'] as String?,
      pluginId: json['pluginId'] as String?,
      detectionMethod: json['detectionMethod'] as String?,
      confidence: parseNullableInt(json['confidence']),
      ipAddress: json['ipAddress'] as String?,
      hostname: json['hostname'] as String?,
      lastDetectedAt: parseDateTime(json['lastDetectedAt']),
      lastTestedAt: parseDateTime(json['lastTestedAt']),
      lastTestResult: json['lastTestResult'] as bool?,
    );
  }
}
