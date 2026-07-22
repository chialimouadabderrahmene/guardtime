import 'package:parent_app/core/utils/model_utils.dart';

/// Router Plugin is the primary, recommended path (an existing router's own
/// management API does the enforcement). Software Agent is a secondary,
/// experimental option — gateway-agent enforcing directly on its own host,
/// for setups with no router that exposes a supported management API.
enum GatewayType {
  softwareAgent,
  routerPlugin;

  static GatewayType fromJson(String? value) {
    return value == 'ROUTER_PLUGIN' ? GatewayType.routerPlugin : GatewayType.softwareAgent;
  }

  String toJson() => this == GatewayType.routerPlugin ? 'ROUTER_PLUGIN' : 'SOFTWARE_AGENT';
}

class DetectedRouterSummary {
  const DetectedRouterSummary({this.vendor, this.model, this.integrationStatus, this.pluginId});

  final String? vendor;
  final String? model;
  final String? integrationStatus;
  final String? pluginId;

  factory DetectedRouterSummary.fromJson(Map<String, dynamic> json) {
    return DetectedRouterSummary(
      vendor: json['vendor'] as String?,
      model: json['model'] as String?,
      integrationStatus: json['integrationStatus'] as String?,
      pluginId: json['pluginId'] as String?,
    );
  }
}

class GatewayModel {
  const GatewayModel({
    required this.id,
    required this.name,
    required this.paired,
    required this.gatewayType,
    this.description,
    this.endpoint,
    this.pairedAt,
    this.lastSeen,
    this.online = false,
    this.deviceCount = 0,
    this.agentVersion,
    this.detectedRouter,
    this.vpnDetectionCount24h = 0,
    this.dohDetectionCount24h = 0,
  });

  final String id;
  final String name;
  final String? description;
  final GatewayType gatewayType;
  final String? endpoint;
  final bool paired;
  final DateTime? pairedAt;
  final DateTime? lastSeen;
  /// Derived server-side from lastSeen freshness (see GatewayService.listGateways) — not a separate stored flag.
  final bool online;
  final int deviceCount;
  final String? agentVersion;
  final DetectedRouterSummary? detectedRouter;
  final int vpnDetectionCount24h;
  final int dohDetectionCount24h;

  factory GatewayModel.fromJson(Map<String, dynamic> json) {
    final detectedRouterJson = json['detectedRouter'];
    return GatewayModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Gateway',
      description: json['description'] as String?,
      gatewayType: GatewayType.fromJson(json['gatewayType'] as String?),
      endpoint: json['endpoint'] as String?,
      paired: json['paired'] as bool? ?? false,
      pairedAt: parseDateTime(json['pairedAt']),
      lastSeen: parseDateTime(json['lastSeen']),
      online: json['online'] as bool? ?? false,
      deviceCount: json['deviceCount'] as int? ?? 0,
      agentVersion: json['agentVersion'] as String?,
      detectedRouter: detectedRouterJson is Map<String, dynamic> ? DetectedRouterSummary.fromJson(detectedRouterJson) : null,
      vpnDetectionCount24h: json['vpnDetectionCount24h'] as int? ?? 0,
      dohDetectionCount24h: json['dohDetectionCount24h'] as int? ?? 0,
    );
  }
}
