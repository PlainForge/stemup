// pages/LoginPage.tsx (+ LoginCard), RegisterPage.tsx (+ RegisterCard) and
// EmailVerifyPage.tsx, as they render on a phone. Navigation after a successful
// sign-in is handled by the router redirect.
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/auth_service.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

final privacyPolicyUrl = Uri.parse('https://stemup.web.app/privacy');

/// `bg-gray-50` page with the "StemUp / Gamification Platform" header and a card.
class _AuthFrame extends StatelessWidget {
  const _AuthFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => CupertinoPageScaffold(
    backgroundColor: Palette.fill(context),
    child: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 384),
            child: Column(
              children: [
                Text(
                  'StemUp',
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: Palette.label(context)),
                ),
                const SizedBox(height: 4),
                const Muted('Gamification Platform'),
                const SizedBox(height: 32),
                FadeSlideIn(offset: 30, child: child),
                const SizedBox(height: 20),
                LinkText('Privacy Policy', size: 13, color: Palette.gray400, onPressed: () => launchUrl(privacyPolicyUrl)),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

/// `bg-white rounded-2xl shadow-md p-8`.
class _AuthCard extends StatelessWidget {
  const _AuthCard({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(32),
    decoration: BoxDecoration(
      color: Palette.card(context),
      borderRadius: BorderRadius.circular(16),
      boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 4), spreadRadius: -1)],
    ),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _gap(children, 20)),
  );
}

List<Widget> _gap(List<Widget> items, double gap) => [
  for (var i = 0; i < items.length; i++) ...[if (i > 0) SizedBox(height: gap), items[i]],
];

/// ErrorMessage.tsx: `rounded-xl bg-red-400 text-white px-2 py-2 text-center`, drops in.
class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => FadeSlideIn(
    offset: -20,
    child: Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: Palette.red400, borderRadius: BorderRadius.circular(12)),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Color(0xFFFFFFFF)),
      ),
    ),
  );
}

class _SwitchLine extends StatelessWidget {
  const _SwitchLine({required this.prompt, required this.action, required this.onTap});

  final String prompt;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Wrap(
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      Muted('$prompt '),
      LinkText(action, size: 14, onPressed: onTap),
    ],
  );
}

Widget _googleButton(VoidCallback onPressed, bool loading) => AppButton(
  label: 'Continue with Google',
  icon: FontAwesomeIcons.google.data,
  size: AppButtonSize.full,
  loading: loading,
  onPressed: onPressed,
);

Widget _appleButton(VoidCallback onPressed, bool loading) => AppButton(
  label: 'Continue with Apple',
  icon: FontAwesomeIcons.apple.data,
  style: AppButtonStyle.apple,
  size: AppButtonSize.full,
  loading: loading,
  onPressed: onPressed,
);

/// Sign in with Apple (iOS only) stacked above Google, as App Review expects.
Widget _oauthButtons({
  required VoidCallback onApple,
  required bool appleBusy,
  required VoidCallback onGoogle,
  required bool googleBusy,
}) => Column(
  crossAxisAlignment: CrossAxisAlignment.stretch,
  children: [
    if (AuthService.appleSupported) ...[_appleButton(onApple, appleBusy), const SizedBox(height: 12)],
    _googleButton(onGoogle, googleBusy),
  ],
);

/// Shown when an Apple/Google sign-in hits an email that already has an account.
String _linkMessage() {
  final provider = AuthService.pendingLinkProvider;
  return provider == null
      ? 'This email already has an account with a different sign-in method. Please sign in that way.'
      : 'This email already has an account. Sign in the way you did before (email, Apple or Google) and $provider will be linked to it.';
}

Future<String?> _appleSignIn() async {
  try {
    await AuthService.signInWithApple();
    return null;
  } on FirebaseAuthException catch (e) {
    debugPrint('Apple sign-in Firebase error: ${e.code} ${e.message}');
    // The user closing Apple's sheet comes back as a cancel code (ASAuthorizationError 1001)
    if (e.code.contains('cancel') || (e.message ?? '').contains('1001')) return '';
    return switch (e.code) {
      'account-exists-with-different-credential' => _linkMessage(),
      'email-already-in-use' => 'This email is already registered. Please login instead.',
      _ => 'Apple sign-in failed. Please try again.',
    };
  } catch (e) {
    debugPrint('Apple sign-in error: $e');
    return 'Apple sign-in failed. Please try again.';
  }
}

Future<String?> _googleSignIn() async {
  try {
    await AuthService.signInWithGoogle();
    return null;
  } on GoogleSignInException catch (e) {
    debugPrint('Google sign-in error: ${e.code} ${e.description}');
    return e.code == GoogleSignInExceptionCode.canceled ? '' : 'Google sign-in failed. Please try again.';
  } on FirebaseAuthException catch (e) {
    debugPrint('Google sign-in Firebase error: ${e.code} ${e.message}');
    return switch (e.code) {
      'popup-closed-by-user' || 'cancelled-popup-request' => '',
      'popup-blocked' => 'Your browser blocked the sign-in popup. Allow popups and try again.',
      'account-exists-with-different-credential' => _linkMessage(),
      'email-already-in-use' => 'This email is already registered. Please login instead.',
      _ => 'Google sign-in failed. Please try again.',
    };
  } on UnsupportedError {
    return "Google sign-in isn't available on this device. Use email and password instead.";
  } catch (e) {
    debugPrint('Google sign-in error: $e');
    return 'Google sign-in failed. Please try again.';
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  String _error = '';
  bool _busy = false;
  bool _googleBusy = false;
  bool _appleBusy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await AuthService.loginWithEmail(_email.text.trim(), _password.text);
    } on FirebaseAuthException catch (e) {
      setState(
        () => _error = switch (e.code) {
          'user-not-found' || 'wrong-password' || 'invalid-credential' || 'invalid-email' => 'Incorrect email or password.',
          _ => 'Login failed. Please try again.',
        },
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _forgotPassword() async {
    final email = await promptText(
      context,
      title: 'Reset password',
      message: "Enter your account's email and we'll send you a link to set a new password.",
      placeholder: 'Email',
      initialValue: _email.text.trim(),
      keyboardType: TextInputType.emailAddress,
      confirmLabel: 'Send link',
    );
    if (email == null || email.trim().isEmpty || !mounted) return;
    try {
      await AuthService.sendPasswordReset(email);
      if (!mounted) return;
      await alertDialog(
        context,
        title: 'Check your email',
        message: "If an account with a password exists for ${email.trim()}, a reset link is on its way. Check your spam folder if you don't see it.",
      );
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = switch (e.code) {
          'invalid-email' => "That email address doesn't look right.",
          'too-many-requests' => 'Too many attempts. Please wait a bit and try again.',
          _ => "Couldn't send the reset email. Please try again.",
        },
      );
    }
  }

  Future<void> _apple() async {
    setState(() {
      _appleBusy = true;
      _error = '';
    });
    final err = await _appleSignIn();
    if (mounted) {
      setState(() {
        _appleBusy = false;
        _error = err ?? '';
      });
    }
  }

  Future<void> _google() async {
    setState(() {
      _googleBusy = true;
      _error = '';
    });
    final err = await _googleSignIn();
    if (mounted) {
      setState(() {
        _googleBusy = false;
        _error = err ?? '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final line = Expanded(child: Container(height: 1, color: Palette.separator(context)));
    return _AuthFrame(
      child: _AuthCard(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Heading('Sign In', size: 24),
              const SizedBox(height: 4),
              _SwitchLine(prompt: "Don't have an account?", action: 'Sign Up', onTap: () => context.go('/register')),
            ],
          ),
          AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: _gap([
                AppTextField(
                  controller: _email,
                  placeholder: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                ),
                AppTextField(
                  controller: _password,
                  placeholder: 'Password',
                  obscure: true,
                  textInputAction: TextInputAction.go,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _login(),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: LinkText('Forgot password?', size: 13, color: Palette.gray500, onPressed: _forgotPassword),
                ),
                if (_error.isNotEmpty) _ErrorMessage(_error),
                AppButton(label: 'Sign In', size: AppButtonSize.full, loading: _busy, onPressed: _login),
              ], 12),
            ),
          ),
          Row(
            children: [
              line,
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Muted('or', color: Palette.gray400),
              ),
              line,
            ],
          ),
          _oauthButtons(onApple: _apple, appleBusy: _appleBusy, onGoogle: _google, googleBusy: _googleBusy),
        ],
      ),
    );
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _withEmail = false;
  String _error = '';
  bool _busy = false;
  bool _googleBusy = false;
  bool _appleBusy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty || _name.text.trim().isEmpty) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      if (!await AuthService.isNameAllowed(_name.text.trim())) {
        setState(() => _error = AuthService.blockedNameMessage);
        return;
      }
      await AuthService.registerWithEmail(_email.text.trim(), _password.text, _name.text.trim());
    } on FirebaseAuthException catch (e) {
      setState(
        () => _error = switch (e.code) {
          'email-already-in-use' => 'This email is already registered. Please login instead.',
          'weak-password' => 'Password should be at least 6 characters.',
          'invalid-email' => 'Please enter a valid email address.',
          _ => 'Registration failed. Please try again.',
        },
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _apple() async {
    setState(() {
      _appleBusy = true;
      _error = '';
    });
    final err = await _appleSignIn();
    if (mounted) {
      setState(() {
        _appleBusy = false;
        _error = err ?? '';
      });
    }
  }

  Future<void> _google() async {
    setState(() {
      _googleBusy = true;
      _error = '';
    });
    final err = await _googleSignIn();
    if (mounted) {
      setState(() {
        _googleBusy = false;
        _error = err ?? '';
      });
    }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(
    child: AnimatedSwitcher(
      duration: const Duration(milliseconds: 150),
      transitionBuilder: (child, anim) => FadeTransition(
        opacity: anim,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, .08), end: Offset.zero).animate(anim),
          child: child,
        ),
      ),
      child: _withEmail ? _emailCard(context) : _choicesCard(context),
    ),
  );

  Widget _choicesCard(BuildContext context) => _AuthCard(
    key: const ValueKey('choices'),
    children: [
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Heading('Create account', size: 24),
          const SizedBox(height: 4),
          _SwitchLine(prompt: 'Already have an account?', action: 'Sign In', onTap: () => context.go('/login')),
        ],
      ),
      if (_error.isNotEmpty) _ErrorMessage(_error),
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _oauthButtons(onApple: _apple, appleBusy: _appleBusy, onGoogle: _google, googleBusy: _googleBusy),
          const SizedBox(height: 12),
          AppButton(
            label: 'Continue with email',
            size: AppButtonSize.full,
            onPressed: () => setState(() {
              _withEmail = true;
              _error = '';
            }),
          ),
        ],
      ),
    ],
  );

  Widget _emailCard(BuildContext context) => _AuthCard(
    key: const ValueKey('email'),
    children: [
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Heading('Create your account', size: 24),
          LinkText('Back', icon: FontAwesomeIcons.arrowLeft.data, size: 15, onPressed: () => setState(() => _withEmail = false)),
        ],
      ),
      AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _gap([
            AppTextField(
              controller: _email,
              placeholder: 'Email',
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.email],
            ),
            AppTextField(
              controller: _password,
              placeholder: 'Password',
              obscure: true,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.newPassword],
            ),
            AppTextField(
              controller: _name,
              placeholder: 'Display Name',
              maxLength: 16,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.name],
              onSubmitted: (_) => _register(),
            ),
            if (_error.isNotEmpty) _ErrorMessage(_error),
            AppButton(label: 'Register', size: AppButtonSize.full, loading: _busy, onPressed: _register),
          ], 12),
        ),
      ),
    ],
  );
}

class VerifyEmailScreen extends StatefulWidget {
  const VerifyEmailScreen({super.key});

  @override
  State<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends State<VerifyEmailScreen> {
  bool _sending = false;
  String? _status;
  bool _statusOk = true;

  Future<void> _resend() async {
    if (_sending) return;
    final user = FirebaseAuth.instance.currentUser;
    setState(() {
      _sending = true;
      _status = null;
    });
    try {
      if (user != null) await AuthService.sendVerification(user);
      _statusOk = true;
      _status = 'Verification email resent to ${user?.email}. It can take a few minutes to arrive.';
    } on FirebaseAuthException catch (e) {
      _statusOk = false;
      _status = e.code == 'too-many-requests'
          ? "You've requested a few emails already. Please wait a minute before resending."
          : "Couldn't resend the email. Please try again.";
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = FirebaseAuth.instance.currentUser?.email ?? '';
    return CupertinoPageScaffold(
      backgroundColor: Palette.fill(context),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FadeSlideIn(
              child: Container(
                constraints: const BoxConstraints(maxWidth: 384),
                padding: const EdgeInsets.all(40),
                decoration: BoxDecoration(
                  color: Palette.card(context),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 6, offset: Offset(0, 4), spreadRadius: -1)],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: _gap([
                    Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: Palette.blue100),
                      child: Icon(FontAwesomeIcons.envelope.data, size: 28, color: Palette.blue600),
                    ),
                    Column(
                      children: [
                        const Heading('Verify your email', size: 20),
                        const SizedBox(height: 4),
                        Text.rich(
                          TextSpan(
                            children: [
                              const TextSpan(text: 'We sent a verification link to '),
                              TextSpan(
                                text: email,
                                style: const TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const TextSpan(text: '. Click it to continue.'),
                            ],
                          ),
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 14, color: Palette.secondary(context)),
                        ),
                      ],
                    ),
                    AppButton(
                      label: 'Resend email',
                      style: AppButtonStyle.blue,
                      size: AppButtonSize.sm,
                      loading: _sending,
                      onPressed: _resend,
                    ),
                    if (_status != null)
                      Text(
                        _status!,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Palette.resolve(context, _statusOk ? Palette.green600 : Palette.red500)),
                      ),
                    Column(
                      children: [
                        Muted("Don't see it? Check your spam or junk folder.", size: 12, center: true, color: Palette.gray400),
                        const SizedBox(height: 20),
                        Muted('This page will update automatically once verified.', size: 12, center: true, color: Palette.gray400),
                        const SizedBox(height: 12),
                        LinkText('Use a different account', size: 13, color: Palette.gray500, onPressed: AuthService.signOut),
                      ],
                    ),
                  ], 20),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
