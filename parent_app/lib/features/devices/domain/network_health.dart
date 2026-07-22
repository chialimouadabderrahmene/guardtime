/// Mirrors backend's NetworkHealthSummary (network-health.types.ts) — a
/// household-wide rollup shown on the Dashboard. Never computed
/// client-side; this only parses what NetworkHealthService already
/// calculated server-side.
enum HealthColor { green, yellow, red, grey }

HealthColor _colorFromJson(String? value) {
  switch (value) {
    case 'green':
      return HealthColor.green;
    case 'yellow':
      return HealthColor.yellow;
    case 'red':
      return HealthColor.red;
    default:
      return HealthColor.grey;
  }
}

class HealthSection {
  const HealthSection({required this.label, required this.state, required this.color, required this.percent, required this.detail});

  final String label;
  final String state;
  final HealthColor color;
  final int? percent;
  final String detail;

  factory HealthSection.fromJson(Map<String, dynamic> json) {
    return HealthSection(
      label: json['label'] as String? ?? '',
      state: json['state'] as String? ?? 'Unknown',
      color: _colorFromJson(json['color'] as String?),
      percent: json['percent'] as int?,
      detail: json['detail'] as String? ?? '',
    );
  }
}

class NetworkHealthSummary {
  const NetworkHealthSummary({
    required this.overallProtection,
    required this.overallColor,
    required this.router,
    required this.dns,
    required this.plugin,
    required this.security,
    required this.vpn,
    required this.privateDns,
    required this.doh,
    required this.networkStability,
    this.lastSynchronization,
  });

  final int overallProtection;
  final HealthColor overallColor;
  final HealthSection router;
  final HealthSection dns;
  final HealthSection plugin;
  final HealthSection security;
  final HealthSection vpn;
  final HealthSection privateDns;
  final HealthSection doh;
  final HealthSection networkStability;
  final DateTime? lastSynchronization;

  factory NetworkHealthSummary.fromJson(Map<String, dynamic> json) {
    final lastSync = json['lastSynchronization'] as String?;
    return NetworkHealthSummary(
      overallProtection: json['overallProtection'] as int? ?? 0,
      overallColor: _colorFromJson(json['overallColor'] as String?),
      router: HealthSection.fromJson(json['router'] as Map<String, dynamic>? ?? const {}),
      dns: HealthSection.fromJson(json['dns'] as Map<String, dynamic>? ?? const {}),
      plugin: HealthSection.fromJson(json['plugin'] as Map<String, dynamic>? ?? const {}),
      security: HealthSection.fromJson(json['security'] as Map<String, dynamic>? ?? const {}),
      vpn: HealthSection.fromJson(json['vpn'] as Map<String, dynamic>? ?? const {}),
      privateDns: HealthSection.fromJson(json['privateDns'] as Map<String, dynamic>? ?? const {}),
      doh: HealthSection.fromJson(json['doh'] as Map<String, dynamic>? ?? const {}),
      networkStability: HealthSection.fromJson(json['networkStability'] as Map<String, dynamic>? ?? const {}),
      lastSynchronization: lastSync != null ? DateTime.tryParse(lastSync)?.toLocal() : null,
    );
  }
}
