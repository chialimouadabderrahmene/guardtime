class ProtectionScore {
  const ProtectionScore({
    required this.score,
    required this.level,
    required this.breakdown,
  });

  final int score;
  final String level;
  final Map<String, int> breakdown;

  factory ProtectionScore.fromJson(Map<String, dynamic> json) {
    return ProtectionScore(
      score: (json['score'] as num?)?.round() ?? 0,
      level: json['level'] as String? ?? 'LOW',
      breakdown: Map<String, int>.from(
        (json['breakdown'] as Map<String, dynamic>? ?? const {}).map(
          (key, value) => MapEntry(key, (value as num?)?.round() ?? 0),
        ),
      ),
    );
  }
}
