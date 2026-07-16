class ParentProfile {
  const ParentProfile({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
  });

  final String id;
  final String email;
  final String? firstName;
  final String? lastName;

  String get displayName {
    final fullName = [firstName, lastName]
        .whereType<String>()
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .join(' ');
    return fullName.isEmpty ? 'GuardTime Parent' : fullName;
  }

  factory ParentProfile.fromJson(Map<String, dynamic> json) {
    return ParentProfile(
      id: json['id'] as String? ?? '',
      email: json['email'] as String? ?? '',
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
    );
  }
}
