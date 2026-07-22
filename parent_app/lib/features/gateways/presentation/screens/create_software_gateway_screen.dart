import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/section_header.dart';

import 'package:parent_app/features/router_integration/domain/gateway_model.dart';

import '../../data/gateway_repository.dart';

/// Advanced/Experimental path — create a Software Gateway (gateway-agent
/// enforcing directly on its own host, no router required). Only Gateway
/// Name is required; Description and Endpoint are optional, matching the
/// real POST /gateway/register contract exactly (no fields invented here
/// that the backend doesn't accept).
class CreateSoftwareGatewayScreen extends ConsumerStatefulWidget {
  const CreateSoftwareGatewayScreen({super.key});

  @override
  ConsumerState<CreateSoftwareGatewayScreen> createState() => _CreateSoftwareGatewayScreenState();
}

class _CreateSoftwareGatewayScreenState extends ConsumerState<CreateSoftwareGatewayScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController(text: 'Home Gateway');
  final _descriptionController = TextEditingController();
  final _endpointController = TextEditingController();
  bool _creating = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _endpointController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _creating = true);
    try {
      final result = await ref.read(gatewayRepositoryProvider).register(
        name: _nameController.text.trim(),
        gatewayType: GatewayType.softwareAgent,
        description: _descriptionController.text.trim().isEmpty ? null : _descriptionController.text.trim(),
        endpoint: _endpointController.text.trim().isEmpty ? null : _endpointController.text.trim(),
      );
      if (!mounted) return;
      // The token only ever exists in this response — pass it forward as
      // extra, never persisted, never re-fetchable.
      context.pushReplacement('/gateways/created', extra: result);
    } catch (error) {
      if (mounted) showAppSnackbar(context, error.toString(), type: SnackbarType.error);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Software Gateway', showBack: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.page, AppSpacing.space12, AppSpacing.page, 48),
        children: [
          const SectionHeader(title: 'Create your gateway', uppercaseEyebrow: 'Advanced · Experimental'),
          const SizedBox(height: AppSpacing.md),
          GlassCard(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextFormField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Gateway name'),
                    validator: (value) => (value == null || value.trim().isEmpty) ? 'Give this gateway a name' : null,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextFormField(
                    controller: _descriptionController,
                    decoration: const InputDecoration(labelText: 'Description (optional)', hintText: 'e.g. Living room mini PC'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextFormField(
                    controller: _endpointController,
                    decoration: const InputDecoration(labelText: 'Endpoint (optional)', hintText: 'e.g. 192.168.1.20'),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _creating ? null : _create,
                      child: _creating
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Create Gateway'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            'This gateway will enforce protection directly from the device you install the agent on. It needs to stay powered on and connected to your home network to keep working.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
