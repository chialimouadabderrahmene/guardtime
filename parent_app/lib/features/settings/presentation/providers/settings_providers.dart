import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/features/settings/data/settings_repository.dart';
import 'package:parent_app/features/settings/domain/parent_profile.dart';
import 'package:parent_app/features/settings/domain/subscription_info.dart';

final parentProfileProvider = FutureProvider<ParentProfile>((ref) async {
  return ref.read(settingsRepositoryProvider).fetchProfile();
});

final subscriptionProvider = FutureProvider<SubscriptionInfo>((ref) async {
  return ref.read(settingsRepositoryProvider).fetchSubscription();
});
