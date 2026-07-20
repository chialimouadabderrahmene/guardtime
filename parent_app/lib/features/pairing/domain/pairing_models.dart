import 'package:parent_app/core/utils/model_utils.dart';

class PairingStartResult {
  const PairingStartResult({
    required this.sessionId,
    required this.dnsServer,
    required this.token,
    required this.expiresAt,
    required this.qrPayload,
  });

  final String sessionId;
  final String dnsServer;
  final String token;
  final DateTime? expiresAt;
  final String qrPayload;

  factory PairingStartResult.fromJson(Map<String, dynamic> json) {
    return PairingStartResult(
      sessionId: json['sessionId'] as String? ?? '',
      dnsServer: json['dnsServer'] as String? ?? '',
      token: json['token'] as String? ?? '',
      expiresAt: parseDateTime(json['expiresAt']),
      qrPayload: json['qrPayload'] as String? ?? '',
    );
  }
}

enum PairStatus { waiting, paired, expired, failed }

PairStatus _parsePairStatus(dynamic value) {
  switch (value) {
    case 'PAIRED':
      return PairStatus.paired;
    case 'EXPIRED':
      return PairStatus.expired;
    case 'FAILED':
      return PairStatus.failed;
    default:
      return PairStatus.waiting;
  }
}

enum ConnectionQuality { excellent, good, poor, offline }

ConnectionQuality _parseConnectionQuality(dynamic value) {
  switch (value) {
    case 'EXCELLENT':
      return ConnectionQuality.excellent;
    case 'GOOD':
      return ConnectionQuality.good;
    case 'POOR':
      return ConnectionQuality.poor;
    default:
      return ConnectionQuality.offline;
  }
}

class PairingStatus {
  const PairingStatus({
    required this.pairStatus,
    required this.paired,
    required this.pairedAt,
    required this.dnsSourceIp,
    required this.publicIp,
    required this.resolverRegion,
    required this.lastDnsSeenAt,
    required this.connectionQuality,
    required this.beaconToken,
  });

  final PairStatus pairStatus;
  final bool paired;
  final DateTime? pairedAt;
  final String? dnsSourceIp;
  final String? publicIp;
  final String? resolverRegion;
  final DateTime? lastDnsSeenAt;
  final ConnectionQuality connectionQuality;
  final String? beaconToken;

  factory PairingStatus.fromJson(Map<String, dynamic> json) {
    return PairingStatus(
      pairStatus: _parsePairStatus(json['pairStatus']),
      paired: json['paired'] as bool? ?? false,
      pairedAt: parseDateTime(json['pairedAt']),
      dnsSourceIp: json['dnsSourceIp'] as String?,
      publicIp: json['publicIp'] as String?,
      resolverRegion: json['resolverRegion'] as String?,
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      connectionQuality: _parseConnectionQuality(json['connectionQuality']),
      beaconToken: json['beaconToken'] as String?,
    );
  }
}

class ConnectionEvent {
  const ConnectionEvent({
    required this.id,
    required this.type,
    required this.ipAddress,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String? ipAddress;
  final DateTime? createdAt;

  factory ConnectionEvent.fromJson(Map<String, dynamic> json) {
    return ConnectionEvent(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? '',
      ipAddress: json['ipAddress'] as String?,
      createdAt: parseDateTime(json['createdAt']),
    );
  }
}

class IpHistoryEntry {
  const IpHistoryEntry({
    required this.ipAddress,
    required this.firstSeenAt,
    required this.lastSeenAt,
  });

  final String ipAddress;
  final DateTime? firstSeenAt;
  final DateTime? lastSeenAt;

  factory IpHistoryEntry.fromJson(Map<String, dynamic> json) {
    return IpHistoryEntry(
      ipAddress: json['ipAddress'] as String? ?? '',
      firstSeenAt: parseDateTime(json['firstSeenAt']),
      lastSeenAt: parseDateTime(json['lastSeenAt']),
    );
  }
}

class ConnectionStats {
  const ConnectionStats({
    required this.paired,
    required this.connectionQuality,
    required this.lastDnsSeenAt,
    required this.dnsSourceIp,
    required this.publicIp,
    required this.resolverRegion,
    required this.queriesToday,
    required this.lastQueryDomain,
    required this.recentEvents,
    required this.ipHistory,
  });

  final bool paired;
  final ConnectionQuality connectionQuality;
  final DateTime? lastDnsSeenAt;
  final String? dnsSourceIp;
  final String? publicIp;
  final String? resolverRegion;
  final int queriesToday;
  final String? lastQueryDomain;
  final List<ConnectionEvent> recentEvents;
  final List<IpHistoryEntry> ipHistory;

  factory ConnectionStats.fromJson(Map<String, dynamic> json) {
    return ConnectionStats(
      paired: json['paired'] as bool? ?? false,
      connectionQuality: _parseConnectionQuality(json['connectionQuality']),
      lastDnsSeenAt: parseDateTime(json['lastDnsSeenAt']),
      dnsSourceIp: json['dnsSourceIp'] as String?,
      publicIp: json['publicIp'] as String?,
      resolverRegion: json['resolverRegion'] as String?,
      queriesToday: parseNullableInt(json['queriesToday']) ?? 0,
      lastQueryDomain: json['lastQueryDomain'] as String?,
      recentEvents: (json['recentEvents'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(ConnectionEvent.fromJson)
          .toList(),
      ipHistory: (json['ipHistory'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(IpHistoryEntry.fromJson)
          .toList(),
    );
  }
}
