import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/pairing_models.dart';

final pairingRepositoryProvider = Provider<PairingRepository>((ref) {
  return PairingRepository(ref.read(apiClientProvider));
});

class PairingRepository {
  PairingRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<PairingStartResult> startPairing(String deviceId) async {
    final data =
        await _apiClient.post('/devices/$deviceId/pair/start')
            as Map<String, dynamic>;
    return PairingStartResult.fromJson(data);
  }

  Future<PairingStatus> getStatus(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/pair/status')
            as Map<String, dynamic>;
    return PairingStatus.fromJson(data);
  }

  Future<void> cancelPairing(String deviceId) async {
    await _apiClient.delete('/devices/$deviceId/pair');
  }

  Future<ConnectionStats> getConnectionStats(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/pair/stats')
            as Map<String, dynamic>;
    return ConnectionStats.fromJson(data);
  }
}
