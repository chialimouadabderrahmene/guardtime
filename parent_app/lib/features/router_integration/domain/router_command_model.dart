import 'package:parent_app/core/utils/model_utils.dart';

import 'router_capability_score_model.dart';

class RouterCommandModel {
  const RouterCommandModel({
    required this.id,
    required this.type,
    required this.status,
    required this.createdAt,
    this.deviceId,
    this.resultData,
    this.deliveredAt,
    this.ackedAt,
  });

  final String id;
  final String type;
  final String status; // PENDING | DELIVERED | ACKNOWLEDGED | FAILED
  final String? deviceId;
  final Map<String, dynamic>? resultData;
  final DateTime createdAt;
  final DateTime? deliveredAt;
  final DateTime? ackedAt;

  factory RouterCommandModel.fromJson(Map<String, dynamic> json) {
    final rawResult = json['resultData'];
    return RouterCommandModel(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      status: json['status'] as String? ?? 'PENDING',
      deviceId: json['deviceId'] as String?,
      resultData: rawResult is Map<String, dynamic> ? rawResult : null,
      createdAt: parseDateTime(json['createdAt']) ?? DateTime.now(),
      deliveredAt: parseDateTime(json['deliveredAt']),
      ackedAt: parseDateTime(json['ackedAt']),
    );
  }
}

class RouterDiagnosticsModel {
  const RouterDiagnosticsModel({required this.recentCommands, this.router, this.score});

  final Map<String, dynamic>? router;
  final List<RouterCommandModel> recentCommands;
  final RouterCapabilityScoreModel? score;

  factory RouterDiagnosticsModel.fromJson(Map<String, dynamic> json) {
    final routerJson = json['router'];
    final commandsJson = json['recentCommands'] as List<dynamic>? ?? const [];
    final scoreJson = json['score'];
    return RouterDiagnosticsModel(
      router: routerJson is Map<String, dynamic> ? routerJson : null,
      recentCommands: commandsJson
          .whereType<Map<String, dynamic>>()
          .map(RouterCommandModel.fromJson)
          .toList(),
      score: scoreJson is Map<String, dynamic> ? RouterCapabilityScoreModel.fromJson(scoreJson) : null,
    );
  }
}

class EndGamingSessionResult {
  const EndGamingSessionResult({
    required this.enqueued,
    required this.strategies,
    this.commandId,
    this.reason,
  });

  final bool enqueued;
  final String? commandId;
  final List<String> strategies;
  final String? reason;

  factory EndGamingSessionResult.fromJson(Map<String, dynamic> json) {
    return EndGamingSessionResult(
      enqueued: json['enqueued'] as bool? ?? false,
      commandId: json['commandId'] as String?,
      strategies: (json['strategies'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      reason: json['reason'] as String?,
    );
  }
}
