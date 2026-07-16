import 'package:flutter/material.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/features/devices/domain/device_health.dart';
import 'package:parent_app/shared/widgets/status_badge.dart';

/// Visual mapping for a [DeviceHealthState]. Colours come from the theme /
/// semantic tokens so light and dark modes both stay correct.
({IconData icon, String label, Color color}) healthVisual(
  BuildContext context,
  DeviceHealthState state,
) {
  final scheme = context.scheme;
  final colors = context.colors;
  switch (state) {
    case DeviceHealthState.verified:
      return (icon: Icons.verified_user_rounded, label: 'Protected', color: colors.success);
    case DeviceHealthState.needsAttention:
      return (icon: Icons.gpp_maybe_rounded, label: 'Needs attention', color: scheme.error);
    case DeviceHealthState.neverVerified:
      return (icon: Icons.help_outline_rounded, label: 'Not verified', color: colors.warning);
    case DeviceHealthState.notConfigured:
      return (icon: Icons.settings_suggest_rounded, label: 'Not set up', color: scheme.onSurfaceVariant);
    case DeviceHealthState.idle:
      return (icon: Icons.nights_stay_rounded, label: 'Idle', color: scheme.onSurfaceVariant);
    case DeviceHealthState.unknown:
      return (icon: Icons.device_unknown_rounded, label: 'Unknown', color: scheme.onSurfaceVariant);
  }
}

/// Compact pill showing a device's protection-health state.
class HealthStatusBadge extends StatelessWidget {
  const HealthStatusBadge({super.key, required this.state});

  final DeviceHealthState state;

  @override
  Widget build(BuildContext context) {
    final v = healthVisual(context, state);
    return StatusBadge(label: v.label, color: v.color, icon: v.icon);
  }
}
