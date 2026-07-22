import 'router_capabilities_model.dart';
import 'router_capability_score_model.dart';

class RouterFeaturesModel {
  const RouterFeaturesModel({required this.detected, this.capabilities, this.score});

  final bool detected;
  final RouterCapabilitiesModel? capabilities;
  final RouterCapabilityScoreModel? score;

  factory RouterFeaturesModel.fromJson(Map<String, dynamic> json) {
    final capabilitiesJson = json['capabilities'];
    final scoreJson = json['score'];
    return RouterFeaturesModel(
      detected: json['detected'] as bool? ?? false,
      capabilities: capabilitiesJson is Map<String, dynamic>
          ? RouterCapabilitiesModel.fromJson(capabilitiesJson)
          : null,
      score: scoreJson is Map<String, dynamic> ? RouterCapabilityScoreModel.fromJson(scoreJson) : null,
    );
  }
}
