import 'package:parent_app/core/utils/model_utils.dart';

class GatewayModel {
  const GatewayModel({
    required this.id,
    required this.name,
    required this.paired,
    this.endpoint,
    this.pairedAt,
    this.lastSeen,
  });

  final String id;
  final String name;
  final String? endpoint;
  final bool paired;
  final DateTime? pairedAt;
  final DateTime? lastSeen;

  factory GatewayModel.fromJson(Map<String, dynamic> json) {
    return GatewayModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Gateway',
      endpoint: json['endpoint'] as String?,
      paired: json['paired'] as bool? ?? false,
      pairedAt: parseDateTime(json['pairedAt']),
      lastSeen: parseDateTime(json['lastSeen']),
    );
  }
}
