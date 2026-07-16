import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_mark.dart';

/// Shared brand header for the login and signup screens — was
/// independently copy-pasted between the two before.
class AuthHeader extends StatelessWidget {
  const AuthHeader({super.key, required this.subtitle});

  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    return Column(
      children: [
        const BrandMark(size: 64).animate().scale(
          begin: const Offset(0.8, 0.8),
          end: const Offset(1.0, 1.0),
          duration: 500.ms,
          curve: Curves.easeOutBack,
        ),
        const SizedBox(height: AppSpacing.space16),
        ShaderMask(
          shaderCallback: (bounds) => colors.brandGradient.createShader(bounds),
          child: Text(
            'GuardTime',
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.space4 + 2),
        Text(
          subtitle,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// Shared "Don't have an account? Sign up" style footer link row.
class AuthSwitchLink extends StatelessWidget {
  const AuthSwitchLink({
    super.key,
    required this.leadingText,
    required this.actionText,
    required this.onTap,
  });

  final String leadingText;
  final String actionText;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return TextButton(
      onPressed: onTap,
      child: RichText(
        text: TextSpan(
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
          children: [
            TextSpan(text: leadingText),
            TextSpan(
              text: actionText,
              style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}
