import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../../router_integration/domain/gateway_model.dart';
import '../domain/gateway_registration_result.dart';

final gatewayRepositoryProvider = Provider<GatewayRepository>((ref) {
  return GatewayRepository(ref.read(apiClientProvider));
});

/// Owns the gateway lifecycle actions (register/rename/rotate/delete) that
/// this app performs as the JWT-authenticated parent. Reading the list stays
/// on RouterRepository.fetchGateways() (pre-existing, already consumed by
/// gatewaysListProvider) — this repository is additive, not a duplicate.
class GatewayRepository {
  GatewayRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<GatewayRegistrationResult> register({
    required String name,
    required GatewayType gatewayType,
    String? description,
    String? endpoint,
  }) async {
    final data =
        await _apiClient.post(
              '/gateway/register',
              data: {
                'name': name,
                'gatewayType': gatewayType.toJson(),
                'description': description,
                'endpoint': endpoint,
              }..removeWhere((key, value) => value == null || value == ''),
            )
            as Map<String, dynamic>;
    return GatewayRegistrationResult.fromJson(data);
  }

  Future<void> rename(String gatewayId, {String? name, String? description}) async {
    await _apiClient.patch(
      '/gateway/$gatewayId',
      data: {
        'name': name,
        'description': description,
      }..removeWhere((key, value) => value == null),
    );
  }

  /// Returns the token once more — same one-time-reveal contract as register().
  Future<String> rotateToken(String gatewayId) async {
    final data = await _apiClient.post('/gateway/$gatewayId/rotate-token') as Map<String, dynamic>;
    return data['token'] as String? ?? '';
  }

  Future<void> delete(String gatewayId) async {
    await _apiClient.delete('/gateway/$gatewayId');
  }
}
