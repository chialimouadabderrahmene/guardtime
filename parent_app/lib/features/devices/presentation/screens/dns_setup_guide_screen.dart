import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/core/widgets/section_header.dart';
import 'package:parent_app/core/widgets/step_list_item.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';
import 'package:parent_app/shared/widgets/info_notice_card.dart';

class DnsSetupGuideScreen extends ConsumerWidget {
  const DnsSetupGuideScreen({super.key, required this.deviceId});

  final String deviceId;

  bool _supportsOfflineGuide(String type) {
    return const {
      'XBOX',
      'PLAYSTATION',
      'NINTENDO',
      'STEAM_DECK',
      'PC',
      'MAC',
      'SMART_TV',
    }.contains(type);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deviceAsync = ref.watch(deviceDetailsProvider(deviceId));
    final scheme = context.scheme;

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'DNS Setup Guide', showBack: true),
      child: deviceAsync.when(
        loading: () => const LoadingStateView(message: 'Loading guide...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(deviceDetailsProvider(deviceId)),
        ),
        data: (device) {
          final platformGuideAsync = ref.watch(
            platformGuideProvider(guidePlatformForDeviceType(device.type)),
          );
          final offlineGuideAsync = _supportsOfflineGuide(device.type)
              ? ref.watch(offlineGuideProvider(device.type))
              : null;

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              GlassCard(
                child: Column(
                  children: [
                    Icon(deviceIcon(device.type), color: deviceAccent(device.type), size: 54),
                    const SizedBox(height: AppSpacing.space14),
                    Text(
                      'Setup your ${device.name}',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: AppSpacing.space8),
                    Text(
                      'Follow the vendor steps below, then point DNS through GuardTime so online traffic is filtered and monitored.',
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.space14),
                    SelectableText(
                      AppConfig.dnsResolverIp,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              platformGuideAsync.when(
                loading: () =>
                    const LoadingStateView(message: 'Loading DNS steps...', compact: true),
                error: (error, _) => Text(error.toString()),
                data: (guide) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (guide.summary != null && guide.summary!.isNotEmpty) ...[
                      InfoNoticeCard(
                        title: guide.title,
                        message: guide.summary!,
                        icon: Icons.dns_rounded,
                        accent: scheme.primary,
                      ),
                      const SizedBox(height: AppSpacing.xl),
                    ],
                    const SectionHeader(title: 'DNS Steps'),
                    const SizedBox(height: AppSpacing.md),
                    GlassCard(
                      child: Column(
                        children: [
                          for (var i = 0; i < guide.steps.length; i++) ...[
                            if (i > 0) const Divider(height: 1),
                            StepListItem(
                              index: guide.steps[i].step,
                              title: guide.steps[i].title,
                              description: guide.steps[i].description,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (guide.caveats.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.xl),
                      const SectionHeader(title: 'Before you rely on this'),
                      const SizedBox(height: AppSpacing.md),
                      GlassCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (final caveat in guide.caveats)
                              Padding(
                                padding: const EdgeInsets.only(bottom: AppSpacing.space8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(
                                      Icons.info_outline_rounded,
                                      size: 18,
                                      color: context.colors.warning,
                                    ),
                                    const SizedBox(width: AppSpacing.space8),
                                    Expanded(child: Text(caveat)),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (offlineGuideAsync != null) ...[
                const SizedBox(height: AppSpacing.xl),
                const SectionHeader(title: 'Platform Limitations'),
                const SizedBox(height: AppSpacing.md),
                offlineGuideAsync.when(
                  loading: () => const LoadingStateView(
                    message: 'Loading platform notes...',
                    compact: true,
                  ),
                  error: (error, _) => Text(error.toString()),
                  data: (guide) => GlassCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(guide.title, style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: AppSpacing.space10),
                        ...guide.limitations.map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.space8),
                            child: Text('- $item'),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.space10),
                        Text(
                          'Official URL: ${guide.officialUrl}',
                          style: Theme.of(
                            context,
                          ).textTheme.bodyMedium?.copyWith(color: scheme.primary),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
