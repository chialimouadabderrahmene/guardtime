import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/device_health.dart';
import '../domain/device_model.dart';
import '../domain/network_status_model.dart';
import '../domain/offline_control_status.dart';
import '../domain/platform_models.dart';

final devicesRepositoryProvider = Provider<DevicesRepository>((ref) {
  return DevicesRepository(ref.read(apiClientProvider));
});

class DevicesRepository {
  DevicesRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<DeviceModel>> fetchDevices() async {
    final data = await _apiClient.get('/devices') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(DeviceModel.fromJson)
        .toList();
  }

  Future<DeviceModel> fetchDevice(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId') as Map<String, dynamic>;
    return DeviceModel.fromJson(data);
  }

  Future<DeviceModel> addDevice({
    required String childId,
    required String name,
    required String type,
    required String controlMethod,
    String? platform,
    String? ipAddress,
  }) async {
    final data =
        await _apiClient.post(
              '/devices',
              data: {
                'childId': childId,
                'name': name,
                'type': type,
                'platform': platform,
                'ipAddress': ipAddress,
                'controlMethod': controlMethod,
              }..removeWhere((key, value) => value == null || value == ''),
            )
            as Map<String, dynamic>;
    return DeviceModel.fromJson(data);
  }

  Future<DeviceModel> updateDevice(
    String deviceId, {
    String? name,
    String? childId,
    String? ipAddress,
    String? controlMethod,
  }) async {
    final data =
        await _apiClient.patch(
              '/devices/$deviceId',
              data: {
                'name': name,
                'childId': childId,
                'ipAddress': ipAddress,
                'controlMethod': controlMethod,
              }..removeWhere((key, value) => value == null || value == ''),
            )
            as Map<String, dynamic>;
    return DeviceModel.fromJson(data);
  }

  Future<void> deleteDevice(String deviceId) async {
    await _apiClient.delete('/devices/$deviceId');
  }

  Future<DeviceModel> lockInternet(String deviceId) async {
    final data =
        await _apiClient.post(
              '/devices/$deviceId/internet-lock',
              data: {'reason': 'Paused by parent'},
            )
            as Map<String, dynamic>;
    return DeviceModel.fromJson(data);
  }

  Future<DeviceModel> unlockInternet(String deviceId) async {
    final data =
        await _apiClient.post('/devices/$deviceId/internet-unlock')
            as Map<String, dynamic>;
    return DeviceModel.fromJson(data);
  }

  Future<DeviceHealthSummary> fetchDeviceHealthSummary() async {
    final data =
        await _apiClient.get('/device-health') as Map<String, dynamic>;
    return DeviceHealthSummary.fromJson(data);
  }

  Future<DeviceHealth> fetchDeviceHealth(String deviceId) async {
    final data =
        await _apiClient.get('/device-health/$deviceId') as Map<String, dynamic>;
    return DeviceHealth.fromJson(data);
  }

  Future<NetworkStatusModel> fetchNetworkStatus(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/network-status')
            as Map<String, dynamic>;
    return NetworkStatusModel.fromJson(data);
  }

  Future<OfflineControlStatus> fetchOfflineControlStatus(
    String deviceId,
  ) async {
    final data =
        await _apiClient.get('/devices/$deviceId/offline-control/status')
            as Map<String, dynamic>;
    return OfflineControlStatus.fromJson(data);
  }

  Future<OfflineControlStatus> markOfflineSetup(
    String deviceId, {
    required bool completed,
    required bool verified,
    required String method,
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
    return fetchOfflineControlStatus(deviceId);
  }

  Future<OfflineControlStatus> updateChecklist(
    String deviceId,
    Map<String, dynamic> checklist,
  ) async {
    await _apiClient.post(
      '/devices/$deviceId/offline-control/checklist',
      data: checklist,
    );
    return fetchOfflineControlStatus(deviceId);
  }

  Future<List<SupportMatrixItem>> fetchSupportMatrix() async {
    final data =
        await _apiClient.get('/platform-support/matrix') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(SupportMatrixItem.fromJson)
        .toList();
  }

  Future<List<PlatformGuide>> fetchPlatformGuides() async {
    final data =
        await _apiClient.get('/platform-support/guides') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(PlatformGuide.fromJson)
        .toList();
  }

  Future<PlatformGuide> fetchPlatformGuide(String platform) async {
    final data =
        await _apiClient.get(
              '/platform-support/guides/$platform',
              requiresAuth: false,
            )
            as Map<String, dynamic>;
    return PlatformGuide.fromJson(data);
  }

  Future<OfflineGuide> fetchOfflineGuide(String deviceType) async {
    final data =
        await _apiClient.get(
              '/platform-guides/$deviceType',
              requiresAuth: false,
            )
            as Map<String, dynamic>;
    return OfflineGuide.fromJson(data);
  }
}
