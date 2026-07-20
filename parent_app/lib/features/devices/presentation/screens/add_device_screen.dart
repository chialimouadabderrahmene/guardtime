import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
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

  String? _selectedChildId;
  String _selectedType = 'PLAYSTATION';
  String _selectedControlMethod = 'DNS_FILTERING';
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _selectedChildId = widget.initialChildId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _platformController.dispose();
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
          );
      ref.invalidate(devicesListProvider);
      ref.invalidate(childrenListProvider);
      if (mounted) {
        context.pushReplacement(
          '/devices/${device.id}/pair-setup',
          extra: device.name,
        );
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
                  selectedControlMethod: _selectedControlMethod,
                  onControlMethodChanged: (v) =>
                      setState(() => _selectedControlMethod = v),
                  saving: _saving,
                  onSubmit: _createDevice,
                ),
                const SizedBox(height: AppSpacing.md),
                const _AutoPairingNoticeCard(),
              ],
            ),
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

class _AutoPairingNoticeCard extends StatelessWidget {
  const _AutoPairingNoticeCard();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.auto_awesome_rounded, color: context.scheme.primary),
          const SizedBox(width: AppSpacing.space12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Automatic pairing', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: AppSpacing.space4),
                Text(
                  'No IP address needed. After creating the device, GuardTime walks you through a QR-code DNS setup and pairs it automatically.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
