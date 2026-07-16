import 'package:parent_app/core/utils/model_utils.dart';

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.read,
    required this.createdAt,
    this.deviceId,
    this.childId,
    this.sessionId,
  });

  final String id;
  final String type;
  final String title;
  final String message;
  final bool read;
  final DateTime? createdAt;
  final String? deviceId;
  final String? childId;
  final String? sessionId;

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      title: json['title'] as String? ?? '',
      message: json['message'] as String? ?? '',
      read: json['read'] as bool? ?? false,
      createdAt: parseDateTime(json['createdAt']),
      deviceId: json['deviceId'] as String?,
      childId: json['childId'] as String?,
      sessionId: json['sessionId'] as String?,
    );
  }
}
