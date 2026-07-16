import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:parent_app/core/theme/app_colors.dart';
import 'package:parent_app/core/theme/app_spacing.dart';
import 'package:parent_app/core/widgets/app_snackbar.dart';
import 'package:parent_app/core/widgets/app_text_field.dart';
import 'package:parent_app/core/widgets/glass_card.dart';
import 'package:parent_app/core/widgets/gradient_button.dart';
import 'package:parent_app/core/widgets/guardtime_scaffold.dart';
import 'package:parent_app/core/widgets/inline_error_banner.dart';
import 'package:parent_app/features/auth/presentation/controllers/auth_controller.dart';
import 'package:parent_app/features/auth/presentation/widgets/auth_header.dart';

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final success = await ref
        .read(authControllerProvider.notifier)
        .register(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          firstName: _firstNameController.text.trim(),
          lastName: _lastNameController.text.trim(),
        );
    if (!mounted) {
      return;
    }
    if (success) {
      showAppSnackbar(
        context,
        'Account created successfully!',
        type: SnackbarType.success,
      );
    } else {
      final message =
          ref.read(authControllerProvider).errorMessage ?? 'Unable to sign up';
      showAppSnackbar(context, message, type: SnackbarType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    return GuardTimeScaffold(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.page),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Form(
              key: _formKey,
              child: Column(
                children: [
                  const AuthHeader(subtitle: 'Create your family command center'),
                  const SizedBox(height: AppSpacing.xl),
                  GlassCard(
                    padding: const EdgeInsets.all(AppSpacing.space24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Create account',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: AppSpacing.space4),
                        Text(
                          'Set up your parent profile',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: context.scheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        Row(
                          children: [
                            Expanded(
                              child: GuardTimeTextField(
                                controller: _firstNameController,
                                label: 'First name',
                                prefixIcon: Icons.person_outline_rounded,
                                textInputAction: TextInputAction.next,
                                validator: (v) =>
                                    (v == null || v.trim().isEmpty) ? 'Required' : null,
                              ),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: GuardTimeTextField(
                                controller: _lastNameController,
                                label: 'Last name',
                                prefixIcon: Icons.person_outline_rounded,
                                textInputAction: TextInputAction.next,
                                validator: (v) =>
                                    (v == null || v.trim().isEmpty) ? 'Required' : null,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        GuardTimeTextField(
                          controller: _emailController,
                          label: 'Email address',
                          prefixIcon: Icons.mail_outline_rounded,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Email is required';
                            if (!RegExp(
                              r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                            ).hasMatch(v.trim())) {
                              return 'Enter a valid email';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        GuardTimeTextField(
                          controller: _passwordController,
                          label: 'Password',
                          obscureText: _obscure,
                          prefixIcon: Icons.lock_outline_rounded,
                          suffix: IconButton(
                            onPressed: () => setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_rounded
                                  : Icons.visibility_off_rounded,
                              color: context.scheme.outline,
                            ),
                          ),
                          onSubmitted: (_) => _submit(),
                          validator: (v) {
                            if (v == null || v.isEmpty) return 'Password is required';
                            if (v.length < 8) return 'At least 8 characters';
                            return null;
                          },
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          'At least 8 characters. Sessions stored securely on-device.',
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        if (auth.errorMessage != null) ...[
                          const SizedBox(height: AppSpacing.space12),
                          InlineErrorBanner(message: auth.errorMessage!),
                        ],
                        const SizedBox(height: AppSpacing.lg),
                        GradientButton(
                          label: 'Sign Up',
                          onPressed: _submit,
                          isBusy: auth.isSubmitting,
                        ),
                      ],
                    ),
                  ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, end: 0),
                  const SizedBox(height: AppSpacing.lg),
                  AuthSwitchLink(
                    leadingText: 'Already have an account? ',
                    actionText: 'Sign in',
                    onTap: () => context.go('/login'),
                  ),
                  TextButton(
                    onPressed: () => context.push('/legal'),
                    child: Text(
                      'Privacy policy and account deletion',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
