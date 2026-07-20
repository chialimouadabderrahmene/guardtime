import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/pairing_probe_service.dart';
import '../../data/pairing_repository.dart';
import '../../domain/pairing_models.dart';

final pairingProbeServiceProvider = Provider<PairingProbeService>((ref) {
  return PairingProbeService();
});

final connectionStatsProvider = FutureProvider.family<ConnectionStats, String>((
  ref,
  deviceId,
) async {
  return ref.read(pairingRepositoryProvider).getConnectionStats(deviceId);
});
