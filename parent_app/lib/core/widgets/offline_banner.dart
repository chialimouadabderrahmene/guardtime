import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/connectivity_provider.dart';
import '../theme/app_colors.dart';

/// Shows a persistent banner at the top when the device is offline.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(connectivityProvider);
    if (status != ConnectivityStatus.offline) {
      return const SizedBox.shrink();
    }

    final colors = context.colors;

    return Material(
      color: colors.warning,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            children: [
              const Icon(Icons.cloud_off_rounded, size: 18, color: Colors.black87),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'You are offline. Some features may be unavailable.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.black87,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
