import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/app_text_field.dart';
import 'package:parent_app/core/widgets/brand_app_bar.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/features/children/data/children_repository.dart';
import 'package:parent_app/features/children/presentation/providers/children_providers.dart';

class AddChildScreen extends ConsumerStatefulWidget {
  const AddChildScreen({super.key});

  @override
  ConsumerState<AddChildScreen> createState() => _AddChildScreenState();
}

class _AddChildScreenState extends ConsumerState<AddChildScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _ageController = TextEditingController();
  final _limitController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _ageController.dispose();
    _limitController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    try {
      final child = await ref
          .read(childrenRepositoryProvider)
          .addChild(
            name: _nameController.text.trim(),
            age: int.tryParse(_ageController.text.trim()),
            defaultLimitMinutes: int.tryParse(_limitController.text.trim()),
          );
      ref.invalidate(childrenListProvider);
      if (mounted) {
        context.go('/children/${child.id}');
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
    return GuardTimeScaffold(
      appBar: const GuardTimeBrandAppBar(title: 'Add Child', showBack: true),
      child: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            12,
            AppSpacing.page,
            48,
          ),
          children: [
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Create a child profile',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'This profile drives device assignment, daily limits, gaming sessions, and support recommendations.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  GuardTimeTextField(
                    controller: _nameController,
                    label: 'Child name',
                    prefixIcon: Icons.face_rounded,
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) return 'Name is required';
                      if (v.trim().length < 2) return 'Name is too short';
                      return null;
                    },
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: GuardTimeTextField(
                          controller: _ageController,
                          label: 'Age',
                          keyboardType: TextInputType.number,
                          prefixIcon: Icons.cake_outlined,
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return null;
                            final n = int.tryParse(v.trim());
                            if (n == null || n < 1 || n > 18) return '1–18';
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: GuardTimeTextField(
                          controller: _limitController,
                          label: 'Daily limit (min)',
                          keyboardType: TextInputType.number,
                          prefixIcon: Icons.timer_outlined,
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return null;
                            final n = int.tryParse(v.trim());
                            if (n == null || n < 1) return 'Invalid';
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  GradientButton(
                    label: 'Save Child',
                    onPressed: _save,
                    isBusy: _saving,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
