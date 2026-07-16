import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/app/router/app_router.dart';
import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/theme/app_theme.dart';
import 'package:parent_app/core/theme/theme_mode_provider.dart';
import 'package:parent_app/core/widgets/offline_banner.dart';

class GuardTimeApp extends ConsumerWidget {
  const GuardTimeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: AppConfig.appName,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) {
        return Column(
          children: [
            const OfflineBanner(),
            Expanded(child: child ?? const SizedBox.shrink()),
          ],
        );
      },
    );
  }
}
