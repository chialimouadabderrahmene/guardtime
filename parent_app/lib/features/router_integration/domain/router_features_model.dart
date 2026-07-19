import 'router_capabilities_model.dart';

class RouterFeaturesModel {
  const RouterFeaturesModel({required this.detected, this.capabilities});

  final bool detected;
  final RouterCapabilitiesModel? capabilities;

  factory RouterFeaturesModel.fromJson(Map<String, dynamic> json) {
    final capabilitiesJson = json['capabilities'];
    return RouterFeaturesModel(
      detected: json['detected'] as bool? ?? false,
      capabilities: capabilitiesJson is Map<String, dynamic>
          ? RouterCapabilitiesModel.fromJson(capabilitiesJson)
          : null,
    );
  }
}
