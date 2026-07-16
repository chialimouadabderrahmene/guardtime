class AppSession {
  const AppSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.role,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String role;

  factory AppSession.fromJson(Map<String, dynamic> json) {
    return AppSession(
      accessToken: json['accessToken'] as String? ?? '',
      refreshToken: json['refreshToken'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      role: json['role'] as String? ?? 'PARENT',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'userId': userId,
      'role': role,
    };
  }

  AppSession copyWith({
    String? accessToken,
    String? refreshToken,
    String? userId,
    String? role,
  }) {
    return AppSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      userId: userId ?? this.userId,
      role: role ?? this.role,
    );
  }
}
