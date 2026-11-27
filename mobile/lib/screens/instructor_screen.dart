// pages/InstructorPage.tsx (Instructors who aren't admins): the roles they
// run, and every request waiting on them across those roles, each labelled
// with the role it's in. Each role opens /instructor/roles/:id
// (AdminRoleScreen in instructor mode), under this tab.
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

enum _InstructorTab { roles, requests }

class InstructorScreen extends StatefulWidget {
  const InstructorScreen({super.key});

  @override
  State<InstructorScreen> createState() => _InstructorScreenState();
}

class _InstructorScreenState extends State<InstructorScreen> {
  _InstructorTab _tab = _InstructorTab.roles;
  StreamSubscription<List<UserData>>? _peopleSub;
  String _peopleKey = '';
  Map<String, UserData> _people = const {};
  String? _busy;

  @override
  void dispose() {
    _peopleSub?.cancel();
    super.dispose();
  }

  /// Names and photos for everyone asking to join one of their roles.
  void _syncPeople(List<String> uids) {
    final key = (uids.toSet().toList()..sort()).join(',');
    if (key == _peopleKey) return;
    _peopleKey = key;
    _peopleSub?.cancel();
    _peopleSub = Db.usersStream(key.isEmpty ? const [] : key.split(',')).listen((u) {
      if (mounted) setState(() => _people = {for (final p in u) p.uid: p});
    });
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

  Future<void> _approve(StemRequest r, Role? role) async {
    if (r.type == RequestType.resetRole || r.type == RequestType.kickMember) {
      final reset = r.type == RequestType.resetRole;
      final name = role?.name ?? r.roleName;
      final ok = await confirmDialog(
        context,
        title: reset ? 'Approve Reset' : 'Approve Kick',
        message: reset
            ? 'Reset $name? Its leaderboard is saved as "${r.saveName}", then all tasks, prizes and members\' points in it are cleared.'
            : 'Remove ${r.targetName.isEmpty ? 'this member' : r.targetName} from $name? Their tasks in this role are deleted.',
        confirmLabel: reset ? 'Reset' : 'Kick',
        destructive: true,
      );
      if (!ok) return;
    }
    await _run(r.id, () => Db.approveRequest(r), "Couldn't approve the request. Please try again.");
  }

  void _openRole(String roleId) => context.push('/instructor/roles/$roleId');

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    if (!app.isInstructor || app.isAdmin) return const LoadingView();
    final roles = app.instructedRoles;
    final roleById = {for (final r in roles) r.id: r};
    final me = app.user!.uid;

    final joins = [
      for (final r in roles)
        for (final uid in r.pendingRequests) (role: r, uid: uid),
    ];
    _syncPeople([for (final j in joins) j.uid]);
    final toReview = app.instructorChangesToReview;
    final mine = app.adminRequests.where((r) => r.type?.isRoleChange == true && r.uid == me && roleById.containsKey(r.roleId)).toList();

    return PageScaffold(
      title: 'Instructor',
      subtitle: 'The roles you run, and everything waiting on you across them.',
      children: [
        SlidingTabs<_InstructorTab>(
          tabs: [
            const SlidingTab(_InstructorTab.roles, 'Roles'),
            // Everything listed on the Requests tab, so the count matches what you see there
            SlidingTab(_InstructorTab.requests, 'Requests', count: joins.length + toReview.length + mine.length),
          ],
          selected: _tab,
          onChanged: (t) => setState(() => _tab = t),
        ),
        KeyedSubtree(
          key: ValueKey(_tab),
          child: switch (_tab) {
            _InstructorTab.roles => _rolesTab(context, app, roles, toReview),
            _InstructorTab.requests => _requestsTab(context, roleById, joins, toReview, mine),
          },
        ),
      ],
    );
  }

  // ── Roles they run ──

  Widget _rolesTab(BuildContext context, AppState app, List<Role> roles, List<StemRequest> toReview) {
    if (roles.isEmpty) {
      return const EmptyState("You don't run any roles yet. Request a new one from the Roles tab, or ask a role's owner to add you.");
    }
    final attention = app.adminAttentionPerRole;
    final me = app.user!.uid;
    return Column(
      children: [
        for (var i = 0; i < roles.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: FadeSlideIn(
              key: ValueKey(roles[i].id),
              delay: stagger(i),
              dx: -10,
              offset: 0,
              child: Pressable(
                scale: .98,
                onPressed: () => _openRole(roles[i].id),
                child: AppCard(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                  shadow: false,
                  child: Row(
                    children: [
                      Expanded(child: _roleSummary(context, app, roles[i], me, (attention[roles[i].id] ?? 0) + toReview.where((r) => r.roleId == roles[i].id).length)),
                      Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300)),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _roleSummary(BuildContext context, AppState app, Role r, String me, int attention) {
    final members = r.members.where((uid) => !app.isStaff(r, uid)).length;
    return Column(
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
            if (r.owner == me) ...[const SizedBox(width: 8), const Tag('Owner', color: Color(0xFF9333EA))],
            if (attention > 0) ...[const SizedBox(width: 8), CountBadge(attention, color: Palette.blue500)],
          ],
        ),
        Muted('$members member${members == 1 ? '' : 's'}', size: 12, color: Palette.gray400),
        if (r.purpose.isNotEmpty) Muted(r.purpose, size: 12, maxLines: 2),
      ],
    );
  }

  // ── Requests across all their roles ──

  Widget _requestsTab(
    BuildContext context,
    Map<String, Role> roleById,
    List<({Role role, String uid})> joins,
    List<StemRequest> toReview,
    List<StemRequest> mine,
  ) {
    if (joins.isEmpty && toReview.isEmpty && mine.isEmpty) return const EmptyState('No requests right now.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (joins.isNotEmpty) ...[
          const SectionLabel('Join requests'),
          for (final j in joins) _joinCard(context, j.role, j.uid),
          const SizedBox(height: 8),
        ],
        if (toReview.isNotEmpty) ...[
          const SectionLabel('Instructor requests'),
          const Muted('You own these roles, so their other instructors ask you first.', size: 12, color: Palette.gray400),
          const SizedBox(height: 10),
          for (final r in toReview) _changeCard(context, r, roleById[r.roleId], mine: false),
          const SizedBox(height: 8),
        ],
        if (mine.isNotEmpty) ...[
          const SectionLabel('Sent by you'),
          for (final r in mine) _changeCard(context, r, roleById[r.roleId], mine: true),
        ],
      ],
    );
  }

  /// Which role a request is in; tapping it opens that role.
  Widget _roleChip(BuildContext context, Role? role) => Pressable(
    onPressed: role == null ? null : () => _openRole(role.id),
    child: Container(
      constraints: const BoxConstraints(maxWidth: 150),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: Palette.resolve(context, Palette.blue50),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: Palette.blue500.withValues(alpha: .25)),
      ),
      child: Text(
        role?.name ?? 'Unknown role',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.resolve(context, Palette.navActive)),
      ),
    ),
  );

  Widget _card(String key, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: FadeSlideIn(
      key: ValueKey(key),
      dx: -10,
      offset: 0,
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shadow: false,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      ),
    ),
  );

  Widget _joinCard(BuildContext context, Role role, String uid) {
    final person = _people[uid];
    final key = '${role.id}:$uid';
    return _card(key, [
      Row(
        children: [
          Avatar(person?.photoURL ?? '', name: person?.name ?? '', size: Avatar.xs),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  person?.name ?? 'Loading...',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                ),
                const Muted('wants to join', size: 12, color: Palette.gray400),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _roleChip(context, role),
        ],
      ),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          AppButton(
            label: 'Accept',
            size: AppButtonSize.xsm,
            style: AppButtonStyle.green,
            loading: _busy == key,
            onPressed: () => _run(key, () => Db.acceptRequest(role, uid), "Couldn't accept them. Please try again."),
          ),
          AppButton(
            label: 'Decline',
            size: AppButtonSize.xsm,
            style: AppButtonStyle.red,
            onPressed: _busy == key ? null : () => _run(key, () => Db.declineRequest(role.id, uid), "Couldn't decline the request."),
          ),
        ],
      ),
    ]);
  }

  Widget _changeCard(BuildContext context, StemRequest r, Role? role, {required bool mine}) => _card(r.id, [
    Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(r.describe(mine: mine), style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context))),
        ),
        const SizedBox(width: 8),
        _roleChip(context, role),
      ],
    ),
    if (r.createdAt != null) Muted(DateFormat('MMM d', 'en_US').format(r.createdAt!), size: 12, color: Palette.gray400),
    const SizedBox(height: 10),
    if (mine)
      Row(
        children: [
          Expanded(
            child: Text(
              'Waiting for ${(role?.owner ?? '').isEmpty ? 'an admin' : "the role's owner"}',
              style: const TextStyle(fontSize: 12, color: Palette.amber700),
            ),
          ),
          AppButton(label: 'Withdraw', size: AppButtonSize.xsm, style: AppButtonStyle.cancel, onPressed: () => Db.deleteRequest(r.id)),
        ],
      )
    else
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          AppButton(
            label: 'Approve',
            size: AppButtonSize.xsm,
            style: AppButtonStyle.green,
            loading: _busy == r.id,
            onPressed: () => _approve(r, role),
          ),
          AppButton(
            label: 'Decline',
            size: AppButtonSize.xsm,
            style: AppButtonStyle.red,
            onPressed: _busy == r.id ? null : () => _run(r.id, () => Db.declineAccessRequest(r.id), "Couldn't decline the request."),
          ),
        ],
      ),
  ]);
}
