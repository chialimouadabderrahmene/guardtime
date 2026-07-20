import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';

/// Shared card chrome for all three onboarding illustrations — same
/// surface, radius, and ambient shadow so the three slides read as one
/// consistent set rather than three different treatments.
class _IllustrationCard extends StatelessWidget {
  const _IllustrationCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    return Container(
      width: 280,
      padding: const EdgeInsets.all(AppSpacing.space20),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.4)),
        boxShadow: [
          BoxShadow(
            color: colors.ambientShadow,
            blurRadius: AppElevation.level3.blur,
            offset: Offset(0, AppElevation.level3.dy),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.icon, required this.label, required this.value, required this.tint});

  final IconData icon;
  final String label;
  final String value;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.space8),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(color: tint.withValues(alpha: 0.14), shape: BoxShape.circle),
            child: Icon(icon, size: 16, color: tint),
          ),
          const SizedBox(width: AppSpacing.space12),
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
          Text(
            value,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Slide 1 — a small illustrative weekly-activity chart, mirroring the
/// "Family Overview" concept in the reference mockup, rendered in the
/// app's real brand green instead of purple. Values are a fixed
/// illustrative shape, not live data — this is onboarding marketing, not
/// a dashboard.
class WeeklyActivityIllustration extends StatelessWidget {
  const WeeklyActivityIllustration({super.key});

  static const _points = [0.35, 0.55, 0.4, 0.8, 0.5, 0.45, 0.65];
  static const _days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return _IllustrationCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'This Week',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Icon(Icons.trending_up_rounded, size: 18, color: scheme.primary),
            ],
          ),
          const SizedBox(height: AppSpacing.space16),
          SizedBox(
            height: 84,
            child: CustomPaint(
              size: const Size.fromHeight(84),
              painter: _MiniChartPainter(
                points: _points,
                lineColor: scheme.primary,
                fillColor: scheme.primary,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.space8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (final d in _days)
                Text(d, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
          const Divider(height: AppSpacing.space24),
          _StatRow(icon: Icons.shield_rounded, label: 'Devices protected', value: '4', tint: scheme.primary),
          _StatRow(icon: Icons.block_rounded, label: 'Risks blocked', value: '18', tint: context.colors.warning),
        ],
      ),
    );
  }
}

class _MiniChartPainter extends CustomPainter {
  _MiniChartPainter({required this.points, required this.lineColor, required this.fillColor});

  final List<double> points;
  final Color lineColor;
  final Color fillColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final dx = size.width / (points.length - 1);
    final path = Path();
    final fillPath = Path();

    for (var i = 0; i < points.length; i++) {
      final x = dx * i;
      final y = size.height * (1 - points[i]);
      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        final prevX = dx * (i - 1);
        final prevY = size.height * (1 - points[i - 1]);
        final ctrlX = (prevX + x) / 2;
        path.cubicTo(ctrlX, prevY, ctrlX, y, x, y);
        fillPath.cubicTo(ctrlX, prevY, ctrlX, y, x, y);
      }
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();

    canvas.drawPath(
      fillPath,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [fillColor.withValues(alpha: 0.22), fillColor.withValues(alpha: 0.0)],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = lineColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round,
    );

    for (var i = 0; i < points.length; i++) {
      final x = dx * i;
      final y = size.height * (1 - points[i]);
      canvas.drawCircle(Offset(x, y), 3, Paint()..color = lineColor);
    }
  }

  @override
  bool shouldRepaint(covariant _MiniChartPainter oldDelegate) =>
      oldDelegate.points != points || oldDelegate.lineColor != lineColor;
}

/// Slide 2 — a screen-time progress ring, mirroring the reference's
/// "2h 45m Today" concept, in brand green.
class ScreenTimeRingIllustration extends StatelessWidget {
  const ScreenTimeRingIllustration({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return _IllustrationCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: SizedBox(
              width: 128,
              height: 128,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 128,
                    height: 128,
                    child: CircularProgressIndicator(
                      value: 0.62,
                      strokeWidth: 10,
                      strokeCap: StrokeCap.round,
                      backgroundColor: scheme.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation(scheme.primary),
                    ),
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '2h 15m',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        'today',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.space20),
          _StatRow(icon: Icons.timer_outlined, label: 'Daily limit', value: '3h', tint: scheme.primary),
          _StatRow(icon: Icons.nightlight_round, label: 'Bedtime', value: '9:30 PM', tint: scheme.secondary),
        ],
      ),
    );
  }
}

/// Slide 3 — a protection shield with device badges, mirroring the
/// reference's "Protect Every Connection" concept, in brand green/teal.
class ProtectionShieldIllustration extends StatelessWidget {
  const ProtectionShieldIllustration({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    return _IllustrationCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 132,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(gradient: colors.brandGradient, shape: BoxShape.circle),
                  child: const Icon(Icons.shield_rounded, color: Colors.white, size: 44),
                ),
                Positioned(
                  left: 8,
                  bottom: 4,
                  child: _DeviceBadge(icon: Icons.smartphone_rounded, tint: scheme.secondary),
                ),
                Positioned(
                  right: 8,
                  bottom: 4,
                  child: _DeviceBadge(icon: Icons.sports_esports_rounded, tint: scheme.tertiary),
                ),
                Positioned(
                  top: 0,
                  child: _DeviceBadge(icon: Icons.laptop_mac_rounded, tint: colors.success),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.space16),
          _StatRow(icon: Icons.dns_rounded, label: 'DNS protection', value: 'On', tint: scheme.primary),
          _StatRow(icon: Icons.wifi_rounded, label: 'Network coverage', value: 'All devices', tint: scheme.secondary),
        ],
      ),
    );
  }
}

class _DeviceBadge extends StatelessWidget {
  const _DeviceBadge({required this.icon, required this.tint});

  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: scheme.surface,
        shape: BoxShape.circle,
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [BoxShadow(color: context.colors.ambientShadow, blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Stack(
        children: [
          Center(child: Icon(icon, size: 18, color: tint)),
          Positioned(
            right: -1,
            bottom: -1,
            child: Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: context.colors.success,
                shape: BoxShape.circle,
                border: Border.all(color: scheme.surface, width: 1.5),
              ),
              child: const Icon(Icons.check, size: 9, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
