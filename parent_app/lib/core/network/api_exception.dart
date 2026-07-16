import 'package:dio/dio.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  factory ApiException.fromDio(DioException error) {
    final response = error.response;
    final data = response?.data;
    if (data is Map<String, dynamic>) {
      final message = data['message'];
      if (message is String) {
        return ApiException(message, statusCode: response?.statusCode);
      }
      if (message is List && message.isNotEmpty) {
        return ApiException(
          message.first.toString(),
          statusCode: response?.statusCode,
        );
      }
    }

    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return ApiException('Connection timed out. Please try again.',
          statusCode: response?.statusCode);
    }

    if (error.type == DioExceptionType.connectionError) {
      return ApiException(
          'No internet connection. Check your network and try again.');
    }

    final code = response?.statusCode;
    if (code == 403) {
      return ApiException(
          'Access denied. Your session may have expired — please sign in again.',
          statusCode: 403);
    }
    if (code == 503 || code == 502) {
      return ApiException(
          'GuardTime servers are temporarily unavailable. Please try again shortly.',
          statusCode: code);
    }

    return ApiException(
      response?.statusMessage ?? error.message ?? 'Unexpected network error.',
      statusCode: code,
    );
  }

  @override
  String toString() =>
      'ApiException(statusCode: $statusCode, message: $message)';
}
