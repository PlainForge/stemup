// pages/AdminUserPage.tsx (admins only): one user's photo, name and email, the
// roles they're in and run, and switches for Instructor access and the global
// leaderboard.
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import '../widgets/page_scaffold.dart';

/// /admin/users/:uid
class AdminUserScreen extends StatefulWidget {
  const AdminUserScreen({super.key, required this.uid});

  final String uid;

  @override
  State<AdminUserScreen> createState() => _AdminUserScreenState();
}

class _AdminUserScreenState extends State<AdminUserScreen> {
  late final Stream<UserData?> _user = Db.userStream(widget.uid);
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't save that change. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setInstructor(UserData u, bool make) async {
    if (!make) {
      final ok = await confirmDialog(
        context,
        title: 'Remove Instructor?',
        message: "${u.name} will go back to being a User. They stay in their roles but can't run them any more.",
        confirmLabel: 'Remove',
        destructive: true,
      );
      if (!ok) return;
    }
    await _run(() => make ? Db.grantInstructor(u.uid) : Db.revokeInstructor(u.uid));
  }

  Future<void> _purge(UserData u) async {
    final ok = await confirmDialog(
      context,
      title: 'Remove Deleted Account?',
      message:
          "Remove what's left of ${u.name}? Their profile, role memberships, tasks and requests are deleted. "
          'This only works if their account was already deleted.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await Db.purgeDeletedAccount(u.uid);
      if (mounted) context.canPop() ? context.pop() : context.go('/admin');
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        await alertDialog(
          context,
          title: 'Not removed',
          message: e.code == 'failed-precondition' ? (e.message ?? "Couldn't remove it.") : "Couldn't remove it. Please try again.",
        );
      }
    } catch (_) {
      if (mounted) await alertDialog(context, title: 'Not removed', message: "Couldn't remove it. Please try again.");
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (!app.isAdmin) return const LoadingView();
    return StreamBuilder<UserData?>(
      stream: _user,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting && !snap.hasData) return const LoadingView();
        final u = snap.data;
        if (u == null) {
          return const PageScaffold(backLabel: 'Users', backPath: '/admin', children: [EmptyState('This account no longer exists.')]);
        }
        final level = app.accessOf(u.uid);
        final memberOf = app.roles.where((r) => r.id != globalRoleId && r.members.contains(u.uid)).toList()
          ..sort((a, b) => a.name.compareTo(b.name));
        final instructing = memberOf.where((r) => r.instructors.contains(u.uid)).toList();
        final request = app.adminRequests.where((r) => r.type == RequestType.instructor && r.uid == u.uid).firstOrNull;

        return PageScaffold(
          backLabel: 'Back',
          backPath: '/admin',
          children: [
            _header(context, u, level),
            _accessCard(context, u, level, request),
            AppCard(
              shadow: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SectionLabel('Roles'),
                  if (level == AccessLevel.admin)
                    const Muted('Admins are in every role automatically.')
                  else if (memberOf.isEmpty)
                    const Muted('Not in any roles yet.', color: Palette.gray400)
                  else
                    _RoleList(memberOf),
                ],
              ),
            ),
            if (level == AccessLevel.instructor)
              AppCard(
                shadow: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionLabel('Instructing'),
                    if (instructing.isEmpty)
                      const Muted("They aren't running any roles yet.", color: Palette.gray400)
                    else
                      _RoleList(instructing),
                  ],
                ),
              ),
            if (level != AccessLevel.admin)
              DangerZone(
                title: 'Deleted Account',
                text:
                    "If ${u.name} deleted their account but still shows up here or on a leaderboard, this clears what's left. "
                    'It only works once their account is really gone; anyone who can still sign in is left alone.',
                button: AppButton(
                  label: 'Remove Deleted Account',
                  style: AppButtonStyle.red,
                  size: AppButtonSize.sm,
                  loading: _busy,
                  onPressed: () => _purge(u),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _header(BuildContext context, UserData u, AccessLevel level) {
    const bannerHeight = 80.0;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Palette.card(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Palette.resolve(context, Palette.gray100)),
      ),
      child: Column(
        children: [
          Stack(
            alignment: Alignment.topCenter,
            children: [
              Container(
                height: bannerHeight,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Palette.blue500, Palette.blue600, Color(0xFF4F46E5)],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: bannerHeight - Avatar.sm / 2),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(color: Palette.card(context), shape: BoxShape.circle),
                  child: Avatar(u.photoURL, name: u.name, size: Avatar.sm),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              children: [
                Heading(u.name, size: 20, maxLines: 2),
                const SizedBox(height: 6),
                AccessTag(level),
                const SizedBox(height: 10),
                if (u.email.isEmpty)
                  const Muted('No email on file', color: Palette.gray400)
                else
                  Pressable(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: u.email));
                      if (context.mounted) showToast(context, 'Email copied');
                    },
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(FontAwesomeIcons.envelope.data, size: 13, color: Palette.resolve(context, Palette.gray400)),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            u.email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, color: Palette.secondary(context)),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Icon(CupertinoIcons.doc_on_doc, size: 12, color: Palette.resolve(context, Palette.gray400)),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                CopyIdChip(u.uid, copiedMessage: 'User ID copied'),
                if (u.aboutMe.isNotEmpty) ...[const SizedBox(height: 14), AboutMeBox(u.aboutMe)],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _accessCard(BuildContext context, UserData u, AccessLevel level, StemRequest? request) => AppCard(
    shadow: false,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel('Access'),
        switch (level) {
          AccessLevel.admin => const Muted('Admins can do everything. Admin access is set by a developer.'),
          AccessLevel.instructor => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Muted("They can request new roles and run the roles they've been given."),
              const SizedBox(height: 12),
              AppButton(
                label: 'Remove Instructor',
                style: AppButtonStyle.red,
                size: AppButtonSize.sm,
                loading: _busy,
                onPressed: () => _setInstructor(u, false),
              ),
            ],
          ),
          AccessLevel.user => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (request != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Palette.resolve(context, const Color(0xFFFFFBEB)),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: .4)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Asked to become an Instructor',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFFB45309)),
                      ),
                      if (request.reason.isNotEmpty) ...[const SizedBox(height: 4), Muted(request.reason)],
                    ],
                  ),
                )
              else
                const Muted("They haven't asked to be an Instructor. You can still make them one."),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  AppButton(
                    label: 'Make Instructor',
                    style: AppButtonStyle.blue,
                    size: AppButtonSize.sm,
                    loading: _busy,
                    onPressed: () => _setInstructor(u, true),
                  ),
                  if (request != null)
                    AppButton(
                      label: 'Decline Request',
                      style: AppButtonStyle.gray,
                      size: AppButtonSize.sm,
                      onPressed: _busy ? null : () => _run(() => Db.declineAccessRequest(request.id)),
                    ),
                ],
              ),
            ],
          ),
        },
        const SizedBox(height: 16),
        SwitchRow(
          label: 'Global leaderboard',
          hint: switch (level) {
            AccessLevel.user => 'Let them see it on their Home page',
            AccessLevel.instructor => 'Instructors can always see it',
            AccessLevel.admin => 'Admins can always see it',
          },
          value: level != AccessLevel.user || u.canSeeGlobal,
          onChanged: level != AccessLevel.user || _busy ? null : (v) => _run(() => Db.setCanSeeGlobal(u.uid, v)),
        ),
      ],
    ),
  );
}

class _RoleList extends StatelessWidget {
  const _RoleList(this.roles);

  final List<Role> roles;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final r in roles)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Pressable(
            scale: .98,
            onPressed: () => context.push('/admin/roles/${r.id}'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Palette.card(context),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Palette.separator(context)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: Palette.resolve(context, Palette.blue50), borderRadius: BorderRadius.circular(8)),
                    child: Icon(FontAwesomeIcons.users.data, size: 13, color: Palette.resolve(context, Palette.navActive)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                        ),
                        if (r.purpose.trim().isNotEmpty) Muted(r.purpose.trim(), size: 12, maxLines: 1, color: Palette.gray400),
                      ],
                    ),
                  ),
                  Icon(FontAwesomeIcons.chevronRight.data, size: 13, color: Palette.resolve(context, Palette.gray300)),
                ],
              ),
            ),
          ),
        ),
    ],
  );
}
