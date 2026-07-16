import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

enum SnackbarType { info, success, error }

/// Single helper for showing a themed snackbar — replaces the six-plus
/// near-identical inline `SnackBar(...)` constructions scattered across
/// auth, children, devices, and sessions screens.
void showAppSnackbar(
  BuildContext context,
  String message, {
  SnackbarType type = SnackbarType.info,
}) {
  final colors = context.colors;
  final scheme = context.scheme;

  final (icon, color) = switch (type) {
    SnackbarType.success => (Icons.check_circle_rounded, colors.success),
    SnackbarType.error => (Icons.error_rounded, scheme.error),
    SnackbarType.info => (Icons.info_rounded, scheme.primary),
  };

  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: AppSpacing.space12),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
}
