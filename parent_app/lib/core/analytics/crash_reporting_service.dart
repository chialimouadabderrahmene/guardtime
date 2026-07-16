import 'dart:async';

import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Crash reporting abstraction that forwards to Firebase Crashlytics when
/// available, and falls back to debug logging otherwise.
class CrashReportingService {
  static final CrashReportingService _instance = CrashReportingService._();
  static CrashReportingService get instance => _instance;

  bool _initialized = false;

  CrashReportingService._();

  /// Call after Firebase.initializeApp() succeeds.
  void markInitialized() => _initialized = true;

  void report(Object error, StackTrace? stack, {String? reason}) {
    if (kDebugMode) {
      debugPrint('[$reason] $error\n$stack');
    }
    if (_initialized) {
      unawaited(
        FirebaseCrashlytics.instance.recordError(
          error,
          stack,
          reason: reason,
          fatal: false,
        ),
      );
    }
  }

  void reportFatal(Object error, StackTrace? stack, {String? reason}) {
    if (kDebugMode) {
      debugPrint('[FATAL: $reason] $error\n$stack');
    }
    if (_initialized) {
      unawaited(
        FirebaseCrashlytics.instance.recordError(
          error,
          stack,
          reason: reason,
          fatal: true,
        ),
      );
    }
  }

  void log(String message) {
    if (kDebugMode) {
      debugPrint('[Crashlytics] $message');
    }
    if (_initialized) {
      unawaited(FirebaseCrashlytics.instance.log(message));
    }
  }

  void setUserId(String userId) {
    if (_initialized) {
      unawaited(FirebaseCrashlytics.instance.setUserIdentifier(userId));
    }
  }

  void clearUser() {
    if (_initialized) {
      unawaited(FirebaseCrashlytics.instance.setUserIdentifier(''));
    }
  }
}
