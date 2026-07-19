import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/widgets/bottom_nav_shell.dart';
import 'package:parent_app/features/analytics/presentation/screens/analytics_screen.dart';
import 'package:parent_app/features/analytics/presentation/screens/reports_screen.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:parent_app/features/auth/presentation/screens/login_screen.dart';
import 'package:parent_app/features/auth/presentation/screens/signup_screen.dart';
import 'package:parent_app/features/auth/presentation/screens/splash_screen.dart';
import 'package:parent_app/features/children/presentation/screens/add_child_screen.dart';
import 'package:parent_app/features/children/presentation/screens/child_profile_screen.dart';
import 'package:parent_app/features/children/presentation/screens/children_screen.dart';
import 'package:parent_app/features/dashboard/presentation/screens/dashboard_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/add_device_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/device_details_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/devices_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/dns_setup_guide_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/gaming_control_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/network_status_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/platform_guide_detail_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/platform_guides_screen.dart';
import 'package:parent_app/features/devices/presentation/screens/protection_health_screen.dart';
import 'package:parent_app/features/gaming/presentation/screens/full_internet_lock_screen.dart';
import 'package:parent_app/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:parent_app/features/offline_control/presentation/screens/offline_checklist_screen.dart';
import 'package:parent_app/features/offline_control/presentation/screens/offline_control_guide_screen.dart';
import 'package:parent_app/features/onboarding/presentation/screens/onboarding_screen.dart';
import 'package:parent_app/features/protection/presentation/screens/device_insights_screen.dart';
import 'package:parent_app/features/protection/presentation/screens/protection_score_screen.dart';
import 'package:parent_app/features/protection/presentation/screens/schedule_rules_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/diagnostics_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/gaming_devices_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/instant_block_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/one_click_setup_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/router_details_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/router_detection_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/router_wizard_screen.dart';
import 'package:parent_app/features/router_integration/presentation/screens/supported_features_screen.dart';
import 'package:parent_app/features/settings/presentation/screens/privacy_account_screen.dart';
import 'package:parent_app/features/settings/presentation/screens/settings_screen.dart';
import 'package:parent_app/features/sessions/presentation/screens/start_session_screen.dart';

CustomTransitionPage<void> _fadeTransitionPage({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 250),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(opacity: animation, child: child);
    },
  );
}

CustomTransitionPage<void> _slideUpTransitionPage({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 280),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.06),
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(opacity: curved, child: child),
      );
    },
  );
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/splash',
    redirect: (context, state) {
      final isAuthRoute =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/signup';
      final isSplash = state.matchedLocation == '/splash';
      final isOnboarding = state.matchedLocation == '/onboarding';
      final isLegal = state.matchedLocation == '/legal';

      if (auth.isBootstrapping) {
        return isSplash ? null : '/splash';
      }

      if (!auth.hasCompletedOnboarding && !auth.isAuthenticated) {
        return isOnboarding || isLegal ? null : '/onboarding';
      }

      if (!auth.isAuthenticated) {
        return isAuthRoute || isLegal ? null : '/login';
      }

      if (isAuthRoute || isSplash || isOnboarding) {
        return '/dashboard';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        pageBuilder: (context, state) => _fadeTransitionPage(
          key: state.pageKey,
          child: const SplashScreen(),
        ),
      ),
      GoRoute(
        path: '/onboarding',
        pageBuilder: (context, state) => _fadeTransitionPage(
          key: state.pageKey,
          child: const OnboardingScreen(),
        ),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => _fadeTransitionPage(
          key: state.pageKey,
          child: const LoginScreen(),
        ),
      ),
      GoRoute(
        path: '/signup',
        pageBuilder: (context, state) => _fadeTransitionPage(
          key: state.pageKey,
          child: const SignupScreen(),
        ),
      ),
      GoRoute(
        path: '/legal',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const PrivacyAccountScreen(),
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return GuardTimeShellScaffold(
            navigationShell: navigationShell,
            child: navigationShell,
          );
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/dashboard',
                builder: (context, state) => const DashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/children',
                builder: (context, state) => const ChildrenScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/devices',
                builder: (context, state) => const DevicesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/analytics',
                builder: (context, state) => const AnalyticsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (context, state) => const SettingsScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/children/add',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const AddChildScreen(),
        ),
      ),
      GoRoute(
        path: '/children/:childId',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: ChildProfileScreen(childId: state.pathParameters['childId']!),
        ),
      ),
      GoRoute(
        path: '/devices/add',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: AddDeviceScreen(
            initialChildId: state.uri.queryParameters['childId'],
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: DeviceDetailsScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/gaming',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: GamingControlScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/start-session',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: StartSessionScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/full-lock',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: FullInternetLockScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/network-status',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: NetworkStatusScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/dns-guide',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: DnsSetupGuideScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/protection-health',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const ProtectionHealthScreen(),
        ),
      ),
      GoRoute(
        path: '/reports',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const ReportsScreen(),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/schedule',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: ScheduleRulesScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/protection',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: ProtectionScoreScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/insights',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: DeviceInsightsScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/offline-guide',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: OfflineControlGuideScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/devices/:deviceId/offline-checklist',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: OfflineChecklistScreen(
            deviceId: state.pathParameters['deviceId']!,
          ),
        ),
      ),
      GoRoute(
        path: '/guides',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const PlatformGuidesScreen(),
        ),
      ),
      GoRoute(
        path: '/guides/:platform',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: PlatformGuideDetailScreen(
            platform: state.pathParameters['platform']!,
          ),
        ),
      ),
      GoRoute(
        path: '/notifications',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const NotificationsScreen(),
        ),
      ),
      GoRoute(
        path: '/routers',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: const RouterDetectionScreen(),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: RouterDetailsScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/features',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: SupportedFeaturesScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/setup',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: OneClickSetupScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/wizard',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: RouterWizardScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/gaming-devices',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: GamingDevicesScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/instant-block',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: InstantBlockScreen(
            gatewayId: state.pathParameters['gatewayId']!,
            initialDeviceId: state.uri.queryParameters['deviceId'],
          ),
        ),
      ),
      GoRoute(
        path: '/routers/:gatewayId/diagnostics',
        pageBuilder: (context, state) => _slideUpTransitionPage(
          key: state.pageKey,
          child: DiagnosticsScreen(gatewayId: state.pathParameters['gatewayId']!),
        ),
      ),
    ],
  );
});
