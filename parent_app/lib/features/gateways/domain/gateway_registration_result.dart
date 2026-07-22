import 'package:parent_app/features/router_integration/domain/gateway_model.dart';

/// The ONE moment the gateway token is ever visible to this app — the
/// register() response. Never persisted anywhere but secure storage, never
/// re-fetched from the list endpoint (which deliberately omits it).
class GatewayRegistrationResult {
  const GatewayRegistrationResult({
    required this.id,
    required this.name,
    required this.token,
    required this.gatewayType,
    required this.paired,
    this.endpoint,
  });

  final String id;
  final String name;
  final String token;
  final GatewayType gatewayType;
  final bool paired;
  final String? endpoint;

  factory GatewayRegistrationResult.fromJson(Map<String, dynamic> json) {
    return GatewayRegistrationResult(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Gateway',
      token: json['token'] as String? ?? '',
      gatewayType: GatewayType.fromJson(json['gatewayType'] as String?),
      paired: json['paired'] as bool? ?? false,
      endpoint: json['endpoint'] as String?,
    );
  }
}
