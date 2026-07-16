import 'package:parent_app/core/utils/model_utils.dart';

class OfflineChecklist {
  const OfflineChecklist({
    required this.pinEnabled,
    required this.childAccountLinked,
    required this.playTimeLimitEnabled,
    required this.ageRatingEnabled,
    required this.purchasesBlocked,
    required this.networkSettingsLocked,
    required this.notes,
  });

  final bool pinEnabled;
  final bool childAccountLinked;
  final bool playTimeLimitEnabled;
  final bool ageRatingEnabled;
  final bool purchasesBlocked;
  final bool networkSettingsLocked;
  final String? notes;

  factory OfflineChecklist.fromJson(Map<String, dynamic> json) {
    return OfflineChecklist(
      pinEnabled: json['pinEnabled'] as bool? ?? false,
      childAccountLinked: json['childAccountLinked'] as bool? ?? false,
      playTimeLimitEnabled: json['playTimeLimitEnabled'] as bool? ?? false,
      ageRatingEnabled: json['ageRatingEnabled'] as bool? ?? false,
      purchasesBlocked: json['purchasesBlocked'] as bool? ?? false,
      networkSettingsLocked: json['networkSettingsLocked'] as bool? ?? false,
      notes: json['notes'] as String?,
    );
  }
}

class OfflineControlStatus {
  const OfflineControlStatus({
    required this.deviceId,
    required this.deviceType,
    required this.onlineControlSupported,
    required this.offlineControlSupported,
    required this.offlineControlMethod,
    required this.offlineControlEnabled,
    required this.offlineSetupCompletedAt,
    required this.offlineSetupVerified,
    required this.protectionStatus,
    required this.checklist,
    required this.checklistCompletedCount,
    required this.setupRequired,
    required this.limitations,
    required this.recommendedNextStep,
  });

  final String deviceId;
  final String deviceType;
  final bool onlineControlSupported;
  final bool offlineControlSupported;
  final String? offlineControlMethod;
  final bool offlineControlEnabled;
  final DateTime? offlineSetupCompletedAt;
  final bool offlineSetupVerified;
  final String protectionStatus;
  final OfflineChecklist? checklist;
  final int checklistCompletedCount;
  final bool setupRequired;
  final List<String> limitations;
  final String recommendedNextStep;

  factory OfflineControlStatus.fromJson(Map<String, dynamic> json) {
    return OfflineControlStatus(
      deviceId: json['deviceId'] as String? ?? '',
      deviceType: json['deviceType'] as String? ?? 'OTHER',
      onlineControlSupported: json['onlineControlSupported'] as bool? ?? false,
      offlineControlSupported:
          json['offlineControlSupported'] as bool? ?? false,
      offlineControlMethod: json['offlineControlMethod'] as String?,
      offlineControlEnabled: json['offlineControlEnabled'] as bool? ?? false,
      offlineSetupCompletedAt: parseDateTime(json['offlineSetupCompletedAt']),
      offlineSetupVerified: json['offlineSetupVerified'] as bool? ?? false,
      protectionStatus: json['protectionStatus'] as String? ?? 'NORMAL',
      checklist: json['checklist'] is Map<String, dynamic>
          ? OfflineChecklist.fromJson(json['checklist'] as Map<String, dynamic>)
          : null,
      checklistCompletedCount:
          parseNullableInt(json['checklistCompletedCount']) ?? 0,
      setupRequired: json['setupRequired'] as bool? ?? true,
      limitations: (json['limitations'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      recommendedNextStep: json['recommendedNextStep'] as String? ?? '',
    );
  }
}
