// components/InstructorCard.tsx: an instructor's points, tasks completed,
// tasks given, the roles they run and the roles they're in. Opened from the
// Admin screen's Instructors tab, and from a role's Instructors tab, where the
// role adds the options to make them its owner or take them off it.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';
import 'dialogs.dart';

Future<void> showInstructorCard(BuildContext context, String uid, {Role? role}) => showModalCard<void>(
  context,
  padding: EdgeInsets.zero,
  builder: (_) => InstructorCard(uid: uid, role: role),
);

class InstructorCard extends StatefulWidget {
  const InstructorCard({super.key, required this.uid, this.role});

  final String uid;

  /// The role it was opened from, for the owner and remove options.
  final Role? role;

  @override
  State<InstructorCard> createState() => _InstructorCardState();
}

class _InstructorCardState extends State<InstructorCard> {
  late final Stream<UserData?> _person = Db.userStream(widget.uid);
  late final Stream<List<Role>> _running = Db.rolesRunByStream(widget.uid);
  bool _busy = false;

  Future<void> _act(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      showToast(context, done);
      Navigator.of(context).pop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _busy = false);
      showToast(context, "That didn't go through. Please try again.", error: true);
    }
  }

  Future<void> _makeOwner(AppState app, Role role, String name) async {
    final handingOn = role.owner == app.user!.uid && !app.isAdmin;
    final ok = await confirmDialog(
      context,
      title: 'Make Owner?',
      message: handingOn
          ? "$name will own ${role.name} instead of you. You'll stay one of its instructors, but you'll need $name's approval for bigger changes."
          : "$name will own ${role.name}. Its other instructors will need $name's approval to rename or reset it, edit members' stats, kick members or change the rewards title.",
      confirmLabel: 'Make Owner',
    );
    if (ok) await _act(() => Db.setRoleOwner(role.id, widget.uid), '$name now owns ${role.name}');
  }

  Future<void> _clearOwner(Role role) async {
    final ok = await confirmDialog(
      context,
      title: 'Remove Owner?',
      message: "${role.name} will have no owner, so its instructors' change requests will come to admins instead.",
      confirmLabel: 'Remove Owner',
      destructive: true,
    );
    if (ok) await _act(() => Db.setRoleOwner(role.id, ''), '${role.name} has no owner now');
  }

  Future<void> _remove(Role role, String name) async {
    final ok = await confirmDialog(
      context,
      title: 'Remove Instructor?',
      message:
          "$name will stay a member of ${role.name} but won't be able to run it any more."
          '${role.owner == widget.uid ? ' The role will be left without an owner.' : ''}',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (ok) await _act(() => Db.removeRoleInstructor(role, widget.uid), '$name no longer runs ${role.name}');
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return StreamBuilder<UserData?>(
      stream: _person,
      builder: (context, snap) {
        if (!snap.hasData && snap.connectionState == ConnectionState.waiting) {
          return const SizedBox(height: 240, child: Center(child: CupertinoActivityIndicator()));
        }
        final p = snap.data;
        if (p == null) {
          return const Padding(padding: EdgeInsets.all(24), child: EmptyState('This account no longer exists.'));
        }
        return StreamBuilder<List<Role>>(
          stream: _running,
          builder: (context, rolesSnap) => _body(context, app, p, (rolesSnap.data ?? const []).where((r) => r.id != globalRoleId).toList()),
        );
      },
    );
  }

  Widget _body(BuildContext context, AppState app, UserData p, List<Role> running) {
    final me = app.user!.uid;
    final name = p.name.isEmpty ? 'Unknown User' : p.name;
    final stillInstructor = app.instructors.contains(widget.uid);
    final runningIds = {for (final r in running) r.id};
    final memberOf = p.roles.where((r) => r.id != globalRoleId && !runningIds.contains(r.id)).map((r) => r.name).toList();

    // Role actions: admins, or this role's owner (who can hand it on and take other instructors off it)
    final role = widget.role;
    final runsRole = role != null && role.instructors.contains(widget.uid);
    final isOwner = role != null && role.owner == widget.uid;
    final canMakeOwner = runsRole && !isOwner && stillInstructor && (app.isAdmin || role.owner == me);
    final canClearOwner = isOwner && app.isAdmin;
    final canRemove = runsRole && (app.isAdmin || (role.owner == me && widget.uid != me));

    const bannerHeight = 80.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
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
              padding: const EdgeInsets.only(top: bannerHeight - Avatar.xs / 2 - 4),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(color: Palette.card(context), shape: BoxShape.circle),
                child: Avatar(p.photoURL, name: name, size: Avatar.xs + 16),
              ),
            ),
            Positioned(
              top: 10,
              right: 10,
              child: Pressable(
                onPressed: () => Navigator.of(context).pop(),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: const BoxDecoration(color: Color(0x33FFFFFF), shape: BoxShape.circle),
                  child: const Icon(CupertinoIcons.xmark, size: 16, color: Color(0xFFFFFFFF)),
                ),
              ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(child: Heading(name, size: 20, maxLines: 2)),
              const SizedBox(height: 6),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 6,
                runSpacing: 6,
                children: [
                  Tag(
                    stillInstructor ? 'Instructor' : 'No longer an Instructor',
                    color: stillInstructor ? const Color(0xFF9333EA) : Palette.gray400,
                  ),
                  if (runsRole)
                    Tag(
                      isOwner ? 'Owner of ${role.name}' : 'Runs ${role.name}',
                      color: isOwner ? const Color(0xFFD97706) : Palette.blue600,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _stat(context, 'Points', p.points, FontAwesomeIcons.trophy.data, const Color(0xFFD97706)),
                  const SizedBox(width: 8),
                  _stat(context, 'Tasks Done', p.taskCompleted, FontAwesomeIcons.circleCheck.data, Palette.green600),
                  const SizedBox(width: 8),
                  _stat(context, 'Tasks Given', p.tasksGiven, FontAwesomeIcons.clipboardList.data, Palette.blue600),
                ],
              ),
              const SizedBox(height: 16),
              _roleList(context, 'Instructing', running.map((r) => r.name).toList(), 'Not running any roles.'),
              const SizedBox(height: 14),
              _roleList(context, 'Member of', memberOf, 'Not in any other roles.'),
              if (canMakeOwner || canClearOwner || canRemove) ...[
                const SizedBox(height: 16),
                Container(height: 1, color: Palette.separator(context)),
                const SizedBox(height: 16),
                if (canMakeOwner) ...[
                  AppButton(
                    label: 'Make Owner of ${role.name}',
                    style: AppButtonStyle.blue,
                    size: AppButtonSize.full,
                    loading: _busy,
                    onPressed: () => _makeOwner(app, role, name),
                  ),
                  const SizedBox(height: 8),
                ],
                if (canClearOwner) ...[
                  AppButton(
                    label: 'Remove as Owner',
                    style: AppButtonStyle.gray,
                    size: AppButtonSize.full,
                    loading: _busy,
                    onPressed: () => _clearOwner(role),
                  ),
                  const SizedBox(height: 8),
                ],
                if (canRemove)
                  AppButton(
                    label: 'Remove as Instructor',
                    style: AppButtonStyle.red,
                    size: AppButtonSize.full,
                    loading: _busy,
                    onPressed: () => _remove(role, name),
                  ),
              ],
              if (app.isAdmin) ...[
                const SizedBox(height: 12),
                Center(
                  child: LinkText(
                    'Open their user page',
                    size: 14,
                    bold: true,
                    color: Palette.navActive,
                    onPressed: () {
                      final router = GoRouter.of(context);
                      Navigator.of(context).pop();
                      router.push('/admin/users/${widget.uid}');
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _stat(BuildContext context, String label, int value, IconData icon, Color tint) {
    final dark = Palette.isDark(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: dark ? .16 : .08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: tint.withValues(alpha: dark ? .35 : .2)),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 10, color: tint),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 10.5, letterSpacing: .5, fontWeight: FontWeight.w700, color: tint),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              '$value',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Palette.label(context)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _roleList(BuildContext context, String title, List<String> names, String empty) {
    final sorted = [...names]..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(title, padding: EdgeInsets.zero),
        const SizedBox(height: 8),
        if (sorted.isEmpty)
          Muted(empty, size: 13, color: Palette.gray400)
        else
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final n in sorted)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Palette.fill(context),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Palette.separator(context)),
                  ),
                  child: Text(n, style: TextStyle(fontSize: 13, color: Palette.label(context))),
                ),
            ],
          ),
      ],
    );
  }
}
