import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/domain/device_model.dart';

import '../../data/router_repository.dart';
import '../../domain/detected_router_model.dart';
import '../../domain/gateway_model.dart';
import '../../domain/router_capabilities_model.dart';
import '../../domain/router_command_model.dart';
import '../../domain/router_features_model.dart';

const gamingDeviceTypes = {'XBOX', 'PLAYSTATION', 'NINTENDO'};

final gatewaysListProvider = FutureProvider<List<GatewayModel>>((ref) async {
  return ref.read(routerRepositoryProvider).fetchGateways();
});

final routerVendorsProvider = FutureProvider<List<RouterCapabilitiesModel>>((ref) async {
  return ref.read(routerRepositoryProvider).fetchVendors();
});

final detectedRouterProvider = FutureProvider.family<DetectedRouterModel?, String>((
  ref,
  gatewayId,
) async {
  return ref.read(routerRepositoryProvider).fetchDetectedRouter(gatewayId);
});

final routerFeaturesProvider = FutureProvider.family<RouterFeaturesModel, String>((
  ref,
  gatewayId,
) async {
  return ref.read(routerRepositoryProvider).fetchFeatures(gatewayId);
});

final routerDiagnosticsProvider = FutureProvider.family<RouterDiagnosticsModel, String>((
  ref,
  gatewayId,
) async {
  return ref.read(routerRepositoryProvider).fetchDiagnostics(gatewayId);
});

/// Gaming Devices: reuses the existing Devices feature's data — no separate
/// detection mechanism, just a filter over device types the SmartBlockEngine
/// actually targets (Xbox/PlayStation/Nintendo).
final gamingDevicesProvider = FutureProvider<List<DeviceModel>>((ref) async {
  final devices = await ref.read(devicesRepositoryProvider).fetchDevices();
  return devices.where((device) => gamingDeviceTypes.contains(device.type)).toList();
});
