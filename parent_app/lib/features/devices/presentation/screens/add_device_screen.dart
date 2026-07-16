import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/config/app_config.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/utils/device_utils.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/app_text_field.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/error_state_view.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/loading_state_view.dart';
import 'package:parent_app/features/children/domain/child_model.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';
import 'package:parent_app/features/devices/data/devices_repository.dart';
import 'package:parent_app/features/devices/presentation/providers/devices_providers.dart';

const _deviceTypes = [
  'PLAYSTATION',
  'XBOX',
  'NINTENDO',
  'SMART_TV',
  'STREAMING_BOX',
  'PC',
  'MAC',
  'STEAM_DECK',
  'IPHONE',
  'IPAD',
  'ANDROID_PHONE',
  'ANDROID_TABLET',
];

const _controlMethods = [
  'DNS_FILTERING',
  'XBOX_ACCOUNT',
  'IOS_SCREEN_TIME',
  'ANDROID_AGENT',
  'MOCK',
];

class AddDeviceScreen extends ConsumerStatefulWidget {
  const AddDeviceScreen({super.key, this.initialChildId});

  final String? initialChildId;

  @override
  ConsumerState<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends ConsumerState<AddDeviceScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _platformController = TextEditingController();
  final _ipController = TextEditingController();

  String? _selectedChildId;
  String? _createdDeviceId;
  String _selectedType = 'PLAYSTATION';
  String _selectedControlMethod = 'DNS_FILTERING';
  bool _saving = false;
  bool _testingDns = false;

  @override
  void initState() {
    super.initState();
    _selectedChildId = widget.initialChildId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _platformController.dispose();
    _ipController.dispose();
    super.dispose();
  }

  void _syncRecommendedMethod(String type) {
    setState(() {
      _selectedType = type;
      _selectedControlMethod = switch (type) {
        'XBOX' => 'XBOX_ACCOUNT',
        'IPHONE' || 'IPAD' => 'IOS_SCREEN_TIME',
        'ANDROID_PHONE' || 'ANDROID_TABLET' => 'ANDROID_AGENT',
        _ => 'DNS_FILTERING',
      };
    });
  }

  Future<void> _createDevice() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_selectedChildId == null) {
      showAppSnackbar(
        context,
        'Please choose a child profile first.',
        type: SnackbarType.error,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final device = await ref
          .read(devicesRepositoryProvider)
          .addDevice(
            childId: _selectedChildId!,
            name: _nameController.text.trim(),
            type: _selectedType,
            controlMethod: _selectedControlMethod,
            platform: _platformController.text.trim().isEmpty
                ? deviceLabel(_selectedType)
                : _platformController.text.trim(),
            ipAddress: _ipController.text.trim(),
          );
      ref.invalidate(devicesListProvider);
      ref.invalidate(childrenListProvider);
      if (mounted) {
        setState(() => _createdDeviceId = device.id);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackbar(context, error.toString(), type: SnackbarType.error);
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _testDnsConnection() async {
    if (_createdDeviceId == null) return;
    setState(() => _testingDns = true);
    ref.invalidate(networkStatusProvider(_createdDeviceId!));
    ref.invalidate(deviceDetailsProvider(_createdDeviceId!));
    try {
      await ref.read(networkStatusProvider(_createdDeviceId!).future);
    } finally {
      if (mounted) {
        setState(() => _testingDns = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final childrenAsync = ref.watch(childrenListProvider);

    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Add Device', showBack: true),
      child: childrenAsync.when(
        loading: () => const LoadingStateView(message: 'Loading children...'),
        error: (error, _) => ErrorStateView(
          message: error.toString(),
          onRetry: () => ref.invalidate(childrenListProvider),
        ),
        data: (children) {
          if (_createdDeviceId == null) {
            return Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  AppSpacing.space12,
                  AppSpacing.page,
                  48,
                ),
                children: [
                  _RegistrationForm(
                    children: children,
                    selectedChildId: _selectedChildId,
                    onChildChanged: (v) => setState(() => _selectedChildId = v),
                    nameController: _nameController,
                    selectedType: _selectedType,
                    onTypeChanged: _syncRecommendedMethod,
                    platformController: _platformController,
                    ipController: _ipController,
                    selectedControlMethod: _selectedControlMethod,
                    onControlMethodChanged: (v) =>
                        setState(() => _selectedControlMethod = v),
                    saving: _saving,
                    onSubmit: _createDevice,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  const _DnsSetupTargetCard(),
                ],
              ),
            );
          }

          final createdDeviceAsync = ref.watch(deviceDetailsProvider(_createdDeviceId!));
          final networkAsync = ref.watch(networkStatusProvider(_createdDeviceId!));

          return ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.page,
              AppSpacing.space12,
              AppSpacing.page,
              48,
            ),
            children: [
              createdDeviceAsync.when(
                loading: () => const LoadingStateView(message: 'Preparing DNS setup...'),
                error: (error, _) => ErrorStateView(
                  message: error.toString(),
                  onRetry: () => ref.invalidate(deviceDetailsProvider(_createdDeviceId!)),
                ),
                data: (device) => _DeviceCreatedCard(deviceName: device.name),
              ),
              const SizedBox(height: AppSpacing.md),
              networkAsync.when(
                loading: () => const LoadingStateView(
                  message: 'Checking DNS connection...',
                  compact: true,
                ),
                error: (error, _) => ErrorStateView(
                  message: error.toString(),
                  onRetry: _testDnsConnection,
                ),
                data: (network) => _DnsTestCard(
                  connected: network.dnsConnected,
                  note: network.note,
                  lastSeenAt: network.lastDnsSeenAt,
                  testing: _testingDns,
                  onTest: _testDnsConnection,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              _NextStepsCard(
                onOpenGuide: () => context.push('/devices/$_createdDeviceId/dns-guide'),
                onFinish: () => context.go('/devices/$_createdDeviceId'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RegistrationForm extends StatelessWidget {
  const _RegistrationForm({
    required this.children,
    required this.selectedChildId,
    required this.onChildChanged,
    required this.nameController,
    required this.selectedType,
    required this.onTypeChanged,
    required this.platformController,
    required this.ipController,
    required this.selectedControlMethod,
    required this.onControlMethodChanged,
    required this.saving,
    required this.onSubmit,
  });

  final List<ChildModel> children;
  final String? selectedChildId;
  final ValueChanged<String?> onChildChanged;
  final TextEditingController nameController;
  final String selectedType;
  final ValueChanged<String> onTypeChanged;
  final TextEditingController platformController;
  final TextEditingController ipController;
  final String selectedControlMethod;
  final ValueChanged<String> onControlMethodChanged;
  final bool saving;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Register a device', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Add a console, TV, tablet, or phone and choose the control path that matches the real platform capabilities.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          DropdownButtonFormField<String>(
            initialValue: selectedChildId,
            decoration: const InputDecoration(labelText: 'Assign to child'),
            items: children
                .map((child) => DropdownMenuItem(value: child.id, child: Text(child.name)))
                .toList(),
            onChanged: onChildChanged,
          ),
          const SizedBox(height: AppSpacing.md),
          GuardTimeTextField(
            controller: nameController,
            label: 'Device name',
            hint: 'Living Room PlayStation',
            prefixIcon: Icons.devices_rounded,
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Device name is required';
              return null;
            },
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: selectedType,
            decoration: const InputDecoration(labelText: 'Device type'),
            items: _deviceTypes
                .map(
                  (type) => DropdownMenuItem(value: type, child: Text(deviceLabel(type))),
                )
                .toList(),
            onChanged: (value) {
              if (value != null) onTypeChanged(value);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          GuardTimeTextField(
            controller: platformController,
            label: 'Platform label',
            hint: 'Console / TV / Tablet',
            prefixIcon: Icons.category_outlined,
          ),
          const SizedBox(height: AppSpacing.md),
          GuardTimeTextField(
            controller: ipController,
            label: 'DNS source / local IP (optional)',
            hint: '192.168.1.45',
            keyboardType: TextInputType.number,
            prefixIcon: Icons.lan_outlined,
          ),
          const SizedBox(height: AppSpacing.md),
          DropdownButtonFormField<String>(
            initialValue: selectedControlMethod,
            decoration: const InputDecoration(labelText: 'Control method'),
            items: _controlMethods
                .map((method) => DropdownMenuItem(value: method, child: Text(method)))
                .toList(),
            onChanged: (value) {
              if (value != null) onControlMethodChanged(value);
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          GradientButton(label: 'Create Device', onPressed: onSubmit, isBusy: saving),
        ],
      ),
    );
  }
}

class _DnsSetupTargetCard extends StatelessWidget {
  const _DnsSetupTargetCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('DNS setup target', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.space8),
          SelectableText(
            AppConfig.dnsResolverIp,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: AppSpacing.space8),
          Text(
            'After the device is created we will show the setup steps and let you test the DNS connection.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _DeviceCreatedCard extends StatelessWidget {
  const _DeviceCreatedCard({required this.deviceName});

  final String deviceName;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Device created', style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: AppSpacing.space8),
          Text(
            'Set $deviceName to use GuardTime DNS, then test the connection below.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          SelectableText(
            AppConfig.dnsResolverIp,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: AppSpacing.space8),
          Text(
            'Use this DNS IP for Xbox, PlayStation, Nintendo, Smart TV, PC, and router setups.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _DnsTestCard extends StatelessWidget {
  const _DnsTestCard({
    required this.connected,
    required this.note,
    required this.lastSeenAt,
    required this.testing,
    required this.onTest,
  });

  final bool connected;
  final String note;
  final DateTime? lastSeenAt;
  final bool testing;
  final VoidCallback onTest;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            connected ? 'DNS Connected' : 'DNS not seen yet',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: AppSpacing.space8),
          Text(note, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: AppSpacing.space12),
          Text(
            'Last DNS heartbeat: ${lastSeenAt?.toLocal().toString() ?? 'No heartbeat yet'}',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.space16),
          GradientButton(label: 'Test DNS Connection', onPressed: onTest, isBusy: testing),
        ],
      ),
    );
  }
}

class _NextStepsCard extends StatelessWidget {
  const _NextStepsCard({required this.onOpenGuide, required this.onFinish});

  final VoidCallback onOpenGuide;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Next steps', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: AppSpacing.space8),
          Text(
            '1. Open the DNS guide for this device type.\n2. Point DNS to ${AppConfig.dnsResolverIp}.\n3. Run the DNS connection test.\n4. Finish setup and review protection status.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: AppSpacing.lg),
          GradientButton(label: 'Open DNS Guide', onPressed: onOpenGuide),
          const SizedBox(height: AppSpacing.md),
          SecondaryGlassButton(
            label: 'Finish Setup',
            onPressed: onFinish,
            icon: const Icon(Icons.arrow_forward_rounded),
          ),
        ],
      ),
    );
  }
}
