import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../theme/app_spacing.dart';

class LoadingStateView extends StatelessWidget {
  const LoadingStateView({
    super.key,
    this.message = 'Loading…',
    this.compact = false,
  });

  final String message;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ShimmerBlock(
          width: double.infinity,
          height: 120,
          borderRadius: AppRadius.lg,
        ),
        const SizedBox(height: AppSpacing.space16),
        const ShimmerBlock(width: 200, height: 16, borderRadius: AppRadius.xs),
        const SizedBox(height: AppSpacing.space8 + 2),
        const ShimmerBlock(width: 140, height: 12, borderRadius: AppRadius.xs),
      ],
    );

    if (compact) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.space12),
        child: content,
      );
    }

    return Center(
      child: Padding(padding: const EdgeInsets.all(AppSpacing.space24), child: content),
    );
  }
}

class ShimmerBlock extends StatelessWidget {
  const ShimmerBlock({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = AppRadius.sm,
  });

  final double width;
  final double height;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Shimmer.fromColors(
      baseColor: scheme.surfaceContainerHigh,
      highlightColor: scheme.surfaceContainerHighest,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}

class ShimmerCardList extends StatelessWidget {
  const ShimmerCardList({super.key, this.itemCount = 3, this.itemHeight = 80});

  final int itemCount;
  final double itemHeight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: List.generate(
        itemCount,
        (index) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.space16),
          child: Shimmer.fromColors(
            baseColor: scheme.surfaceContainerHigh,
            highlightColor: scheme.surfaceContainerHighest,
            child: Container(
              height: itemHeight,
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(AppRadius.lg),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
