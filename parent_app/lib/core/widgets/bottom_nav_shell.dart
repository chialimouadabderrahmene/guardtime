import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';

/// The Meridian Dock — a floating glass pill detached from the screen
/// edge, not a static full-width tab bar. Only the active destination
/// expands into a labeled capsule with a live glow-dot; every other
/// destination collapses to a quiet icon. Switching tabs morphs the
/// capsule across via [AnimatedContainer]/[AnimatedSize] rather than a
/// hard cut between static icons.
class GuardTimeShellScaffold extends StatelessWidget {
  const GuardTimeShellScaffold({
    super.key,
    required this.navigationShell,
    required this.child,
  });

  final StatefulNavigationShell navigationShell;
  final Widget child;

  static const _items = <({IconData icon, IconData activeIcon, String label})>[
    (icon: Icons.home_outlined, activeIcon: Icons.home_rounded, label: 'Home'),
    (
      icon: Icons.people_outline_rounded,
      activeIcon: Icons.people_rounded,
      label: 'Children',
    ),
    (
      icon: Icons.devices_outlined,
      activeIcon: Icons.devices_rounded,
      label: 'Devices',
    ),
    (
      icon: Icons.bar_chart_outlined,
      activeIcon: Icons.bar_chart_rounded,
      label: 'Analytics',
    ),
    (
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings_rounded,
      label: 'Settings',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: child,
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: Center(
          child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: colors.glassFill,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: colors.glassBorder),
            boxShadow: [
              BoxShadow(
                color: colors.ambientShadow,
                blurRadius: 28,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var index = 0; index < _items.length; index++)
                _DockItem(
                  icon: _items[index].icon,
                  activeIcon: _items[index].activeIcon,
                  label: _items[index].label,
                  selected: navigationShell.currentIndex == index,
                  onTap: () => navigationShell.goBranch(
                    index,
                    initialLocation: index == navigationShell.currentIndex,
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

class _DockItem extends StatelessWidget {
  const _DockItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = context.scheme;
    final colors = context.colors;
    final foreground = selected ? scheme.onPrimary : scheme.onSurfaceVariant;

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 380),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.symmetric(
            horizontal: selected ? 16 : 12,
            vertical: 11,
          ),
          decoration: BoxDecoration(
            color: selected ? scheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: scheme.primary.withValues(alpha: 0.35),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedScale(
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutCubic,
                scale: selected ? 1.08 : 1.0,
                child: Icon(selected ? activeIcon : icon, color: foreground, size: 20),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutCubic,
                child: selected
                    ? Padding(
                        padding: const EdgeInsets.only(left: 7),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              label,
                              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                                color: foreground,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 6),
                            _LiveDot(color: colors.glow),
                          ],
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The signature glow accent, reserved for "this is the active/live thing"
/// — used here and nowhere else in the dock.
class _LiveDot extends StatefulWidget {
  const _LiveDot({required this.color});

  final Color color;

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = _controller.value;
        return Container(
          width: 5,
          height: 5,
          decoration: BoxDecoration(
            color: widget.color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: 0.55 * (1 - t)),
                blurRadius: 5 * t,
                spreadRadius: 3 * t,
              ),
            ],
          ),
        );
      },
    );
  }
}
