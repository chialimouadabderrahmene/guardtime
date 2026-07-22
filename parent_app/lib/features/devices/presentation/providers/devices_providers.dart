import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/domain/device_health.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';
import 'package:parent_app/features/devices/domain/network_health.dart';
import 'package:parent_app/features/devices/domain/network_status_model.dart';
import 'package:parent_app/features/devices/domain/offline_control_status.dart';
import 'package:parent_app/features/devices/domain/platform_models.dart';

final devicesListProvider = FutureProvider<List<DeviceModel>>((ref) async {
  return ref.read(devicesRepositoryProvider).fetchDevices();
});

final deviceDetailsProvider = FutureProvider.family<DeviceModel, String>((
  ref,
  deviceId,
) async {
  return ref.read(devicesRepositoryProvider).fetchDevice(deviceId);
});

final networkStatusProvider = FutureProvider.family<NetworkStatusModel, String>(
  (ref, deviceId) async {
    return ref.read(devicesRepositoryProvider).fetchNetworkStatus(deviceId);
  },
);

final offlineControlProvider =
    FutureProvider.family<OfflineControlStatus, String>((ref, deviceId) async {
      return ref
          .read(devicesRepositoryProvider)
          .fetchOfflineControlStatus(deviceId);
    });

final deviceHealthSummaryProvider = FutureProvider<DeviceHealthSummary>((
  ref,
) async {
  return ref.read(devicesRepositoryProvider).fetchDeviceHealthSummary();
});

final deviceHealthProvider = FutureProvider.family<DeviceHealth, String>((
  ref,
  deviceId,
) async {
  return ref.read(devicesRepositoryProvider).fetchDeviceHealth(deviceId);
});

final networkHealthProvider = FutureProvider<NetworkHealthSummary>((ref) async {
  return ref.read(devicesRepositoryProvider).fetchNetworkHealth();
});

final platformGuidesProvider = FutureProvider<List<PlatformGuide>>((ref) async {
  return ref.read(devicesRepositoryProvider).fetchPlatformGuides();
});

final supportMatrixProvider = FutureProvider<List<SupportMatrixItem>>((
  ref,
) async {
  return ref.read(devicesRepositoryProvider).fetchSupportMatrix();
});

final platformGuideProvider = FutureProvider.family<PlatformGuide, String>((
  ref,
  platform,
) async {
  return ref.read(devicesRepositoryProvider).fetchPlatformGuide(platform);
});

final offlineGuideProvider = FutureProvider.family<OfflineGuide, String>((
  ref,
  deviceType,
) async {
  return ref.read(devicesRepositoryProvider).fetchOfflineGuide(deviceType);
});
