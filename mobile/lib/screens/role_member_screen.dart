// pages/RoleMemberPage.tsx: one member of a role, for the people who run it.
// Their stats and tasks in this role, with editing and kicking.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import '../widgets/page_scaffold.dart';
import 'role_admin.dart' show EditMemberCard, PendingNotice;

/// /roles/:id/members/:uid and /admin/roles/:id/members/:uid
class RoleMemberScreen extends StatefulWidget {
  const RoleMemberScreen({super.key, required this.roleId, required this.uid});

  final String roleId;
  final String uid;

  @override
  State<RoleMemberScreen> createState() => _RoleMemberScreenState();
}

class _RoleMemberScreenState extends State<RoleMemberScreen> {
  late final Stream<Role?> _role = Db.roleStream(widget.roleId);
  late final Stream<UserData?> _member = Db.userStream(widget.uid);
  final List<StreamSubscription> _subs = [];
  List<Task> _tasks = const [];
  Set<String> _pendingIds = const {};
  bool _busy = false;

  /// Changes about this member the signed-in instructor has asked the owner for.
  List<StemRequest> _myRequests = const [];

  @override
  void initState() {
    super.initState();
    final me = context.read<AppState>().user?.uid;
    _subs
      ..add(
        Db.userRoleTasksStream(widget.roleId, widget.uid).listen((t) {
          if (mounted) setState(() => _tasks = t);
        }, onError: (_) {}),
      )
      ..add(
        Db.roleSubmittedStream(widget.roleId).listen((s) {
          if (mounted) setState(() => _pendingIds = {for (final x in s.where((x) => x.assignedTo == widget.uid && !x.complete)) x.id});
        }, onError: (_) {}),
      )
      ..add(
        Db.roleRequestsStream(widget.roleId).listen((r) {
          if (mounted) setState(() => _myRequests = r.where((x) => x.uid == me && x.targetUid == widget.uid).toList());
        }, onError: (_) {}),
      );
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  String get _backPath => GoRouterState.of(context).uri.path.split('/members/').first;

  Future<void> _kick(Role role, UserData m) async {
    final app = context.read<AppState>();
    // Instructors who don't own the role ask the owner (or an admin, when it has none)
    if (!app.canChangeRole(role)) {
      final ok = await confirmDialog(
        context,
        title: 'Request Kick',
        message: "Ask ${_waitingOn(role)} to remove ${m.name} from ${role.name}? Their tasks in this role are deleted if it's approved.",
        confirmLabel: 'Send Request',
        destructive: true,
      );
      if (!ok || !mounted) return;
      setState(() => _busy = true);
      try {
        await Db.requestRoleChange(RequestType.kickMember, app.user!.uid, app.userData?.name ?? '', role, {
          'targetUid': m.uid,
          'targetName': m.name,
        });
      } catch (_) {
        if (mounted) showToast(context, "Couldn't send the request. Please try again.", error: true);
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }
    final ok = await confirmDialog(
      context,
      title: 'Kick Member',
      message: 'Remove ${m.name} from ${role.name}? Their tasks in this role are deleted.',
      confirmLabel: 'Kick',
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await Db.kickUserFromRole(role.id, m.uid);
      if (mounted) context.canPop() ? context.pop() : context.go(_backPath);
    } catch (_) {
      if (mounted) {
        setState(() => _busy = false);
        showToast(context, "Couldn't remove them. Please try again.", error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return StreamBuilder<Role?>(
      stream: _role,
      builder: (context, roleSnap) => StreamBuilder<UserData?>(
        stream: _member,
        builder: (context, memberSnap) {
          if (!roleSnap.hasData && roleSnap.connectionState == ConnectionState.waiting) return const LoadingView();
          if (!memberSnap.hasData && memberSnap.connectionState == ConnectionState.waiting) return const LoadingView();
          final role = roleSnap.data;
          final member = memberSnap.data;
          final back = _backPath;
          if (role != null && !app.canManage(role)) {
            return PageScaffold(
              backLabel: 'Members',
              backPath: back,
              children: const [EmptyState("Only this role's instructors and admins can see member pages.")],
            );
          }
          if (role == null || member == null || !role.members.contains(widget.uid)) {
            return PageScaffold(
              backLabel: 'Members',
              backPath: back,
              children: [EmptyState(role == null ? 'This role no longer exists.' : "They're no longer in this role.")],
            );
          }
          final level = app.accessOf(member.uid);
          final staff = app.isStaff(role, member.uid);
          final inRole = member.withRoleStats(role.id);
          final tasks = [..._tasks]
            ..sort((a, b) {
              final byDone = (a.complete ? 1 : 0) - (b.complete ? 1 : 0);
              if (byDone != 0) return byDone;
              return (b.createdOn ?? DateTime(0)).compareTo(a.createdOn ?? DateTime(0));
            });

          return PageScaffold(
            backLabel: 'Members',
            backPath: back,
            children: [
              _header(context, app, role, member, level),
              if (!staff) _statsCard(context, app, role, member, inRole),
              if (!staff) _tasksCard(context, tasks),
              if (staff)
                AppCard(
                  shadow: false,
                  child: Muted(
                    '${level == AccessLevel.admin ? 'Admins' : "This role's instructors"} run the role rather than take part, so they have no stats or tasks here.',
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _header(BuildContext context, AppState app, Role role, UserData m, AccessLevel level) {
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
                  child: Avatar(m.photoURL, name: m.name, size: Avatar.sm),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              children: [
                Heading(m.name, size: 20, maxLines: 2),
                const SizedBox(height: 6),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (level != AccessLevel.user) AccessTag(level),
                    Tag(role.instructors.contains(m.uid) ? 'Instructor of ${role.name}' : 'Member of ${role.name}'),
                  ],
                ),
                // Emails are for admins only
                if (app.isAdmin && m.email.isNotEmpty) ...[const SizedBox(height: 10), Muted(m.email, center: true)],
                if (app.isAdmin) ...[
                  const SizedBox(height: 8),
                  LinkText(
                    'Open in Admin',
                    size: 14,
                    bold: true,
                    color: Palette.navActive,
                    icon: FontAwesomeIcons.chevronRight.data,
                    onPressed: () => context.go('/admin/users/${m.uid}'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _statBox(BuildContext context, String label, int value, IconData icon, Color tint) {
    final dark = Palette.isDark(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
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
                Icon(icon, size: 11, color: tint),
                const SizedBox(width: 5),
                Text(
                  label.toUpperCase(),
                  style: TextStyle(fontSize: 11.5, letterSpacing: 1.2, fontWeight: FontWeight.w600, color: tint),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              '$value',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Palette.label(context)),
            ),
          ],
        ),
      ),
    );
  }

  /// Who approves this role's change requests.
  String _waitingOn(Role role) => role.owner.isEmpty ? 'an admin' : "the role's owner";

  Widget _statsCard(BuildContext context, AppState app, Role role, UserData m, UserData inRole) {
    final canChange = app.canChangeRole(role);
    final pendingEdit = _myRequests.where((r) => r.type == RequestType.editStats).firstOrNull;
    final pendingKick = _myRequests.where((r) => r.type == RequestType.kickMember).firstOrNull;
    return AppCard(
      shadow: false,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionLabel('In ${role.name}'),
          Row(
            children: [
              _statBox(context, 'Points', inRole.points, FontAwesomeIcons.trophy.data, const Color(0xFFD97706)),
              const SizedBox(width: 12),
              _statBox(context, 'Tasks', inRole.taskCompleted, FontAwesomeIcons.circleCheck.data, Palette.green600),
            ],
          ),
          // Requests already sent to the owner about this member
          for (final r in [?pendingEdit, ?pendingKick]) ...[
            const SizedBox(height: 12),
            PendingNotice(
              r.type == RequestType.editStats
                  ? 'You asked to set their stats to ${r.points} pts and ${r.taskCompleted} tasks. Waiting for ${_waitingOn(role)}.'
                  : 'You asked to kick them. Waiting for ${_waitingOn(role)}.',
              actionLabel: 'Withdraw',
              onAction: () => Db.deleteRequest(r.id),
            ),
          ],
          if (!canChange) ...[
            const SizedBox(height: 12),
            Muted("Changes to their stats and kicking them need ${_waitingOn(role)}'s approval.", size: 12, color: Palette.gray400),
          ],
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              AppButton(
                label: canChange ? 'Edit Stats' : 'Request Stat Change',
                style: AppButtonStyle.blue,
                size: AppButtonSize.sm,
                onPressed: pendingEdit != null
                    ? null
                    : () => showModalCard<void>(
                        context,
                        builder: (_) => EditMemberCard(member: inRole, role: role),
                      ),
              ),
              AppButton(
                label: canChange ? 'Kick from Role' : 'Request Kick',
                style: AppButtonStyle.red,
                size: AppButtonSize.sm,
                loading: _busy,
                onPressed: pendingKick != null ? null : () => _kick(role, m),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tasksCard(BuildContext context, List<Task> tasks) => AppCard(
    shadow: false,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionLabel('Tasks'),
        if (tasks.isEmpty) const Muted('No tasks in this role yet.', color: Palette.gray400),
        for (final t in tasks)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Palette.fill(context),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Palette.separator(context)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: t.complete ? Palette.tertiary(context) : Palette.label(context),
                            decoration: t.complete ? TextDecoration.lineThrough : null,
                          ),
                        ),
                        Muted(
                          '${t.points} pts${t.dueDate == null ? '' : ' · Due ${DateFormat('MMM d', 'en_US').format(t.dueDate!)}'}',
                          size: 12,
                          color: Palette.gray400,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _statusTag(t),
                ],
              ),
            ),
          ),
      ],
    ),
  );

  Widget _statusTag(Task t) {
    final overdue = !t.complete && t.dueDate != null && t.dueDate!.isBefore(DateTime.now());
    final (String label, Color color) = t.complete
        ? ('Done', Palette.green600)
        : _pendingIds.contains(t.id)
        ? ('Submitted', Palette.blue600)
        : overdue
        ? ('Overdue', Palette.red500)
        : (t.status?.label ?? 'To do', const Color(0xFF6B7280));
    return Tag(label, color: color);
  }
}
