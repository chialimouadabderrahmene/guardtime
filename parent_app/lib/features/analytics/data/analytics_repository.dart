import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/report_models.dart';
import '../domain/usage_models.dart';

final analyticsRepositoryProvider = Provider<AnalyticsRepository>((ref) {
  return AnalyticsRepository(ref.read(apiClientProvider));
});

class AnalyticsRepository {
  AnalyticsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<UsageSummary> fetchDailyUsage(String childId) async {
    final data =
        await _apiClient.get(
              '/usage/daily',
              queryParameters: {'childId': childId},
            )
            as Map<String, dynamic>;
    return UsageSummary.fromDailyJson(data);
  }

  Future<UsageSummary> fetchWeeklyUsage(String childId) async {
    final data =
        await _apiClient.get(
              '/usage/weekly',
              queryParameters: {'childId': childId},
            )
            as Map<String, dynamic>;
    return UsageSummary.fromWeeklyJson(data);
  }

  Future<UsageSummary> fetchDeviceUsage(String deviceId) async {
    final data =
        await _apiClient.get('/usage/device/$deviceId') as Map<String, dynamic>;
    return UsageSummary.fromDeviceJson(data);
  }

  Future<PeriodReport> fetchReport({
    required String period, // 'weekly' | 'monthly'
    String? childId,
    int offset = 0,
  }) async {
    final query = <String, dynamic>{'offset': '$offset'};
    if (childId != null) {
      query['childId'] = childId;
    }
    final data =
        await _apiClient.get('/reports/$period', queryParameters: query)
            as Map<String, dynamic>;
    return PeriodReport.fromJson(data);
  }
}
