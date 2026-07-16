import 'package:flutter/material.dart';
import 'package:parent_app/core/theme/app_colors.dart';

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.foregroundColor,
    this.icon,
  });

  final String label;
  final Color color;
  final Color? foregroundColor;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final textColor = foregroundColor ?? color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.32)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: textColor),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style:
                Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: textColor) ??
                TextStyle(color: textColor),
          ),
        ],
      ),
    );
  }
}

class ConnectedBadge extends StatelessWidget {
  const ConnectedBadge({
    super.key,
    required this.connected,
    this.connectedLabel = 'Connected',
    this.disconnectedLabel = 'Disconnected',
  });

  final bool connected;
  final String connectedLabel;
  final String disconnectedLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return StatusBadge(
      label: connected ? connectedLabel : disconnectedLabel,
      color: connected ? colors.success : colors.warning,
      icon: connected ? Icons.check_circle_rounded : Icons.error_rounded,
    );
  }
}
