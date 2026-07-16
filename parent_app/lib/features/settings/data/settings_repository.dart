import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/network/api_client.dart';

import '../domain/parent_profile.dart';
import '../domain/subscription_info.dart';

final settingsRepositoryProvider = Provider<SettingsRepository>((ref) {
  return SettingsRepository(ref.read(apiClientProvider));
});

class SettingsRepository {
  SettingsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<ParentProfile> fetchProfile() async {
    final data =
        await _apiClient.get('/parents/profile') as Map<String, dynamic>;
    return ParentProfile.fromJson(data);
  }

  Future<SubscriptionInfo> fetchSubscription() async {
    final data =
        await _apiClient.get('/parents/subscription') as Map<String, dynamic>;
    return SubscriptionInfo.fromJson(data);
  }

  Future<ParentProfile> updateProfile({
    required String firstName,
    required String lastName,
  }) async {
    final data =
        await _apiClient.patch(
              '/parents/profile',
              data: {'firstName': firstName, 'lastName': lastName},
            )
            as Map<String, dynamic>;
    return ParentProfile.fromJson(data);
  }

  Future<void> deleteAccount() async {
    await _apiClient.delete('/parents/profile');
  }
}
