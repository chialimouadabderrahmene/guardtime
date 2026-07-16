import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../features/auth/domain/app_session.dart';

final secureStorageProvider = Provider<SecureStorageService>((ref) {
  return const SecureStorageService();
});

class SecureStorageService {
  const SecureStorageService();

  static const _sessionKey = 'guardtime_session';
  static const _onboardingKey = 'guardtime_onboarding_complete';
  static const _storage = FlutterSecureStorage();

  Future<void> saveSession(AppSession session) {
    return _storage.write(
      key: _sessionKey,
      value: jsonEncode(session.toJson()),
    );
  }

  Future<AppSession?> readSession() async {
    try {
      final raw = await _storage.read(key: _sessionKey);
      if (raw == null || raw.isEmpty) {
        return null;
      }
      return AppSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // Corrupt storage — wipe so the app doesn't crash loop
      await clearSession();
      return null;
    }
  }

  Future<void> clearSession() {
    return _storage.delete(key: _sessionKey);
  }

  Future<void> setOnboardingComplete(bool value) {
    return _storage.write(key: _onboardingKey, value: value ? 'true' : 'false');
  }

  Future<bool> readOnboardingComplete() async {
    final raw = await _storage.read(key: _onboardingKey);
    return raw == 'true';
  }
}
