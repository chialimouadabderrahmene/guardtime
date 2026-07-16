import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';

class GuardTimeBrandAppBar extends StatelessWidget
    implements PreferredSizeWidget {
  const GuardTimeBrandAppBar({
    super.key,
    this.title,
    this.showBack = false,
    this.showBrand = true,
    this.actions = const [],
  });

  final String? title;
  final bool showBack;
  final bool showBrand;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return AppBar(
      leading: showBack
          ? IconButton(
              onPressed: () => context.pop(),
              icon: const Icon(Icons.arrow_back_ios_new_rounded),
            )
          : null,
      titleSpacing: showBack ? 0 : 18,
      title: Row(
        children: [
          if (showBrand) ...[
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                gradient: colors.brandGradient,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(Icons.shield_rounded, size: 16, color: colors.onGradient),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(title ?? 'GuardTime', overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
      actions: actions,
    );
  }
}
