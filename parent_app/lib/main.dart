import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/app/app.dart';
import 'package:parent_app/core/analytics/analytics_service.dart';
import 'package:parent_app/core/analytics/crash_reporting_service.dart';

Future<void> main() async {
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      // Attempt Firebase init; if no config files are present yet, the app
      // still runs and logs to debug console.
      try {
        await Firebase.initializeApp();
        CrashReportingService.instance.markInitialized();
        AnalyticsService.instance.markInitialized();
      } catch (e, s) {
        debugPrint('Firebase not initialized (missing config?): $e\n$s');
      }

      FlutterError.onError = (details) {
        FlutterError.presentError(details);
        CrashReportingService.instance.reportFatal(
          details.exception,
          details.stack,
          reason: 'FlutterError.onError',
        );
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        CrashReportingService.instance.report(
          error,
          stack,
          reason: 'PlatformDispatcher.onError',
        );
        return true;
      };

      // In release mode, replace the red error screen with a friendly widget
      if (!kDebugMode) {
        ErrorWidget.builder = (details) => Builder(
              builder: (context) {
                final scheme = Theme.of(context).colorScheme;
                return Material(
                  color: scheme.surface,
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        'Something went wrong.\nPlease restart the app.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: scheme.onSurfaceVariant,
                          fontSize: 16,
                        ),
                      ),
                    ),
                  ),
                );
              },
            );
      }

      runApp(const ProviderScope(child: GuardTimeApp()));
    },
    (error, stack) {
      CrashReportingService.instance.report(
        error,
        stack,
        reason: 'runZonedGuarded',
      );
    },
  );
}
