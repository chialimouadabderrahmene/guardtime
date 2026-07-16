import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/session_model.dart';

final sessionsRepositoryProvider = Provider<SessionsRepository>((ref) {
  return SessionsRepository(ref.read(apiClientProvider));
});

class SessionsRepository {
  SessionsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<SessionModel>> fetchActiveSessions() async {
    final data = await _apiClient.get('/sessions/active') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(SessionModel.fromJson)
        .toList();
  }

  Future<List<SessionModel>> fetchHistory() async {
    final data = await _apiClient.get('/sessions/history') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(SessionModel.fromJson)
        .toList();
  }

  Future<SessionModel> startSession({
    required String deviceId,
    required int durationMinutes,
  }) async {
    final data =
        await _apiClient.post(
              '/sessions/start',
              data: {'deviceId': deviceId, 'durationMinutes': durationMinutes},
            )
            as Map<String, dynamic>;
    return SessionModel.fromJson(data);
  }

  Future<SessionModel> extendSession({
    required String sessionId,
    required int extraMinutes,
  }) async {
    final data =
        await _apiClient.post(
              '/sessions/$sessionId/extend',
              data: {'extraMinutes': extraMinutes},
            )
            as Map<String, dynamic>;
    return SessionModel.fromJson(data);
  }

  Future<SessionModel> stopSession(String sessionId) async {
    final data =
        await _apiClient.post('/sessions/$sessionId/stop')
            as Map<String, dynamic>;
    return SessionModel.fromJson(data);
  }
}
