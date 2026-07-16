import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/notification_item.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>((
  ref,
) {
  return NotificationsRepository(ref.read(apiClientProvider));
});

class NotificationsRepository {
  NotificationsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<NotificationItem>> fetchNotifications() async {
    final data = await _apiClient.get('/notifications') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(NotificationItem.fromJson)
        .toList();
  }

  Future<void> markRead(String notificationId) {
    return _apiClient.post('/notifications/$notificationId/read');
  }

  /// Registers this device's FCM token so the backend can deliver push
  /// notifications. [token] comes from the platform messaging SDK
  /// (firebase_messaging) once the app is connected to your Firebase project;
  /// [platform] is one of 'ios' | 'android' | 'web'.
  Future<void> registerPushToken({
    required String token,
    required String platform,
  }) {
    return _apiClient.post(
      '/push/tokens',
      data: {'token': token, 'platform': platform},
    );
  }

  /// Removes this device's FCM token (call on logout) so a shared device stops
  /// receiving another account's notifications.
  Future<void> unregisterPushToken(String token) {
    return _apiClient.delete('/push/tokens', data: {'token': token});
  }

  /// Whether the server currently has push delivery configured.
  Future<bool> pushDeliveryEnabled() async {
    final data = await _apiClient.get('/push/status') as Map<String, dynamic>;
    return data['deliveryEnabled'] as bool? ?? false;
  }
}
