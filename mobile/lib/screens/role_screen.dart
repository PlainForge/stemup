// pages/RolePage.tsx. Admins get the Admin tab (role_admin.dart) in place of Tasks.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
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
import '../widgets/leaderboard.dart';
import '../widgets/page_scaffold.dart';
import '../widgets/sliding_tabs.dart';
import 'role_admin.dart';
import 'task_widgets.dart';

enum _Tab { leaderboard, rewards, pastMonths, tasks, admin }

class RoleScreen extends StatefulWidget {
  const RoleScreen({super.key, required this.roleId});

  final String roleId;

  @override
  State<RoleScreen> createState() => _RoleScreenState();
}

class _RoleScreenState extends State<RoleScreen> {
  final _subs = <StreamSubscription>[];
  StreamSubscription<List<UserData>>? _membersSub;
  String _membersKey = '';

  Role? _role;
  bool _roleLoaded = false;
  List<UserData> _members = const [];
  Rewards _rewards = Rewards.empty;
  List<Task> _myTasks = const [];
  bool _tasksLoading = true;
  Set<String> _mySubmitted = const {};
  List<SubmittedTask> _pendingSubmitted = const [];
  List<LeaderboardSnapshot> _snapshots = const [];
  _Tab _tab = _Tab.leaderboard;
  final _filters = TaskFilters();

  String get _id => widget.roleId;

  @override
  void initState() {
    super.initState();
    final uid = context.read<AppState>().user!.uid;
    _subs.addAll([
      Db.roleStream(_id).listen(_onRole),
      Db.rewardsStream(_id).listen((r) => setState(() => _rewards = r)),
      Db.userRoleTasksStream(_id, uid).listen(
        (t) => setState(() {
          _myTasks = t;
          _tasksLoading = false;
        }),
      ),
      Db.userSubmittedStream(uid).listen((s) => setState(() => _mySubmitted = s.map((x) => x.id).toSet())),
      Db.roleSubmittedStream(_id).listen((s) => setState(() => _pendingSubmitted = s.where((x) => !x.complete).toList())),
      Db.snapshotsStream(_id).listen((s) => setState(() => _snapshots = s)),
    ]);
  }

  void _onRole(Role? role) {
    final uid = context.read<AppState>().user!.uid;
    setState(() {
      _role = role;
      _roleLoaded = true;
    });
    // Removed from the role (or it was deleted): back to the list
    if (role == null || !role.members.contains(uid)) {
      if (mounted && GoRouterState.of(context).matchedLocation.startsWith('/roles/')) context.go('/roles');
      return;
    }
    final key = role.members.join(',');
    if (key != _membersKey) {
      _membersKey = key;
      _membersSub?.cancel();
      _membersSub = Db.usersStream(role.members).listen((users) {
        if (mounted) setState(() => _members = users.map((u) => u.withRoleStats(_id)).toList());
      });
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _membersSub?.cancel();
    _filters.search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final role = _role;
    if (!_roleLoaded || role == null || app.userData == null) return const LoadingView();

    final me = app.userData!;
    final isAdmin = app.isAdmin;
    final ranked = _members.where((m) => !app.admins.contains(m.uid)).toList()..sort((a, b) => b.points.compareTo(a.points));
    final myStats = me.roleData(_id);
    final isCurrent = me.currentRole == _id;
    final openTasks = _myTasks.where((t) => !t.complete && !_mySubmitted.contains(t.id)).toList();
    final hasNew = !isAdmin && openTasks.any((t) => !app.seenTaskIds.contains(t.id));

    final tabs = <SlidingTab<_Tab>>[
      const SlidingTab(_Tab.leaderboard, 'Leaderboard'),
      const SlidingTab(_Tab.rewards, 'Rewards'),
      const SlidingTab(_Tab.pastMonths, 'Past Months'),
      if (isAdmin)
        SlidingTab(_Tab.admin, 'Admin', dot: role.pendingRequests.isNotEmpty || _pendingSubmitted.isNotEmpty)
      else
        SlidingTab(_Tab.tasks, 'Tasks', newBadge: hasNew, count: openTasks.length, countColor: Palette.green500),
    ];

    return PageScaffold(
      backLabel: 'Roles',
      backPath: '/roles',
      trailing: _RoleIdChip(roleId: _id),
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Role', size: 12, padding: EdgeInsets.zero),
                Heading(role.name, size: 24, maxLines: 2),
              ],
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!isAdmin && myStats != null) ...[
                  StatText(myStats.points, 'pts'),
                  const SizedBox(width: 12),
                  StatText(myStats.taskCompleted, 'tasks'),
                  const SizedBox(width: 12),
                ],
                if (isAdmin) ...[const Tag('Admin View', color: Palette.blue700), const SizedBox(width: 12)],
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  transitionBuilder: (child, a) => ScaleTransition(
                    scale: CurvedAnimation(parent: a, curve: Curves.easeOutBack),
                    child: child,
                  ),
                  child: isCurrent
                      ? const Tag('Your Role', color: Palette.green700, key: ValueKey('current'))
                      : AppButton(
                          key: const ValueKey('set'),
                          label: 'Set Role',
                          size: AppButtonSize.xsm,
                          onPressed: () => Db.setCurrentRole(me.uid, _id),
                        ),
                ),
              ],
            ),
          ],
        ),
        SlidingTabs<_Tab>(tabs: tabs, selected: _tab, onChanged: (t) => setState(() => _tab = t)),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          switchInCurve: Curves.easeOutCubic,
          transitionBuilder: (child, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween(begin: const Offset(0, .02), end: Offset.zero).animate(a),
              child: child,
            ),
          ),
          layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [...previous, ?current]),
          child: KeyedSubtree(key: ValueKey(_tab), child: _tabBody(context, app, role, ranked)),
        ),
      ],
    );
  }

  Widget _tabBody(BuildContext context, AppState app, Role role, List<UserData> ranked) => switch (_tab) {
    _Tab.leaderboard => Leaderboard(ranked: ranked, meUid: app.user!.uid, roleId: _id, emptyText: 'No members yet.'),
    _Tab.rewards => _rewardsTab(context, ranked),
    _Tab.pastMonths => _pastMonthsTab(context),
    _Tab.tasks => MemberTasks(
      tasks: _myTasks,
      loading: _tasksLoading,
      submittedIds: _mySubmitted,
      filters: _filters,
      onFiltersChanged: () => setState(() {}),
    ),
    _Tab.admin => RoleAdminView(role: role, members: _members),
  };

  Widget _rewardsTab(BuildContext context, List<UserData> ranked) {
    const labels = ['First', 'Second', 'Third'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Heading('${DateFormat('MMMM', 'en_US').format(DateTime.now())} Rewards'),
        const SizedBox(height: 12),
        for (var i = 0; i < 3; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              radius: 12,
              shadow: false,
              child: Row(
                children: [
                  MedalIcon(i, size: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${labels[i]} Place',
                          style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                        ),
                        Muted(i < ranked.length ? ranked[i].name : 'No user yet'),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      _rewards.places[i],
                      textAlign: TextAlign.right,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.resolve(context, const Color(0xFF374151))),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _pastMonthsTab(BuildContext context) {
    if (_snapshots.isEmpty) return const EmptyState('No previous leaderboards yet.');
    return Column(
      children: [
        for (final snap in _snapshots)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: AppCard(
              shadow: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SectionLabel(snap.month, padding: const EdgeInsets.only(bottom: 12)),
                  if (snap.entries.isEmpty)
                    const Muted('No entries.', color: Palette.gray400)
                  else
                    for (final e in snap.entries)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 24,
                              child: Center(
                                child: e.rank <= 3
                                    ? MedalIcon(e.rank - 1, size: 14)
                                    : Text(
                                        '${e.rank}',
                                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Palette.tertiary(context)),
                                      ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                e.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                              ),
                            ),
                            StatText(e.points, 'pts'),
                          ],
                        ),
                      ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// The role ID in small gray monospace, copied on tap.
class _RoleIdChip extends StatelessWidget {
  const _RoleIdChip({required this.roleId});

  final String roleId;

  @override
  Widget build(BuildContext context) => Pressable(
    onPressed: () async {
      await Clipboard.setData(ClipboardData(text: roleId));
      if (context.mounted) showToast(context, 'Role ID copied');
    },
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Palette.fill(context),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Palette.resolve(context, Palette.gray100)),
      ),
      child: Text(
        roleId,
        style: TextStyle(fontSize: 12, fontFamily: 'Menlo', color: Palette.resolve(context, Palette.gray300)),
      ),
    ),
  );
}
