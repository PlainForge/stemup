// pages/SettingsPage.tsx as it renders on a phone (including its mobile-only
// "App" card), plus a "Reduce glass effects" switch for the native tab bar.
import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/auth_service.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import '../widgets/page_scaffold.dart';
import 'auth_screens.dart' show privacyPolicyUrl;
import 'bug_report_sheet.dart';
import 'semester_reset_sheet.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _name = TextEditingController();
  Uint8List? _photo;
  String _photoType = 'image/jpeg';
  bool _saving = false;
  bool _deleting = false;
  String? _loadedFor;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final source = await pickOption<ImageSource>(
      context,
      options: const [(ImageSource.camera, 'Take Photo'), (ImageSource.gallery, 'Choose from Library')],
    );
    if (source == null) return;
    // No resizing or recompression: the photo is uploaded at its original size and quality
    // (formats browsers can't show, like HEIC, come back from the picker as full-quality JPEG)
    final file = await ImagePicker().pickImage(source: source);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final ext = file.name.split('.').last.toLowerCase();
    setState(() {
      _photo = bytes;
      _photoType =
          file.mimeType ??
          switch (ext) {
            'png' => 'image/png',
            'gif' => 'image/gif',
            'webp' => 'image/webp',
            _ => 'image/jpeg',
          };
    });
  }

  Future<void> _save(UserData me) async {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    setState(() => _saving = true);
    try {
      if (name != me.name && !await AuthService.isNameAllowed(name)) {
        if (mounted) await alertDialog(context, title: 'Name not saved', message: AuthService.blockedNameMessage);
        return;
      }
      await AuthService.setAccountInformation(name: name, photo: _photo, contentType: _photoType, userData: me);
      setState(() => _photo = null);
      if (mounted) showToast(context, 'Changes saved successfully!');
    } catch (_) {
      if (mounted) showToast(context, "Couldn't save changes. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _deleteAccount(UserData me) async {
    final ok = await confirmDialog(
      context,
      title: 'Delete Account?',
      message: 'This permanently deletes your account, tasks, and role memberships. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _deleting = true);
    try {
      final done = await AuthService.deleteAccount(
        me,
        () => promptText(
          context,
          title: 'Confirm Deletion',
          message: 'Please enter your password to confirm deletion:',
          placeholder: 'Password',
          obscure: true,
          confirmLabel: 'Delete',
          destructive: true,
        ),
      );
      if (!done && mounted) setState(() => _deleting = false);
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      await alertDialog(
        context,
        title: "Couldn't delete account",
        message: e.code == 'wrong-password' || e.code == 'invalid-credential' ? 'That password is incorrect.' : 'Please try again.',
      );
    } catch (_) {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final me = app.userData;
    if (me == null) return const LoadingView();
    if (_loadedFor != me.uid) {
      _loadedFor = me.uid;
      _name.text = me.name;
    }
    String? currentRoleName;
    for (final r in app.roles) {
      if (r.id == me.currentRole) currentRoleName = r.name;
    }

    return PageScaffold(
      title: 'Account Settings',
      children: [
        // User ID under the title, tap to copy (same chip as the role ID)
        Transform.translate(
          offset: const Offset(0, -16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: CopyIdChip(me.uid, copiedMessage: 'User ID copied'),
          ),
        ),

        // ── Profile ──
        _Card(
          title: 'Profile',
          children: [
            Center(
              child: Column(
                children: [
                  _photo != null
                      ? Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: avatarFill(context),
                            border: Border.all(color: Palette.separator(context)),
                          ),
                          child: ClipOval(
                            child: Image.memory(_photo!, width: Avatar.md, height: Avatar.md, fit: BoxFit.contain),
                          ),
                        )
                      : Avatar(me.photoURL, name: me.name),
                  const SizedBox(height: 8),
                  Pressable(
                    onPressed: _pickPhoto,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: const Color(0xFF111827), borderRadius: BorderRadius.circular(12)),
                      child: const Text('Change Photo', style: TextStyle(fontSize: 12, color: Color(0xFFFFFFFF))),
                    ),
                  ),
                ],
              ),
            ),
            _Field(
              label: 'Display Name',
              child: AppTextField(controller: _name, placeholder: '', maxLength: 16),
            ),
            _Field(
              label: 'Current Role',
              child: _InsetRow(
                label: currentRoleName ?? 'No role selected',
                muted: currentRoleName == null,
                action: AppButton(
                  label: 'Reset',
                  style: AppButtonStyle.red,
                  size: AppButtonSize.xsm,
                  onPressed: () => Db.setCurrentRole(me.uid, ''),
                ),
              ),
            ),
            // Save / Undo only while there are unsaved changes
            ValueListenableBuilder(
              valueListenable: _name,
              builder: (context, value, _) {
                final changed = value.text.trim() != me.name || _photo != null;
                return AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeOutCubic,
                  child: !changed
                      ? const SizedBox(width: double.infinity)
                      : Container(
                          padding: const EdgeInsets.only(top: 20),
                          decoration: BoxDecoration(
                            border: Border(top: BorderSide(color: Palette.resolve(context, Palette.gray100))),
                          ),
                          child: Row(
                            children: [
                              AppButton(
                                label: 'Save Changes',
                                style: AppButtonStyle.blue,
                                size: AppButtonSize.sm,
                                loading: _saving,
                                onPressed: () => _save(me),
                              ),
                              const SizedBox(width: 12),
                              AppButton(
                                label: 'Undo',
                                style: AppButtonStyle.gray,
                                size: AppButtonSize.xsm,
                                onPressed: () => setState(() {
                                  _name.text = me.name;
                                  _photo = null;
                                }),
                              ),
                            ],
                          ),
                        ),
                );
              },
            ),
          ],
        ),

        // ── Access level: User < Instructor < Admin ──
        const _AccessCard(),

        // ── App ──
        _Card(
          title: 'App',
          children: [
            _InsetRow(
              label: 'Appearance',
              action: AppButton(
                label: _themeLabel(app.themePref),
                icon: switch (app.themePref) {
                  ThemePref.system => FontAwesomeIcons.circleHalfStroke,
                  ThemePref.light => FontAwesomeIcons.sun,
                  ThemePref.dark => FontAwesomeIcons.moon,
                }.data,
                style: AppButtonStyle.gray,
                size: AppButtonSize.sm,
                onPressed: () async {
                  final picked = await pickOption<ThemePref>(
                    context,
                    title: 'Appearance',
                    selected: app.themePref,
                    options: [for (final t in ThemePref.values) (t, _themeLabel(t))],
                  );
                  if (picked != null) app.setThemePref(picked);
                },
              ),
            ),
            _InsetRow(
              label: app.isAdmin ? 'Bug Reports' : 'Report a bug',
              action: AppButton(
                label: app.isAdmin ? 'View' : 'Report',
                icon: (app.isAdmin ? FontAwesomeIcons.wrench : FontAwesomeIcons.bug).data,
                style: AppButtonStyle.gray,
                size: AppButtonSize.sm,
                onPressed: () => showBugReportSheet(context),
              ),
            ),
            _InsetRow(
              label: 'Reduce glass effects',
              action: CupertinoSwitch(value: app.reduceGlass, activeTrackColor: Palette.blue600, onChanged: app.setReduceGlass),
            ),
          ],
        ),

        // ── Account ──
        _Card(
          title: 'Account',
          children: [
            _InsetRow(
              label: 'Sign out of this device',
              action: AppButton(
                label: 'Sign Out',
                icon: FontAwesomeIcons.rightFromBracket.data,
                style: AppButtonStyle.gray,
                size: AppButtonSize.sm,
                onPressed: AuthService.signOut,
              ),
            ),
          ],
        ),

        // ── Danger zone ──
        _Card(
          title: 'Danger Zone',
          danger: true,
          children: [
            const Muted('Once you delete your account, there is no going back.'),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(
                label: 'Delete My Account',
                style: AppButtonStyle.red,
                size: AppButtonSize.md,
                loading: _deleting,
                onPressed: () => _deleteAccount(me),
              ),
            ),
          ],
        ),

        if (app.isAdmin)
          _Card(
            title: 'Semester Reset',
            danger: true,
            children: [
              const Muted(
                'Remove old roles to get ready for a new semester. Users whose only roles are removed will be '
                'permanently deleted along with their tasks; everyone else keeps their account, with points '
                'and completed tasks reset to 0.',
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: AppButton(
                  label: 'Reset for New Semester',
                  style: AppButtonStyle.red,
                  size: AppButtonSize.md,
                  onPressed: () => showSemesterResetSheet(context),
                ),
              ),
            ],
          ),

        Center(
          child: LinkText('Privacy Policy', size: 13, color: Palette.gray400, onPressed: () => launchUrl(privacyPolicyUrl)),
        ),
      ],
    );
  }
}

/// `bg-white rounded-2xl border border-gray-100 shadow-sm p-6` with a caption.
class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children, this.danger = false});

  final String title;
  final List<Widget> children;
  final bool danger;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: Palette.card(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: danger ? (Palette.isDark(context) ? const Color(0xFF7F1D1D) : Palette.red100) : Palette.resolve(context, Palette.gray100),
      ),
      boxShadow: Palette.isDark(context) ? null : const [BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1))],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionLabel(
          title,
          color: danger ? Palette.red400 : null,
          padding: EdgeInsets.only(bottom: danger ? 4 : 20),
        ),
        for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(height: danger ? 16 : 16), children[i]],
      ],
    ),
  );
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        label,
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.resolve(context, const Color(0xFF4B5563))),
      ),
      const SizedBox(height: 6),
      child,
    ],
  );
}

/// `bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl` row with a label and an action.
class _InsetRow extends StatelessWidget {
  const _InsetRow({required this.label, required this.action, this.muted = false});

  final String label;
  final Widget action;
  final bool muted;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
    decoration: BoxDecoration(
      color: Palette.fill(context),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Palette.separator(context)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(label, style: TextStyle(fontSize: 14, color: muted ? Palette.tertiary(context) : Palette.label(context))),
        ),
        const SizedBox(width: 8),
        action,
      ],
    ),
  );
}

/// Shows the person's access level. Users can ask to become an Instructor;
/// Instructors can hide the global leaderboard on Home.
class _AccessCard extends StatefulWidget {
  const _AccessCard();

  @override
  State<_AccessCard> createState() => _AccessCardState();
}

class _AccessCardState extends State<_AccessCard> {
  final _reason = TextEditingController();
  StreamSubscription<List<StemRequest>>? _sub;
  StemRequest? _request;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Only Users can have an open Instructor request (and tests run with no signed-in user)
    final app = context.read<AppState>();
    final uid = app.user?.uid;
    if (uid == null || app.access != AccessLevel.user) return;
    _sub = Db.myRequestsStream(uid).listen((r) {
      if (mounted) setState(() => _request = r.where((x) => x.type == RequestType.instructor).firstOrNull);
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _sub?.cancel();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send(AppState app) async {
    if (_reason.text.trim().isEmpty) {
      await alertDialog(context, title: 'Reason needed', message: "Please tell the admins why you'd like to be an Instructor.");
      return;
    }
    setState(() => _sending = true);
    try {
      final uid = app.user?.uid;
      if (uid == null) return;
      await Db.requestInstructor(uid, app.userData?.name ?? '', _reason.text);
      _reason.clear();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't send your request. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final access = app.access;
    final request = _request;
    return _Card(
      title: 'Access',
      children: [
        _InsetRow(label: 'Your role', action: AccessTag(access)),
        Muted(switch (access) {
          AccessLevel.admin => 'You can join any role, run every role from the Admin tab, and make people Instructors.',
          AccessLevel.instructor => "You can request new roles, run the roles you've been given, and add other instructors to them.",
          AccessLevel.user => 'You can join roles, complete tasks and earn points. Instructors create and run roles.',
        }),
        if (access == AccessLevel.instructor)
          _InsetRow(
            label: 'Show the global leaderboard on Home',
            action: CupertinoSwitch(
              value: app.userData?.showGlobalLeaderboard ?? true,
              activeTrackColor: Palette.green500,
              onChanged: (v) => Db.setShowGlobalLeaderboard(app.userData!.uid, v),
            ),
          ),
        if (access == AccessLevel.user)
          if (request != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: Palette.amber50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFDE68A)),
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Your request to become an Instructor is waiting for an admin.',
                      style: TextStyle(fontSize: 14, color: Palette.amber700),
                    ),
                  ),
                  const SizedBox(width: 8),
                  AppButton(
                    label: 'Withdraw',
                    size: AppButtonSize.xsm,
                    style: AppButtonStyle.gray,
                    onPressed: () => Db.deleteRequest(request.id),
                  ),
                ],
              ),
            )
          else
            _Field(
              label: 'Become an Instructor',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppTextField(controller: _reason, placeholder: 'Why would you like to be an Instructor?', maxLines: 3, maxLength: 500),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: AppButton(
                      label: 'Send Request',
                      style: AppButtonStyle.blue,
                      size: AppButtonSize.sm,
                      loading: _sending,
                      onPressed: () => _send(app),
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

String _themeLabel(ThemePref t) => switch (t) {
  ThemePref.system => 'Device Theme',
  ThemePref.light => 'Light',
  ThemePref.dark => 'Dark',
};
