import 'package:parent_app/core/utils/model_utils.dart';

import '../../devices/domain/device_model.dart';

class ChildModel {
  const ChildModel({
    required this.id,
    required this.parentId,
    required this.name,
    required this.avatar,
    required this.age,
    required this.defaultLimitMinutes,
    required this.devices,
  });

  final String id;
  final String parentId;
  final String name;
  final String? avatar;
  final int? age;
  final int? defaultLimitMinutes;
  final List<DeviceModel> devices;

  factory ChildModel.fromJson(Map<String, dynamic> json) {
    final devicesJson = json['devices'] as List<dynamic>? ?? const [];
    return ChildModel(
      id: json['id'] as String? ?? '',
      parentId: json['parentId'] as String? ?? '',
      name: json['name'] as String? ?? '',
      avatar: json['avatar'] as String?,
      age: parseNullableInt(json['age']),
      defaultLimitMinutes: parseNullableInt(
        json['defaultLimit'] ?? json['defaultLimitMinutes'],
      ),
      devices: devicesJson
          .whereType<Map<String, dynamic>>()
          .map(DeviceModel.fromJson)
          .toList(),
    );
  }
}
