import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/child_model.dart';

final childrenRepositoryProvider = Provider<ChildrenRepository>((ref) {
  return ChildrenRepository(ref.read(apiClientProvider));
});

class ChildrenRepository {
  ChildrenRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<List<ChildModel>> fetchChildren() async {
    final data = await _apiClient.get('/children') as List<dynamic>;
    return data
        .whereType<Map<String, dynamic>>()
        .map(ChildModel.fromJson)
        .toList();
  }

  Future<ChildModel> fetchChild(String childId) async {
    final data =
        await _apiClient.get('/children/$childId') as Map<String, dynamic>;
    return ChildModel.fromJson(data);
  }

  Future<ChildModel> addChild({
    required String name,
    int? age,
    int? defaultLimitMinutes,
    String? avatar,
  }) async {
    final data =
        await _apiClient.post(
              '/children',
              data: {
                'name': name,
                'age': age,
                'defaultLimitMinutes': defaultLimitMinutes,
                'avatar': avatar,
              }..removeWhere((key, value) => value == null),
            )
            as Map<String, dynamic>;
    return ChildModel.fromJson(data);
  }

  Future<ChildModel> updateChild(
    String childId, {
    String? name,
    int? age,
    int? defaultLimitMinutes,
    String? avatar,
  }) async {
    final data =
        await _apiClient.patch(
              '/children/$childId',
              data: {
                'name': name,
                'age': age,
                'defaultLimitMinutes': defaultLimitMinutes,
                'avatar': avatar,
              }..removeWhere((key, value) => value == null),
            )
            as Map<String, dynamic>;
    return ChildModel.fromJson(data);
  }

  Future<void> deleteChild(String childId) async {
    await _apiClient.delete('/children/$childId');
  }
}
