import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/network/api_exception.dart';
import 'package:parent_app/core/storage/secure_storage_service.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';

import '../domain/app_session.dart';

final publicDioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    ),
  );

  final refreshDio = Dio(dio.options);
  final storage = ref.read(secureStorageProvider);

  if (kDebugMode) {
    dio.interceptors.add(
      LogInterceptor(
        requestBody: true,
        responseBody: false,
        requestHeader: false,
        responseHeader: false,
      ),
    );
  }

  dio.interceptors.add(
    QueuedInterceptorsWrapper(
      onRequest: (options, handler) async {
        final requiresAuth =
            options.extra['requiresAuth'] as bool? ??
            !_isAuthPath(options.path);
        if (!requiresAuth) {
          return handler.next(options);
        }

        final session =
            ref.read(authControllerProvider).session ??
            await storage.readSession();
        if (session != null && session.accessToken.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer ${session.accessToken}';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        final requiresAuth =
            options.extra['requiresAuth'] as bool? ??
            !_isAuthPath(options.path);
        final alreadyRetried = options.extra['retried'] == true;

        if (!requiresAuth ||
            alreadyRetried ||
            error.response?.statusCode != 401) {
          return handler.next(error);
        }

        final session =
            ref.read(authControllerProvider).session ??
            await storage.readSession();
        if (session == null || session.refreshToken.isEmpty) {
          await ref.read(authControllerProvider.notifier).clearSession();
          return handler.next(error);
        }

        try {
          final refreshResponse = await refreshDio.post<dynamic>(
            '/auth/refresh',
            data: {'refreshToken': session.refreshToken},
          );
          final refreshed = AppSession.fromJson(
            refreshResponse.data as Map<String, dynamic>,
          );
          await storage.saveSession(refreshed);
          ref.read(authControllerProvider.notifier).replaceSession(refreshed);

          final retryResponse = await dio.fetch<dynamic>(
            options.copyWith(
              headers: {
                ...options.headers,
                'Authorization': 'Bearer ${refreshed.accessToken}',
              },
              extra: {...options.extra, 'retried': true},
            ),
          );
          return handler.resolve(retryResponse);
        } on DioException {
          await ref.read(authControllerProvider.notifier).clearSession();
          return handler.next(error);
        }
      },
    ),
  );

  return dio;
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.read(publicDioProvider));
});

class AuthRepository {
  AuthRepository(this._dio);

  final Dio _dio;

  Future<AppSession> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/login',
        data: {'email': email, 'password': password},
      );
      return AppSession.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<AppSession> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          'firstName': firstName,
          'lastName': lastName,
          'role': 'PARENT',
        },
      );
      return AppSession.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<AppSession> refresh(String refreshToken) async {
    try {
      final response = await _dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      return AppSession.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<void> logout(String accessToken) async {
    try {
      await _dio.post<dynamic>(
        '/auth/logout',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );
    } on DioException catch (_) {
      // Local logout should still proceed if the network call fails.
    }
  }
}

bool _isAuthPath(String path) {
  return path.startsWith('/auth/');
}
