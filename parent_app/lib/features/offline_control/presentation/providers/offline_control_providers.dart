import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/devices/domain/offline_control_status.dart';
import 'package:parent_app/features/devices/domain/platform_models.dart';
import 'package:parent_app/features/offline_control/data/offline_control_repository.dart';

final offlineStatusProvider =
    FutureProvider.family<OfflineControlStatus, String>((ref, deviceId) async {
      return ref.read(offlineControlRepositoryProvider).fetchStatus(deviceId);
    });

final offlineGuideByTypeProvider = FutureProvider.family<OfflineGuide, String>((
  ref,
  deviceType,
) async {
  return ref.read(offlineControlRepositoryProvider).fetchGuide(deviceType);
});
