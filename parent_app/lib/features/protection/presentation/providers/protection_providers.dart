import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/protection/data/protection_repository.dart';
import 'package:parent_app/features/protection/domain/device_insights.dart';
import 'package:parent_app/features/protection/domain/device_schedule.dart';
import 'package:parent_app/features/protection/domain/protection_score.dart';

final protectionScoreProvider = FutureProvider.family<ProtectionScore, String>((
  ref,
  deviceId,
) async {
  return ref.read(protectionRepositoryProvider).fetchProtectionScore(deviceId);
});

final deviceInsightsProvider = FutureProvider.family<DeviceInsights, String>((
  ref,
  deviceId,
) async {
  return ref.read(protectionRepositoryProvider).fetchInsights(deviceId);
});

final deviceScheduleProvider = FutureProvider.family<DeviceSchedule, String>((
  ref,
  deviceId,
) async {
  return ref.read(protectionRepositoryProvider).fetchSchedule(deviceId);
});
