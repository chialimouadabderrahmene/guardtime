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

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String? _validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Email is required';
    }
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim())) {
      return 'Enter a valid email';
    }
    return null;
  }

  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Password is required';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }

    final success = await ref
        .read(authControllerProvider.notifier)
        .login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

    if (!mounted) {
      return;
    }

    if (success) {
      showAppSnackbar(context, 'Welcome back!', type: SnackbarType.success);
    } else {
      final message =
          ref.read(authControllerProvider).errorMessage ?? 'Login failed';
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
                  const AuthHeader(subtitle: 'Protect what matters most'),
                  const SizedBox(height: AppSpacing.xl),
                  GlassCard(
                    padding: const EdgeInsets.all(AppSpacing.space24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Welcome back',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: AppSpacing.space4),
                        Text(
                          'Sign in to manage your family',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: context.scheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        GuardTimeTextField(
                          controller: _emailController,
                          label: 'Email Address',
                          hint: 'name@example.com',
                          keyboardType: TextInputType.emailAddress,
                          prefixIcon: Icons.mail_outline_rounded,
                          textInputAction: TextInputAction.next,
                          validator: _validateEmail,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        GuardTimeTextField(
                          controller: _passwordController,
                          label: 'Password',
                          hint: '••••••••',
                          obscureText: _obscure,
                          prefixIcon: Icons.lock_outline_rounded,
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _submit(),
                          validator: _validatePassword,
                          suffix: IconButton(
                            onPressed: () => setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_rounded
                                  : Icons.visibility_off_rounded,
                              color: context.scheme.outline,
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        GradientButton(
                          label: 'Sign In',
                          onPressed: _submit,
                          isBusy: auth.isSubmitting,
                        ),
                        if (auth.errorMessage != null) ...[
                          const SizedBox(height: AppSpacing.space12),
                          InlineErrorBanner(message: auth.errorMessage!),
                        ],
                      ],
                    ),
                  ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05, end: 0),
                  const SizedBox(height: AppSpacing.lg),
                  AuthSwitchLink(
                    leadingText: "Don't have an account? ",
                    actionText: 'Sign up',
                    onTap: () => context.go('/signup'),
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
