import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/analytics/analytics_service.dart';
import 'package:parent_app/core/analytics/crash_reporting_service.dart';
import 'package:parent_app/core/network/api_exception.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';
import 'package:parent_app/features/dashboard/presentation/providers/dashboard_provider.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/features/notifications/presentation/providers/notifications_providers.dart';
import 'package:parent_app/features/sessions/presentation/providers/session_providers.dart';
import 'package:parent_app/features/settings/presentation/providers/settings_providers.dart';

import '../../../../core/storage/secure_storage_service.dart';
import '../../data/auth_repository.dart';
import '../../domain/app_session.dart';

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

class AuthState {
  const AuthState({
    required this.isBootstrapping,
    required this.isSubmitting,
    required this.hasCompletedOnboarding,
    required this.session,
    required this.errorMessage,
  });

  const AuthState.initial()
    : isBootstrapping = true,
      isSubmitting = false,
      hasCompletedOnboarding = false,
      session = null,
      errorMessage = null;

  final bool isBootstrapping;
  final bool isSubmitting;
  final bool hasCompletedOnboarding;
  final AppSession? session;
  final String? errorMessage;

  bool get isAuthenticated => session != null;

  AuthState copyWith({
    bool? isBootstrapping,
    bool? isSubmitting,
    bool? hasCompletedOnboarding,
    AppSession? session,
    bool clearSession = false,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AuthState(
      isBootstrapping: isBootstrapping ?? this.isBootstrapping,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      hasCompletedOnboarding:
          hasCompletedOnboarding ?? this.hasCompletedOnboarding,
      session: clearSession ? null : (session ?? this.session),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_restoreSession);
    return const AuthState.initial();
  }

  SecureStorageService get _storage => ref.read(secureStorageProvider);
  AuthRepository get _repository => ref.read(authRepositoryProvider);

  Future<void> _restoreSession() async {
    try {
      final storedSession = await _storage.readSession();
      final hasCompletedOnboarding = await _storage.readOnboardingComplete();
      if (storedSession != null) {
        CrashReportingService.instance.setUserId(storedSession.userId);
        AnalyticsService.instance.setUserId(storedSession.userId);
      }
      state = AuthState(
        isBootstrapping: false,
        isSubmitting: false,
        hasCompletedOnboarding: hasCompletedOnboarding,
        session: storedSession,
        errorMessage: null,
      );
    } catch (error, stack) {
      debugPrint('Failed to restore session: $error\n$stack');
      CrashReportingService.instance.report(error, stack, reason: 'restore_session');
      await _storage.clearSession();
      state = const AuthState(
        isBootstrapping: false,
        isSubmitting: false,
        hasCompletedOnboarding: false,
        session: null,
        errorMessage: null,
      );
    }
  }

  Future<bool> login({required String email, required String password}) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final session = await _repository.login(email: email, password: password);
      await _storage.saveSession(session);
      CrashReportingService.instance.setUserId(session.userId);
      AnalyticsService.instance.setUserId(session.userId);
      AnalyticsService.instance.loginSuccess(method: 'email_password');
      state = AuthState(
        isBootstrapping: false,
        isSubmitting: false,
        hasCompletedOnboarding: true,
        session: session,
        errorMessage: null,
      );
      return true;
    } catch (error) {
      final reason = error is ApiException ? error.message : error.toString();
      AnalyticsService.instance.loginFailed(reason: reason);
      state = state.copyWith(
        isSubmitting: false,
        errorMessage: reason,
      );
      return false;
    }
  }

  Future<bool> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final session = await _repository.register(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
      );
      await _storage.saveSession(session);
      CrashReportingService.instance.setUserId(session.userId);
      AnalyticsService.instance.setUserId(session.userId);
      AnalyticsService.instance.registerSuccess();
      state = AuthState(
        isBootstrapping: false,
        isSubmitting: false,
        hasCompletedOnboarding: true,
        session: session,
        errorMessage: null,
      );
      return true;
    } catch (error) {
      final reason = error is ApiException ? error.message : error.toString();
      AnalyticsService.instance.registerFailed(reason: reason);
      state = state.copyWith(
        isSubmitting: false,
        errorMessage: reason,
      );
      return false;
    }
  }

  Future<AppSession?> refreshSession() async {
    final existing = state.session ?? await _storage.readSession();
    if (existing == null || existing.refreshToken.isEmpty) {
      await clearSession();
      return null;
    }

    try {
      final refreshed = await _repository.refresh(existing.refreshToken);
      await _storage.saveSession(refreshed);
      state = state.copyWith(
        isBootstrapping: false,
        isSubmitting: false,
        session: refreshed,
        hasCompletedOnboarding: true,
        clearError: true,
      );
      return refreshed;
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  Future<void> logout() async {
    final existing = state.session;
    if (existing != null) {
      unawaited(_repository.logout(existing.accessToken));
    }
    AnalyticsService.instance.logout();
    await clearSession();
  }

  Future<void> clearSession() async {
    await _storage.clearSession();
    CrashReportingService.instance.clearUser();
    AnalyticsService.instance.clearUser();

    // Purge all cached user data from memory
    ref.invalidate(dashboardProvider);
    ref.invalidate(childrenListProvider);
    ref.invalidate(devicesListProvider);
    ref.invalidate(activeSessionsProvider);
    ref.invalidate(parentProfileProvider);
    ref.invalidate(subscriptionProvider);
    ref.invalidate(notificationsProvider);

    state = state.copyWith(
      isBootstrapping: false,
      isSubmitting: false,
      clearSession: true,
      clearError: true,
    );
  }

  Future<void> completeOnboarding() async {
    await _storage.setOnboardingComplete(true);
    state = state.copyWith(hasCompletedOnboarding: true);
  }

  void replaceSession(AppSession session) {
    state = state.copyWith(
      isBootstrapping: false,
      isSubmitting: false,
      session: session,
      hasCompletedOnboarding: true,
      clearError: true,
    );
  }
}
