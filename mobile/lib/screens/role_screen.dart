// pages/RolePage.tsx. Admins and the role's instructors get a Manage button
// that opens role_admin.dart on the Admin or Instructor tab. Everyone gets a
// Settings tab: this role's Notifications page, and whether it shows on Home.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/leaderboard.dart';
import '../widgets/page_scaffold.dart';
import '../widgets/profile_sheet.dart';
import '../widgets/glass_tab_bar.dart' show PingDot;
import '../widgets/sliding_tabs.dart';
import 'task_widgets.dart';

enum _Tab { leaderboard, rewards, saved, tasks, settings }

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

  /// The Notifications page inside the Settings tab is open.
  bool _notificationsOpen = false;
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
    final canManage = app.canManage(role);
    // Admins and this role's instructors run it rather than take part: no Tasks tab, no ranking
    final isStaff = app.isStaff(role, me.uid);
    final ranked = _members.where((m) => !app.isStaff(role, m.uid)).toList()..sort((a, b) => byPointsThenName(a, b));
    final myStats = me.roleData(_id);
    final isCurrent = me.currentRole == _id;
    final openTasks = _myTasks.where((t) => !t.complete && !_mySubmitted.contains(t.id)).toList();
    final hasNew = !isStaff && openTasks.any((t) => !app.seenTaskIds.contains(t.id));
    // The role's instructors who still have Instructor access
    final roleInstructors = [
      for (final uid in role.instructors)
        if (app.instructors.contains(uid)) ?_members.where((m) => m.uid == uid).firstOrNull,
    ];
    var tab = _tab;
    if (tab == _Tab.tasks && isStaff) tab = _Tab.leaderboard;
    final notificationsOn = me.notifications.roleIsOn(_id);

    final tabs = <SlidingTab<_Tab>>[
      const SlidingTab(_Tab.leaderboard, 'Leaderboard'),
      const SlidingTab(_Tab.rewards, 'Rewards'),
      const SlidingTab(_Tab.saved, 'Saved Data'),
      if (!isStaff) SlidingTab(_Tab.tasks, 'Tasks', newBadge: hasNew, count: openTasks.length, countColor: Palette.green500),
      SlidingTab(_Tab.settings, notificationsOn ? 'Settings' : 'Settings (muted)'),
    ];

    return PageScaffold(
      backLabel: 'Roles',
      backPath: '/roles',
      trailing: CopyIdChip(_id, copiedMessage: 'Role ID copied'),
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
                if (!isStaff && myStats != null) ...[
                  StatText(myStats.points, 'pts'),
                  const SizedBox(width: 12),
                  StatText(myStats.taskCompleted, 'tasks'),
                  const SizedBox(width: 12),
                ],
                // Opens the role on the Admin or Instructor tab (go, not push, so the tab switches)
                if (isAdmin || canManage) ...[
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AppButton(
                        label: 'Manage',
                        size: AppButtonSize.xsm,
                        onPressed: () => context.go(isAdmin ? '/admin/roles/$_id' : '/instructor/roles/$_id'),
                      ),
                      if (!isAdmin && (role.pendingRequests.isNotEmpty || _pendingSubmitted.isNotEmpty))
                        const Positioned(top: -3, right: -3, child: PingDot(size: 10)),
                    ],
                  ),
                  const SizedBox(width: 12),
                ],
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
        if (roleInstructors.isNotEmpty) _InstructorChips(people: roleInstructors, meUid: me.uid),
        SlidingTabs<_Tab>(
          tabs: tabs,
          selected: tab,
          onChanged: (t) => setState(() {
            _tab = t;
            _notificationsOpen = false;
          }),
        ),
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
          child: KeyedSubtree(key: ValueKey(tab), child: _tabBody(context, app, role, ranked, tab)),
        ),
      ],
    );
  }

  Widget _tabBody(BuildContext context, AppState app, Role role, List<UserData> ranked, _Tab tab) => switch (tab) {
    _Tab.leaderboard => Leaderboard(ranked: ranked, meUid: app.user!.uid, roleId: _id, emptyText: 'No members yet.'),
    _Tab.rewards => _rewardsTab(context, role, ranked),
    _Tab.saved => _savedTab(context),
    _Tab.tasks => MemberTasks(
      tasks: _myTasks,
      loading: _tasksLoading,
      submittedIds: _mySubmitted,
      filters: _filters,
      onFiltersChanged: () => setState(() {}),
    ),
    _Tab.settings => _notificationsOpen ? _notificationsTab(context, app, role) : _settingsTab(context, app, role),
  };

  /// This role's settings for the signed-in person: its Notifications page, and
  /// whether its rewards and top 3 show on Home.
  Widget _settingsTab(BuildContext context, AppState app, Role role) {
    final me = app.userData!;
    final notificationsOn = me.notifications.roleIsOn(_id);
    final showOnHome = !me.hideOnHome.contains(_id);
    final blue = Palette.resolve(context, Palette.navActive);

    Widget badge(IconData icon, bool on) => Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: on ? Palette.resolve(context, Palette.blue50) : Palette.fill(context),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, size: 20, color: on ? blue : Palette.tertiary(context)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Pressable(
          scale: .98,
          onPressed: () => setState(() => _notificationsOpen = true),
          child: AppCard(
            shadow: false,
            child: Row(
              children: [
                badge(notificationsOn ? CupertinoIcons.bell_fill : CupertinoIcons.bell_slash_fill, notificationsOn),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Notifications',
                        style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                      ),
                      Muted(notificationsOn ? 'On' : 'Off', size: 13),
                    ],
                  ),
                ),
                Icon(CupertinoIcons.chevron_right, size: 16, color: Palette.tertiary(context)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        AppCard(
          shadow: false,
          child: Row(
            children: [
              badge(CupertinoIcons.house_fill, showOnHome),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Show on Home',
                      style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                    ),
                    Muted("${role.name}'s rewards and top 3 on your Home screen", size: 13),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              CupertinoSwitch(value: showOnHome, activeTrackColor: Palette.green500, onChanged: (v) => Db.setShowOnHome(me.uid, _id, v)),
            ],
          ),
        ),
      ],
    );
  }

  /// Turns this role's notifications on or off for the signed-in person (opened from Settings).
  Widget _notificationsTab(BuildContext context, AppState app, Role role) {
    final me = app.userData!;
    final on = me.notifications.roleIsOn(_id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        BackPill(label: 'Settings', onPressed: () => setState(() => _notificationsOpen = false)),
        const SizedBox(height: 12),
        AppCard(
          shadow: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchRow(
                label: 'Notifications from ${role.name}',
                hint: on ? 'On' : 'Off',
                value: on,
                onChanged: (v) => Db.setRoleNotifications(me.uid, _id, v),
              ),
              const SizedBox(height: 8),
              Muted(
                'Covers everything about this role: tasks, reviews, extensions and requests'
                '${app.canManage(role) ? ', including submissions waiting for you to review' : ''}. '
                'Turning it off stops push notifications and emails about this role only.',
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: LinkText("Choose how you're notified in Settings", size: 14, onPressed: () => context.go('/settings/notifications')),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _rewardsTab(BuildContext context, Role role, List<UserData> ranked) {
    const labels = ['First', 'Second', 'Third'];
    final podium = splitLeaderboard(ranked).podium;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Heading(role.rewardsTitle.isNotEmpty ? role.rewardsTitle : '${DateFormat('MMMM', 'en_US').format(DateTime.now())} Rewards'),
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
                        Muted(i < podium.length ? podium[i].name : 'No user yet'),
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

  /// Leaderboards saved each time the role was reset.
  Widget _savedTab(BuildContext context) {
    if (_snapshots.isEmpty) return const EmptyState('Nothing saved yet. Each time this role is reset, its leaderboard is saved here.');
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
                  Text(
                    snap.title,
                    style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                  ),
                  if (snap.createdAt != null) Muted('Reset ${dateTimeLabel.format(snap.createdAt!)}', size: 12, color: Palette.gray400),
                  const SizedBox(height: 12),
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
                            const SizedBox(width: 12),
                            StatText(e.taskCompleted, 'tasks'),
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

/// "INSTRUCTORS" followed by a purple chip per person who runs the role; tap for their profile.
class _InstructorChips extends StatelessWidget {
  const _InstructorChips({required this.people, required this.meUid});

  final List<UserData> people;
  final String meUid;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    crossAxisAlignment: WrapCrossAlignment.center,
    children: [
      SectionLabel(people.length == 1 ? 'Instructor' : 'Instructors', size: 12, padding: const EdgeInsets.only(right: 4)),
      for (final p in people)
        Pressable(
          scale: .96,
          onPressed: () => showProfileSheet(context, p),
          child: Container(
            padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
            decoration: BoxDecoration(
              color: Palette.resolve(
                context,
                const CupertinoDynamicColor.withBrightness(color: Color(0xFFFAF5FF), darkColor: Color(0xFF2E1065)),
              ),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: Palette.resolve(
                  context,
                  const CupertinoDynamicColor.withBrightness(color: Color(0xFFE9D5FF), darkColor: Color(0xFF581C87)),
                ),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Avatar(p.photoURL, name: p.name, size: Avatar.xxs),
                const SizedBox(width: 6),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 160),
                  child: Text(
                    '${p.name}${p.uid == meUid ? ' (you)' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Palette.resolve(
                        context,
                        const CupertinoDynamicColor.withBrightness(color: Palette.purple700, darkColor: Color(0xFFD8B4FE)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}
