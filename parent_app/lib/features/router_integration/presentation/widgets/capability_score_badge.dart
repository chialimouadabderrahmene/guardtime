import 'package:flutter/material.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';

import '../../domain/router_capability_score_model.dart';

Color _levelColor(BuildContext context, SupportLevel level) {
  final colors = context.colors;
  return switch (level) {
    SupportLevel.fullSupport => colors.success,
    SupportLevel.excellent => colors.success,
    SupportLevel.good => colors.warning,
    SupportLevel.limited => colors.warning,
    SupportLevel.basic => colors.warning,
    SupportLevel.unsupported => Colors.grey,
  };
}

String _levelLabel(SupportLevel level) {
  return switch (level) {
    SupportLevel.fullSupport => 'Full Support',
    SupportLevel.excellent => 'Excellent',
    SupportLevel.good => 'Good',
    SupportLevel.limited => 'Limited',
    SupportLevel.basic => 'Basic',
    SupportLevel.unsupported => 'Unsupported',
  };
}

/// The star-rating badge for Router Capability Badges — reads a score
/// already computed server-side (RouterCapabilityScoreService), never
/// recomputes it. Compact form for cards, full form (with the reasoning
/// breakdown) for the Router Compatibility Center.
class CapabilityScoreBadge extends StatelessWidget {
  const CapabilityScoreBadge({super.key, required this.score, this.compact = false});

  final RouterCapabilityScoreModel score;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = _levelColor(context, score.level);
    final stars = List.generate(
      5,
      (i) => Icon(
        i < score.stars ? Icons.star_rounded : Icons.star_border_rounded,
        size: compact ? 14 : 18,
        color: color,
      ),
    );

    if (compact) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ...stars,
          const SizedBox(width: 4),
          Text(
            _levelLabel(score.level),
            style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: stars),
        const SizedBox(height: 4),
        Text(
          '${_levelLabel(score.level)} · ${score.score}/${score.maxScore}',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

/// Supported / unsupported feature chips + per-category reasoning — the
/// full breakdown view used by the Router Compatibility Center.
class CapabilityScoreBreakdownView extends StatelessWidget {
  const CapabilityScoreBreakdownView({super.key, required this.score});

  final RouterCapabilityScoreModel score;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final category in score.breakdown)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.space12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  category.supported ? Icons.check_circle_rounded : Icons.cancel_rounded,
                  size: 18,
                  color: category.supported ? context.colors.success : context.scheme.onSurfaceVariant,
                ),
                const SizedBox(width: AppSpacing.space8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text('${category.label} ', style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                          Text(
                            '+${category.earned}/${category.weight}',
                            style: textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                      Text(category.reasoning, style: textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        if (score.recommendations.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.space8),
          Text('Recommendations', style: textTheme.labelLarge),
          const SizedBox(height: AppSpacing.space8),
          for (final recommendation in score.recommendations)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.space8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.lightbulb_outline_rounded, size: 16, color: context.colors.warning),
                  const SizedBox(width: AppSpacing.space8),
                  Expanded(child: Text(recommendation, style: textTheme.bodySmall)),
                ],
              ),
            ),
        ],
      ],
    );
  }
}
