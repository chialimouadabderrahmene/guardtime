/// Mirrors backend's RouterCapabilityScore (router-capability-score.service.ts)
/// — the single, centralized scoring engine. Never recomputed client-side;
/// this model only parses what the backend already calculated.
class CapabilityScoreCategory {
  const CapabilityScoreCategory({
    required this.key,
    required this.label,
    required this.weight,
    required this.earned,
    required this.supported,
    required this.reasoning,
  });

  final String key;
  final String label;
  final int weight;
  final int earned;
  final bool supported;
  final String reasoning;

  factory CapabilityScoreCategory.fromJson(Map<String, dynamic> json) {
    return CapabilityScoreCategory(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      weight: json['weight'] as int? ?? 0,
      earned: json['earned'] as int? ?? 0,
      supported: json['supported'] as bool? ?? false,
      reasoning: json['reasoning'] as String? ?? '',
    );
  }
}

enum SupportLevel { fullSupport, excellent, good, limited, basic, unsupported }

SupportLevel _levelFromJson(String? value) {
  switch (value) {
    case 'FULL_SUPPORT':
      return SupportLevel.fullSupport;
    case 'EXCELLENT':
      return SupportLevel.excellent;
    case 'GOOD':
      return SupportLevel.good;
    case 'LIMITED':
      return SupportLevel.limited;
    case 'BASIC':
      return SupportLevel.basic;
    default:
      return SupportLevel.unsupported;
  }
}

class RouterCapabilityScoreModel {
  const RouterCapabilityScoreModel({
    required this.score,
    required this.maxScore,
    required this.level,
    required this.stars,
    required this.badge,
    required this.supportedFeatures,
    required this.unsupportedFeatures,
    required this.breakdown,
    required this.recommendations,
  });

  final int score;
  final int maxScore;
  final SupportLevel level;
  final int stars;
  final String badge;
  final List<String> supportedFeatures;
  final List<String> unsupportedFeatures;
  final List<CapabilityScoreCategory> breakdown;
  final List<String> recommendations;

  factory RouterCapabilityScoreModel.fromJson(Map<String, dynamic> json) {
    return RouterCapabilityScoreModel(
      score: json['score'] as int? ?? 0,
      maxScore: json['maxScore'] as int? ?? 100,
      level: _levelFromJson(json['level'] as String?),
      stars: json['stars'] as int? ?? 0,
      badge: json['badge'] as String? ?? '☆☆☆☆☆ Unsupported',
      supportedFeatures: (json['supportedFeatures'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      unsupportedFeatures: (json['unsupportedFeatures'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      breakdown: (json['breakdown'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(CapabilityScoreCategory.fromJson)
              .toList() ??
          const [],
      recommendations: (json['recommendations'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
    );
  }
}
