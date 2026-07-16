import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/notifications/data/notifications_repository.dart';
import 'package:parent_app/features/notifications/domain/notification_item.dart';

final notificationsProvider = FutureProvider<List<NotificationItem>>((
  ref,
) async {
  return ref.read(notificationsRepositoryProvider).fetchNotifications();
});
