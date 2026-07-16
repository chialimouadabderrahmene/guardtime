import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Primary call-to-action button — gradient-filled, theme-aware.
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.isBusy = false,
    this.expand = true,
    this.destructive = false,
    this.padding = const EdgeInsets.symmetric(
      horizontal: AppSpacing.space20,
      vertical: AppSpacing.space16,
    ),
  });

  final String label;
  final VoidCallback? onPressed;
  final Widget? icon;
  final bool isBusy;
  final bool expand;
  final bool destructive;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final scheme = context.scheme;

    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (isBusy)
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(colors.onGradient),
            ),
          )
        else if (icon != null) ...[
          icon!,
          const SizedBox(width: AppSpacing.space8 + 2),
        ],
        Flexible(
          child: Text(label, overflow: TextOverflow.ellipsis),
        ),
      ],
    );

    final gradient = destructive
        ? LinearGradient(
            colors: [scheme.error, scheme.error.withValues(alpha: 0.82)],
          )
        : colors.brandGradient;

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppRadius.md),
        boxShadow: [
          BoxShadow(
            color: (destructive ? scheme.error : scheme.primary)
                .withValues(alpha: 0.28),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: isBusy ? null : onPressed,
          child: Opacity(
            opacity: onPressed == null && !isBusy ? 0.5 : 1,
            child: Padding(
              padding: padding,
              child: DefaultTextStyle(
                style:
                    Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: colors.onGradient,
                    ) ??
                    TextStyle(color: colors.onGradient),
                child: IconTheme(
                  data: IconThemeData(color: colors.onGradient, size: 18),
                  child: content,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Secondary button — subtle surface fill with an outline, for the
/// less-emphasized action in a pair.
class SecondaryGlassButton extends StatelessWidget {
  const SecondaryGlassButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.emphasisColor,
    this.expand = true,
    this.padding = const EdgeInsets.symmetric(
      horizontal: AppSpacing.space20,
      vertical: AppSpacing.space16,
    ),
  });

  final String label;
  final VoidCallback? onPressed;
  final Widget? icon;
  final Color? emphasisColor;
  final bool expand;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final color = emphasisColor ?? scheme.onSurface;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: Padding(
            padding: padding,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  IconTheme(data: IconThemeData(color: color, size: 18), child: icon!),
                  const SizedBox(width: AppSpacing.space8 + 2),
                ],
                Flexible(
                  child: Text(
                    label,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(
                      context,
                    ).textTheme.labelLarge?.copyWith(color: color),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
