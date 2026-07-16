import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';
import 'package:parent_app/features/protection/domain/device_insights.dart';
import 'package:parent_app/features/protection/domain/device_schedule.dart';
import 'package:parent_app/features/protection/domain/protection_score.dart';

final protectionRepositoryProvider = Provider<ProtectionRepository>((ref) {
  return ProtectionRepository(ref.read(apiClientProvider));
});

class ProtectionRepository {
  ProtectionRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<ProtectionScore> fetchProtectionScore(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/protection-score')
            as Map<String, dynamic>;
    return ProtectionScore.fromJson(data);
  }

  Future<DeviceInsights> fetchInsights(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/insights')
            as Map<String, dynamic>;
    return DeviceInsights.fromJson(data);
  }

  Future<DeviceSchedule> fetchSchedule(String deviceId) async {
    final data =
        await _apiClient.get('/devices/$deviceId/schedule')
            as Map<String, dynamic>;
    return DeviceSchedule.fromJson(data);
  }

  Future<DeviceSchedule> saveSchedule(
    String deviceId, {
    required bool autoBlockEnabled,
    int? dailyLimitMinutes,
    String? bedtimeStart,
    String? bedtimeEnd,
  }) async {
    final data =
        await _apiClient.post(
              '/devices/$deviceId/schedule',
              data: {
                'autoBlockEnabled': autoBlockEnabled,
                'dailyLimitMinutes': dailyLimitMinutes,
                'bedtimeStart': bedtimeStart,
                'bedtimeEnd': bedtimeEnd,
              }..removeWhere((key, value) => value == null),
            )
            as Map<String, dynamic>;
    return DeviceSchedule.fromJson(data);
  }
}
