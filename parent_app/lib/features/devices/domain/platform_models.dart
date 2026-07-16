class SupportMatrixItem {
  const SupportMatrixItem({
    required this.deviceType,
    required this.onlineControl,
    required this.offlineControlSupported,
    required this.offlineControlMethod,
    required this.recommendedControlMethod,
    required this.notes,
  });

  final String deviceType;
  final bool onlineControl;
  final bool offlineControlSupported;
  final String offlineControlMethod;
  final String recommendedControlMethod;
  final String notes;

  factory SupportMatrixItem.fromJson(Map<String, dynamic> json) {
    return SupportMatrixItem(
      deviceType: json['deviceType'] as String? ?? 'OTHER',
      onlineControl: json['onlineControl'] as bool? ?? false,
      offlineControlSupported:
          json['offlineControlSupported'] as bool? ?? false,
      offlineControlMethod:
          json['offlineControlMethod'] as String? ?? 'NOT_SUPPORTED',
      recommendedControlMethod:
          json['recommendedControlMethod'] as String? ?? '',
      notes: json['notes'] as String? ?? '',
    );
  }
}

class GuideStep {
  const GuideStep({
    required this.step,
    required this.title,
    required this.description,
  });

  final int step;
  final String title;
  final String description;

  factory GuideStep.fromJson(Map<String, dynamic> json) {
    return GuideStep(
      step: json['step'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
    );
  }
}

class PlatformGuide {
  const PlatformGuide({
    required this.platform,
    required this.title,
    required this.steps,
    required this.videoUrl,
    this.summary,
    this.caveats = const [],
  });

  final String platform;
  final String title;
  final List<GuideStep> steps;
  final String? videoUrl;
  final String? summary;
  final List<String> caveats;

  factory PlatformGuide.fromJson(Map<String, dynamic> json) {
    return PlatformGuide(
      platform: json['platform'] as String? ?? '',
      title: json['title'] as String? ?? '',
      steps: (json['steps'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(GuideStep.fromJson)
          .toList(),
      videoUrl: json['videoUrl'] as String?,
      summary: json['summary'] as String?,
      caveats: (json['caveats'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }
}

class OfflineGuide {
  const OfflineGuide({
    required this.deviceType,
    required this.method,
    required this.title,
    required this.steps,
    required this.limitations,
    required this.officialUrl,
  });

  final String deviceType;
  final String method;
  final String title;
  final List<String> steps;
  final List<String> limitations;
  final String officialUrl;

  factory OfflineGuide.fromJson(Map<String, dynamic> json) {
    return OfflineGuide(
      deviceType: json['deviceType'] as String? ?? '',
      method: json['method'] as String? ?? '',
      title: json['title'] as String? ?? '',
      steps: (json['steps'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      limitations: (json['limitations'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      officialUrl: json['officialUrl'] as String? ?? '',
    );
  }
}
