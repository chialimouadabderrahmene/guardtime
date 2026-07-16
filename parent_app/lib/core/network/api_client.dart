import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/auth_repository.dart';
import 'api_exception.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.read(publicDioProvider));
});

class ApiClient {
  ApiClient(this._dio);

  static const _maxRetries = 2;
  static const _retryableStatuses = {500, 502, 503};

  final Dio _dio;

  Future<dynamic> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    bool requiresAuth = true,
  }) {
    return _request(
      'GET',
      path,
      queryParameters: queryParameters,
      requiresAuth: requiresAuth,
    );
  }

  Future<dynamic> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    bool requiresAuth = true,
  }) {
    return _request(
      'POST',
      path,
      data: data,
      queryParameters: queryParameters,
      requiresAuth: requiresAuth,
    );
  }

  Future<dynamic> patch(String path, {dynamic data, bool requiresAuth = true}) {
    return _request('PATCH', path, data: data, requiresAuth: requiresAuth);
  }

  Future<dynamic> delete(String path, {dynamic data, bool requiresAuth = true}) {
    return _request('DELETE', path, data: data, requiresAuth: requiresAuth);
  }

  Future<dynamic> _request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    bool requiresAuth = true,
    int attempt = 0,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: Options(method: method, extra: {'requiresAuth': requiresAuth}),
      );
      return response.data;
    } on DioException catch (error) {
      final status = error.response?.statusCode;

      // Retry on transient server errors (500, 502, 503) up to _maxRetries
      if (status != null &&
          _retryableStatuses.contains(status) &&
          attempt < _maxRetries) {
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
        return _request(
          method,
          path,
          data: data,
          queryParameters: queryParameters,
          requiresAuth: requiresAuth,
          attempt: attempt + 1,
        );
      }

      // 401 is already handled by the interceptor in auth_repository.dart
      // (token refresh + retry). If we still get here, the interceptor failed.
      // 403 means forbidden — map to a clear message.
      throw ApiException.fromDio(error);
    }
  }
}
