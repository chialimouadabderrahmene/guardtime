import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/brand_mark.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pages = [
    _OnboardingPageData(
      title: 'Device Control',
      body:
          'Add consoles, TVs, tablets, and phones. See what can be controlled online and where vendor parental tools are needed.',
      icon: Icons.devices_rounded,
    ),
    _OnboardingPageData(
      title: 'Time Limits',
      body:
          'Start sessions, set bedtime rules, and give extra time when it makes sense. Limits stay tied to each device.',
      icon: Icons.timer_outlined,
    ),
    _OnboardingPageData(
      title: 'Smart Blocking',
      body:
          'Pause gaming with internet lock, monitor DNS health, and get honest offline-control insights.',
      icon: Icons.shield_rounded,
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await ref.read(authControllerProvider.notifier).completeOnboarding();
    if (mounted) {
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _pages.length - 1;
    final scheme = context.scheme;
    final gradients = [
      context.colors.brandGradient,
      LinearGradient(
        colors: [scheme.secondary, scheme.primary],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
      LinearGradient(
        colors: [scheme.primary, scheme.tertiary],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
    ];

    return GuardTimeScaffold(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.page),
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  const BrandMark(size: 44, iconSize: 22),
                  const SizedBox(width: 10),
                  Text(
                    'GuardTime',
                    style: Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    child: Text(
                      'Skip',
                      style: Theme.of(
                        context,
                      ).textTheme.labelLarge?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _pages.length,
                  onPageChanged: (value) => setState(() => _page = value),
                  itemBuilder: (context, index) {
                    final page = _pages[index];
                    final gradient = gradients[index];
                    return Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                              width: 140,
                              height: 140,
                              decoration: BoxDecoration(
                                gradient: gradient,
                                borderRadius: BorderRadius.circular(40),
                                boxShadow: [
                                  BoxShadow(
                                    color: scheme.primary.withValues(alpha: 0.3),
                                    blurRadius: 40,
                                    offset: const Offset(0, 16),
                                  ),
                                ],
                              ),
                              child: Icon(page.icon, color: Colors.white, size: 64),
                            )
                            .animate(key: ValueKey('icon_$index'))
                            .scale(
                              begin: const Offset(0.8, 0.8),
                              end: const Offset(1.0, 1.0),
                              duration: 400.ms,
                              curve: Curves.easeOutBack,
                            )
                            .fadeIn(duration: 300.ms),
                        const SizedBox(height: 40),
                        Text(
                              page.title,
                              style: Theme.of(
                                context,
                              ).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.w700),
                              textAlign: TextAlign.center,
                            )
                            .animate(key: ValueKey('title_$index'))
                            .fadeIn(delay: 150.ms, duration: 300.ms)
                            .slideY(begin: 0.15, end: 0),
                        const SizedBox(height: 16),
                        Text(
                              page.body,
                              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                color: scheme.onSurfaceVariant,
                                height: 1.6,
                              ),
                              textAlign: TextAlign.center,
                            )
                            .animate(key: ValueKey('body_$index'))
                            .fadeIn(delay: 250.ms, duration: 300.ms)
                            .slideY(begin: 0.1, end: 0),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _pages.length,
                  (dotIndex) => AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: dotIndex == _page ? 28 : 10,
                    height: 10,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: dotIndex == _page ? scheme.primary : scheme.outlineVariant,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              GradientButton(
                label: isLast ? 'Get Started' : 'Continue',
                onPressed: () async {
                  if (isLast) {
                    await _finish();
                    return;
                  }
                  await _controller.nextPage(
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeInOut,
                  );
                },
              ),
              const SizedBox(height: AppSpacing.lg),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardingPageData {
  const _OnboardingPageData({
    required this.title,
    required this.body,
    required this.icon,
  });

  final String title;
  final String body;
  final IconData icon;
}
