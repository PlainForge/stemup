// pages/AdminPage.tsx + pages/AdminRolePage.tsx (admins only): requests to
// approve, every active user with their access level, every role, and the
// Inactive Users list (formerly the Alumni and Old Users tabs).
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
import '../widgets/sliding_tabs.dart';
import 'role_admin.dart';

enum _AdminTab { requests, users, roles, inactive }

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  _AdminTab _tab = _AdminTab.requests;
  StreamSubscription<List<UserData>>? _usersSub;
  List<UserData> _users = const [];
  String? _busy;
  String _search = '';

  // Inactive Users
  List<OldUserRow>? _inactive;
  String? _restoring;

  @override
  void initState() {
    super.initState();
    _usersSub = Db.allUsersStream().listen((u) {
      if (mounted) setState(() => _users = u);
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _usersSub?.cancel();
    super.dispose();
  }

  Future<void> _loadInactive() async {
    final app = context.read<AppState>();
    if (!app.isAdmin) return;
    final rows = await Db.loadOldUsers(app.admins);
    if (mounted) setState(() => _inactive = rows);
  }

  Future<void> _run(String key, Future<void> Function() action, String failMessage) async {
    setState(() => _busy = key);
    try {
      await action();
    } catch (_) {
      if (mounted) showToast(context, failMessage, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _approve(StemRequest r) async {
    if (r.type == RequestType.resetRole) {
      final ok = await confirmDialog(
        context,
        title: 'Approve Reset',
        message:
            'Reset "${r.roleName}"? Its leaderboard is saved as "${r.saveName}", then all tasks, prizes and members\' points in it are cleared.',
        confirmLabel: 'Reset',
        destructive: true,
      );
      if (!ok) return;
    }
    if (r.type == RequestType.kickMember && mounted) {
      final ok = await confirmDialog(
        context,
        title: 'Approve Kick',
        message: 'Remove ${r.targetName.isEmpty ? 'this member' : r.targetName} from "${r.roleName}"? Their tasks in it are deleted.',
        confirmLabel: 'Kick',
        destructive: true,
      );
      if (!ok) return;
    }
    await _run(r.id, () => Db.approveRequest(r), "Couldn't approve the request. Please try again.");
  }

  Future<void> _restore(OldUserRow row) async {
    setState(() => _restoring = row.uid);
    try {
      if (row.isAlumni) {
        await Db.restoreAlumniMemberToGlobal(row.batchId!, row.uid);
      } else {
        await Db.restoreLiveUserToGlobal(row.uid);
      }
      await _loadInactive();
    } finally {
      if (mounted) setState(() => _restoring = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (!app.isAdmin) return const LoadingView();

    return PageScaffold(
      title: 'Admin',
      subtitle: 'Review requests, manage users and their access, and run any role.',
      onRefresh: _tab == _AdminTab.inactive ? _loadInactive : null,
      children: [
        SlidingTabs<_AdminTab>(
          tabs: [
            SlidingTab(_AdminTab.requests, 'Requests', count: app.adminQueue.length),
            const SlidingTab(_AdminTab.users, 'Users'),
            const SlidingTab(_AdminTab.roles, 'Roles'),
            const SlidingTab(_AdminTab.inactive, 'Inactive Users'),
          ],
          selected: _tab,
          onChanged: (t) {
            setState(() => _tab = t);
            if (t == _AdminTab.inactive && _inactive == null) _loadInactive();
          },
        ),
        KeyedSubtree(
          key: ValueKey(_tab),
          child: switch (_tab) {
            _AdminTab.requests => _requestsTab(context, app),
            _AdminTab.users => _usersTab(context, app),
            _AdminTab.roles => _rolesTab(context, app),
            _AdminTab.inactive => _inactiveTab(context),
          },
        ),
      ],
    );
  }

  String _nameOf(String uid) => _users.where((u) => u.uid == uid).firstOrNull?.name ?? '';

  // ── Requests ──

  Widget _requestsTab(BuildContext context, AppState app) {
    // A role's owner handles its instructors' change requests; admins see them only for roles without one
    final requests = app.adminQueue;
    if (requests.isEmpty) return const EmptyState('No requests right now.');
    return Column(
      children: [
        for (final r in requests)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: FadeSlideIn(
              key: ValueKey(r.id),
              dx: -10,
              offset: 0,
              child: AppCard(
                shadow: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionLabel(
                      r.type?.label ?? 'Request',
                      size: 12,
                      padding: EdgeInsets.zero,
                    ),
                    const SizedBox(height: 4),
                    Text(switch (r.type) {
                      RequestType.instructor => '${_who(r, 'Someone')} wants to be an Instructor',
                      RequestType.createRole => '${_who(r, 'An instructor')} wants to create "${r.roleName}"',
                      null => '',
                      _ => '${_who(r, 'An instructor')} wants to ${r.roleChangeAction}',
                    }, style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context))),
                    if (r.type?.isRoleChange == true) Muted('${r.roleName} has no owner, so this came to admins.', size: 12, color: Palette.gray400),
                    if (r.createdAt != null) Muted(DateFormat('MMM d', 'en_US').format(r.createdAt!), size: 12, color: Palette.gray400),
                    if (r.type == RequestType.instructor && r.reason.isNotEmpty) ...[const SizedBox(height: 10), _Quote(r.reason)],
                    if (r.type == RequestType.createRole) ...[
                      const SizedBox(height: 10),
                      _Quote('Purpose: ${r.purpose.isEmpty ? 'None given' : r.purpose}'),
                    ],
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        AppButton(
                          label: 'Approve',
                          size: AppButtonSize.xsm,
                          style: AppButtonStyle.green,
                          loading: _busy == r.id,
                          onPressed: () => _approve(r),
                        ),
                        AppButton(
                          label: 'Decline',
                          size: AppButtonSize.xsm,
                          style: AppButtonStyle.red,
                          onPressed: _busy == r.id
                              ? null
                              : () => _run(r.id, () => Db.declineAccessRequest(r.id), "Couldn't decline the request."),
                        ),
                        if (r.type?.isRoleChange == true && r.roleId.isNotEmpty)
                          AppButton(
                            label: 'View Role',
                            size: AppButtonSize.xsm,
                            style: AppButtonStyle.gray,
                            onPressed: () => context.push('/admin/roles/${r.roleId}'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  String _who(StemRequest r, String fallback) {
    if (r.userName.isNotEmpty) return r.userName;
    final n = _nameOf(r.uid);
    return n.isEmpty ? fallback : n;
  }

  // ── Users ──

  Widget _usersTab(BuildContext context, AppState app) {
    // Active users are everyone still on the global leaderboard; the rest are under Inactive Users
    final active = _users.where((u) => u.isInGlobal).toList()..sort((a, b) => a.name.compareTo(b.name));
    final q = _search.trim().toLowerCase();
    final shown = q.isEmpty ? active : active.where((u) => u.name.toLowerCase().contains(q) || u.email.toLowerCase().contains(q)).toList();
    final requested = {for (final r in app.adminRequests.where((r) => r.type == RequestType.instructor)) r.uid};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(placeholder: 'Search by name or email...', onChanged: (v) => setState(() => _search = v)),
        const SizedBox(height: 8),
        Muted('${active.length} active user${active.length == 1 ? '' : 's'}', size: 12, color: Palette.gray400),
        const SizedBox(height: 12),
        if (shown.isEmpty) const EmptyState('No users found.'),
        for (final u in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Pressable(
              scale: .98,
              onPressed: () => context.push('/admin/users/${u.uid}'),
              child: AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                radius: 12,
                shadow: false,
                child: Row(
                  children: [
                    Avatar(u.photoURL, name: u.name, size: Avatar.xxs),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  u.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                                ),
                              ),
                              const SizedBox(width: 6),
                              AccessTag(app.accessOf(u.uid)),
                            ],
                          ),
                          Muted(
                            '${u.email.isEmpty ? '' : '${u.email} · '}${u.points} pts'
                            '${requested.contains(u.uid) ? ' · Requested Instructor' : ''}',
                            size: 12,
                            maxLines: 1,
                            color: Palette.gray400,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  // ── Roles ──

  Widget _rolesTab(BuildContext context, AppState app) {
    final roles = app.roles.where((r) => r.id != globalRoleId).toList()..sort((a, b) => a.name.compareTo(b.name));
    if (roles.isEmpty) return const EmptyState('No roles yet. Create one from the Roles tab.');
    final attention = app.adminAttentionPerRole;
    return Column(
      children: [
        for (final r in roles)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Pressable(
              scale: .98,
              onPressed: () => context.push('/admin/roles/${r.id}'),
              child: AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                shadow: false,
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  r.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                                ),
                              ),
                              if ((attention[r.id] ?? 0) > 0) ...[
                                const SizedBox(width: 8),
                                CountBadge(attention[r.id]!, color: Palette.blue500),
                              ],
                            ],
                          ),
                          Muted(_roleSummary(app, r), size: 12, maxLines: 2, color: Palette.gray400),
                          if (r.purpose.isNotEmpty) Muted(r.purpose, size: 12, maxLines: 2),
                        ],
                      ),
                    ),
                    Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300)),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }

  String _roleSummary(AppState app, Role r) {
    final members = r.members.where((uid) => !app.isStaff(r, uid)).length;
    final names = r.instructors.map(_nameOf).where((n) => n.isNotEmpty).toList();
    return '$members member${members == 1 ? '' : 's'}${names.isEmpty ? '' : ' · Instructors: ${names.join(', ')}'}';
  }

  // ── Inactive users ──

  Widget _inactiveTab(BuildContext context) {
    final rows = _inactive;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Muted(
          "Users who aren't on the global leaderboard: removed one at a time, or archived by a semester reset. Restore puts them back on it.",
        ),
        const SizedBox(height: 12),
        if (rows == null)
          const EmptyState('Loading...')
        else if (rows.isEmpty)
          const EmptyState('No inactive users.')
        else
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                radius: 12,
                shadow: false,
                child: Row(
                  children: [
                    Avatar(row.photoURL, name: row.name, size: Avatar.xxs),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            row.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                          ),
                          Muted(
                            '${row.points} pts · ${row.taskCompleted} tasks · ${row.isAlumni ? 'Archived: ${row.batchName}' : 'Removed from Global'}',
                            size: 12,
                            maxLines: 1,
                            color: Palette.gray400,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label: _restoring == row.uid ? 'Restoring...' : 'Restore',
                      size: AppButtonSize.xsm,
                      style: AppButtonStyle.gray,
                      onPressed: _restoring == row.uid ? null : () => _restore(row),
                    ),
                  ],
                ),
              ),
            ),
        const SizedBox(height: 16),
        const SectionLabel('Archived semesters'),
        StreamBuilder<List<AlumniBatch>>(
          stream: Db.alumniStream(),
          builder: (context, snap) {
            final batches = snap.data;
            if (batches == null) return const Muted('Loading...', color: Palette.gray400);
            if (batches.isEmpty) {
              return const Muted('No archives yet. Archives are created from the Semester Reset tool in Settings.', color: Palette.gray400);
            }
            return Column(
              children: [
                for (final b in batches)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Pressable(
                      scale: .97,
                      onPressed: () => context.push('/admin/inactive/${b.id}'),
                      child: AppCard(
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                        shadow: false,
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(shape: BoxShape.circle, color: Palette.resolve(context, Palette.gray100)),
                              child: Icon(FontAwesomeIcons.boxArchive.data, color: Palette.tertiary(context), size: 16),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    b.name,
                                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: Palette.label(context)),
                                  ),
                                  Muted(
                                    '${b.createdAt == null ? '' : '${DateFormat('MMMM y', 'en_US').format(b.createdAt!)} · '}'
                                    '${b.memberCount} user${b.memberCount == 1 ? '' : 's'}',
                                    size: 12,
                                    color: Palette.gray400,
                                  ),
                                ],
                              ),
                            ),
                            Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300)),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Quote extends StatelessWidget {
  const _Quote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: Palette.fill(context),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Palette.separator(context)),
    ),
    child: Text(text, style: TextStyle(fontSize: 14, color: Palette.resolve(context, const Color(0xFF4B5563)))),
  );
}

/// /admin/roles/:id — an admin running any role, with everything an instructor can do.
class AdminRoleScreen extends StatefulWidget {
  const AdminRoleScreen({super.key, required this.roleId});

  final String roleId;

  @override
  State<AdminRoleScreen> createState() => _AdminRoleScreenState();
}

class _AdminRoleScreenState extends State<AdminRoleScreen> {
  StreamSubscription<Role?>? _roleSub;
  StreamSubscription<List<UserData>>? _membersSub;
  String _membersKey = '';
  Role? _role;
  bool _loaded = false;
  List<UserData> _members = const [];

  @override
  void initState() {
    super.initState();
    _roleSub = Db.roleStream(widget.roleId).listen((role) {
      if (!mounted) return;
      setState(() {
        _role = role;
        _loaded = true;
      });
      final key = role?.members.join(',') ?? '';
      if (key == _membersKey) return;
      _membersKey = key;
      _membersSub?.cancel();
      _membersSub = Db.usersStream(role?.members ?? const []).listen((users) {
        if (mounted) setState(() => _members = users.map((u) => u.withRoleStats(widget.roleId)).toList());
      });
    });
  }

  @override
  void dispose() {
    _roleSub?.cancel();
    _membersSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (!app.isAdmin || !_loaded) return const LoadingView();
    final role = _role;
    if (role == null) {
      return const PageScaffold(backLabel: 'Admin', backPath: '/admin', children: [EmptyState('This role no longer exists.')]);
    }
    return PageScaffold(
      backLabel: 'Admin',
      backPath: '/admin',
      trailing: role.members.contains(app.user!.uid)
          ? Pressable(
              onPressed: () => context.go('/roles/${role.id}'),
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 7, 12, 7),
                decoration: BoxDecoration(color: Palette.blue600, borderRadius: BorderRadius.circular(999)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Open',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFFFFFFFF)),
                    ),
                    const SizedBox(width: 6),
                    Icon(FontAwesomeIcons.arrowRight.data, size: 12, color: const Color(0xFFFFFFFF)),
                  ],
                ),
              ),
            )
          : null,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionLabel('Manage Role', size: 12, padding: EdgeInsets.zero),
            Heading(role.name, size: 24, maxLines: 2),
            if (role.purpose.isNotEmpty) ...[const SizedBox(height: 4), Muted(role.purpose)],
          ],
        ),
        RoleAdminView(role: role, members: _members),
      ],
    );
  }
}
