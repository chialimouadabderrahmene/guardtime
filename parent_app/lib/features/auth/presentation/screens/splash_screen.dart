import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/widgets/brand_mark.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return GuardTimeScaffold(
      useSafeArea: false,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandMark(size: 80, iconSize: 40).animate().scale(
              begin: const Offset(0.8, 0.8),
              end: const Offset(1.0, 1.0),
              duration: 600.ms,
              curve: Curves.easeOutBack,
            ),
            const SizedBox(height: 20),
            Text(
              'GuardTime',
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ).animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.2, end: 0),
            const SizedBox(height: 8),
            Text(
              'Family protection made simple',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ).animate().fadeIn(delay: 400.ms, duration: 400.ms),
            const SizedBox(height: 32),
            SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(scheme.primary),
              ),
            ).animate().fadeIn(delay: 600.ms, duration: 300.ms),
          ],
        ),
      ),
    );
  }
}
