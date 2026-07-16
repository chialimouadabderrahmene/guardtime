import 'dart:async';

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';

/// Analytics abstraction that forwards to Firebase Analytics when available,
/// and falls back to debug logging otherwise.
class AnalyticsService {
  static final AnalyticsService _instance = AnalyticsService._();
  static AnalyticsService get instance => _instance;

  bool _initialized = false;

  AnalyticsService._();

  /// Call after Firebase.initializeApp() succeeds.
  void markInitialized() => _initialized = true;

  void logEvent({
    required String name,
    Map<String, Object>? parameters,
  }) {
    if (kDebugMode) {
      debugPrint('[Analytics] $name params=$parameters');
    }
    if (_initialized) {
      unawaited(
        FirebaseAnalytics.instance.logEvent(
          name: name,
          parameters: parameters,
        ),
      );
    }
  }

  void setUserId(String userId) {
    if (_initialized) {
      unawaited(FirebaseAnalytics.instance.setUserId(id: userId));
    }
  }

  void clearUser() {
    if (_initialized) {
      unawaited(FirebaseAnalytics.instance.setUserId(id: null));
    }
  }

  // ─── Auth events ───

  void loginSuccess({required String method}) {
    logEvent(name: 'login_success', parameters: {'method': method});
  }

  void loginFailed({required String reason}) {
    logEvent(name: 'login_failed', parameters: {'reason': reason});
  }

  void registerSuccess() {
    logEvent(name: 'register_success');
  }

  void registerFailed({required String reason}) {
    logEvent(name: 'register_failed', parameters: {'reason': reason});
  }

  void logout() {
    logEvent(name: 'logout');
  }

  void deleteAccount({required String source}) {
    logEvent(name: 'delete_account', parameters: {'source': source});
  }

  void sessionStarted({required int durationMinutes, required String deviceType}) {
    logEvent(
      name: 'session_started',
      parameters: {
        'duration_minutes': durationMinutes,
        'device_type': deviceType,
      },
    );
  }

  void childAdded() {
    logEvent(name: 'child_added');
  }

  void deviceAdded({required String controlMethod}) {
    logEvent(name: 'device_added', parameters: {'control_method': controlMethod});
  }
}
