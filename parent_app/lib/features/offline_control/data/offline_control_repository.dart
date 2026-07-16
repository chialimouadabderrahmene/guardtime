import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';
import 'package:parent_app/features/devices/domain/offline_control_status.dart';
import 'package:parent_app/features/devices/domain/platform_models.dart';

final offlineControlRepositoryProvider = Provider<OfflineControlRepository>((
  ref,
) {
  return OfflineControlRepository(ref.read(apiClientProvider));
});

class OfflineControlRepository {
  OfflineControlRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<OfflineControlStatus> fetchStatus(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/offline-control/status')
            as Map<String, dynamic>;
    return OfflineControlStatus.fromJson(data);
  }

  Future<OfflineGuide> fetchGuide(String deviceType) async {
    final data =
        await _apiClient.get(
              '/platform-guides/$deviceType',
              requiresAuth: false,
            )
            as Map<String, dynamic>;
    return OfflineGuide.fromJson(data);
  }

  Future<OfflineControlStatus> updateSetupStatus(
    String deviceId, {
    required bool completed,
    bool? verified,
    String? method,
    String? notes,
  }) async {
    await _apiClient.post(
      '/devices/$deviceId/offline-control/setup-status',
      data: {
        'completed': completed,
        'verified': verified,
        'method': method,
        'notes': notes,
      }..removeWhere((key, value) => value == null),
    );
    return fetchStatus(deviceId);
  }

  Future<OfflineControlStatus> updateChecklist(
    String deviceId,
    Map<String, dynamic> checklist,
  ) async {
    await _apiClient.post(
      '/devices/$deviceId/offline-control/checklist',
      data: checklist,
    );
    return fetchStatus(deviceId);
  }
}
