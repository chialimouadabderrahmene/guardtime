import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Periodically pings the API host to determine connectivity.
/// Avoids adding a `connectivity_plus` dependency.
final connectivityProvider =
    StateNotifierProvider<ConnectivityNotifier, ConnectivityStatus>((ref) {
  return ConnectivityNotifier();
});

enum ConnectivityStatus { online, offline, unknown }

class ConnectivityNotifier extends StateNotifier<ConnectivityStatus> {
  ConnectivityNotifier() : super(ConnectivityStatus.unknown) {
    _check();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _check());
  }

  Timer? _timer;

  Future<void> _check() async {
    try {
      final result = await InternetAddress.lookup('google.com')
          .timeout(const Duration(seconds: 5));
      if (result.isNotEmpty && result.first.rawAddress.isNotEmpty) {
        if (state != ConnectivityStatus.online) {
          state = ConnectivityStatus.online;
        }
      } else {
        state = ConnectivityStatus.offline;
      }
    } catch (_) {
      if (state != ConnectivityStatus.offline) {
        state = ConnectivityStatus.offline;
        debugPrint('ConnectivityNotifier: device appears offline');
      }
    }
  }

  /// Manual re-check (e.g. after user taps "retry")
  Future<void> recheck() => _check();

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
