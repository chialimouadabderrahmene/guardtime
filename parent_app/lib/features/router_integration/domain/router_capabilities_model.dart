/// Mirrors backend's RouterCapabilities (router-capability.matrix.ts) — the
/// Router Integration Engine's capability database, one entry per vendor.
class RouterCapabilitiesModel {
  const RouterCapabilitiesModel({
    required this.pluginId,
    required this.vendorDisplayName,
    required this.integrationStatus,
    required this.pluginImplemented,
    required this.supportsDNSChange,
    required this.supportsFirewallRules,
    required this.supportsPauseDevice,
    required this.supportsClientDisconnect,
    required this.supportsQoS,
    required this.supportsStatistics,
    required this.supportsParentalControl,
    required this.supportsACL,
    required this.supportsMACFiltering,
    required this.supportsAPI,
    required this.supportsSSH,
    required this.supportsTR064,
    required this.supportsRouterOS,
    required this.supportedAuthentication,
    this.modelFamily,
    this.protocol,
    this.officialDocUrl,
    this.scopeNote,
  });

  final String pluginId;
  final String vendorDisplayName;
  final String? modelFamily;
  final String integrationStatus; // 'OFFICIAL_API' | 'GUIDE_ONLY'
  final bool pluginImplemented;
  final String? protocol;
  final String? officialDocUrl;
  final String? scopeNote;
  final bool supportsDNSChange;
  final bool supportsFirewallRules;
  final bool supportsPauseDevice;
  final bool supportsClientDisconnect;
  final bool supportsQoS;
  final bool supportsStatistics;
  final bool supportsParentalControl;
  final bool supportsACL;
  final bool supportsMACFiltering;
  final bool supportsAPI;
  final bool supportsSSH;
  final bool supportsTR064;
  final bool supportsRouterOS;
  final List<String> supportedAuthentication;

  bool get isOfficialApi => integrationStatus == 'OFFICIAL_API';

  /// True only when GuardTime has shipped a working plugin AND the vendor
  /// has an official API — distinct from "official API exists, plugin
  /// coming soon" (isOfficialApi && !pluginImplemented).
  bool get isFullyIntegrated => isOfficialApi && pluginImplemented;

  List<CapabilityFlag> get flags => [
    CapabilityFlag('DNS Change', supportsDNSChange),
    CapabilityFlag('Firewall Rules', supportsFirewallRules),
    CapabilityFlag('Pause Device', supportsPauseDevice),
    CapabilityFlag('Client Disconnect', supportsClientDisconnect),
    CapabilityFlag('QoS / Bandwidth', supportsQoS),
    CapabilityFlag('Statistics', supportsStatistics),
    CapabilityFlag('Parental Control', supportsParentalControl),
    CapabilityFlag('ACL', supportsACL),
    CapabilityFlag('MAC Filtering', supportsMACFiltering),
  ];

  factory RouterCapabilitiesModel.fromJson(Map<String, dynamic> json) {
    return RouterCapabilitiesModel(
      pluginId: json['pluginId'] as String? ?? '',
      vendorDisplayName: json['vendorDisplayName'] as String? ?? 'Unknown vendor',
      modelFamily: json['modelFamily'] as String?,
      integrationStatus: json['integrationStatus'] as String? ?? 'GUIDE_ONLY',
      pluginImplemented: json['pluginImplemented'] as bool? ?? false,
      protocol: json['protocol'] as String?,
      officialDocUrl: json['officialDocUrl'] as String?,
      scopeNote: json['scopeNote'] as String?,
      supportsDNSChange: json['supportsDNSChange'] as bool? ?? false,
      supportsFirewallRules: json['supportsFirewallRules'] as bool? ?? false,
      supportsPauseDevice: json['supportsPauseDevice'] as bool? ?? false,
      supportsClientDisconnect: json['supportsClientDisconnect'] as bool? ?? false,
      supportsQoS: json['supportsQoS'] as bool? ?? false,
      supportsStatistics: json['supportsStatistics'] as bool? ?? false,
      supportsParentalControl: json['supportsParentalControl'] as bool? ?? false,
      supportsACL: json['supportsACL'] as bool? ?? false,
      supportsMACFiltering: json['supportsMACFiltering'] as bool? ?? false,
      supportsAPI: json['supportsAPI'] as bool? ?? false,
      supportsSSH: json['supportsSSH'] as bool? ?? false,
      supportsTR064: json['supportsTR064'] as bool? ?? false,
      supportsRouterOS: json['supportsRouterOS'] as bool? ?? false,
      supportedAuthentication:
          (json['supportedAuthentication'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
          const [],
    );
  }
}

class CapabilityFlag {
  const CapabilityFlag(this.label, this.supported);
  final String label;
  final bool supported;
}
