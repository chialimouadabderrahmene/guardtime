import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/detected_router_model.dart';
import '../domain/gateway_model.dart';
import '../domain/router_capabilities_model.dart';
import '../domain/router_command_model.dart';
import '../domain/router_features_model.dart';

final routerRepositoryProvider = Provider<RouterRepository>((ref) {
  return RouterRepository(ref.read(apiClientProvider));
});

class RouterRepository {
  RouterRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<GatewayModel>> fetchGateways() async {
    final data = await _apiClient.get('/gateway') as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(GatewayModel.fromJson).toList();
  }

  Future<List<RouterCapabilitiesModel>> fetchVendors() async {
    final data = await _apiClient.get('/router-integration/vendors') as List<dynamic>;
    return data.whereType<Map<String, dynamic>>().map(RouterCapabilitiesModel.fromJson).toList();
  }

  Future<DetectedRouterModel?> fetchDetectedRouter(String gatewayId) async {
    final data = await _apiClient.get('/router-integration/$gatewayId/detected');
    if (data is! Map<String, dynamic>) return null;
    return DetectedRouterModel.fromJson(data);
  }

  Future<RouterFeaturesModel> fetchFeatures(String gatewayId) async {
    final data = await _apiClient.get('/router-integration/$gatewayId/features') as Map<String, dynamic>;
    return RouterFeaturesModel.fromJson(data);
  }

  Future<void> triggerDetection(String gatewayId) async {
    await _apiClient.post('/router-integration/$gatewayId/detect');
  }

  Future<void> setup(
    String gatewayId, {
    String? vendorPluginId,
    String? username,
    String? password,
    String? apiKey,
  }) async {
    await _apiClient.post(
      '/router-integration/$gatewayId/setup',
      data: {
        'vendorPluginId': vendorPluginId,
        'username': username,
        'password': password,
        'apiKey': apiKey,
      }..removeWhere((key, value) => value == null || value == ''),
    );
  }

  Future<void> testConnection(String gatewayId) async {
    await _apiClient.post('/router-integration/$gatewayId/test-connection');
  }

  Future<RouterDiagnosticsModel> fetchDiagnostics(String gatewayId) async {
    final data = await _apiClient.get('/router-integration/$gatewayId/diagnostics') as Map<String, dynamic>;
    return RouterDiagnosticsModel.fromJson(data);
  }

  Future<EndGamingSessionResult> endGamingSession(String gatewayId, String deviceId) async {
    final data =
        await _apiClient.post(
              '/router-integration/$gatewayId/end-gaming-session',
              data: {'deviceId': deviceId},
            )
            as Map<String, dynamic>;
    return EndGamingSessionResult.fromJson(data);
  }

  Future<void> changeDns(String gatewayId, String dnsServer) async {
    await _apiClient.post('/router-integration/$gatewayId/change-dns', data: {'dnsServer': dnsServer});
  }

  Future<void> blockMac(String gatewayId, String macAddress) async {
    await _apiClient.post('/router-integration/$gatewayId/block-mac', data: {'macAddress': macAddress});
  }

  Future<void> unblockMac(String gatewayId, String macAddress) async {
    await _apiClient.post('/router-integration/$gatewayId/unblock-mac', data: {'macAddress': macAddress});
  }
}
