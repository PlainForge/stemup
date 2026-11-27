// components/Dash.tsx: profile header, stat cards, this month's prizes, and
// either the global leaderboard or one leaderboard per role.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/motion.dart';
import '../widgets/leaderboard.dart';
import '../widgets/page_scaffold.dart';
import '../widgets/profile_sheet.dart';

class _RoleBoard {
  const _RoleBoard({required this.roleId, required this.roleName, required this.top3, required this.rewards, required this.myRank});

  final String roleId;
  final String roleName;
  final List<UserData> top3;
  final Rewards rewards;
  final int? myRank;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  StreamSubscription<Role?>? _globalRoleSub;
  StreamSubscription<List<UserData>>? _globalUsersSub;
  StreamSubscription<List<Role>>? _viewerSub;
  List<UserData> _global = const [];
  bool _canSeeGlobal = false;
  List<_RoleBoard> _boards = const [];
  bool _boardsLoading = false;
  String _boardsKey = '';

  @override
  void initState() {
    super.initState();
    _globalRoleSub = Db.roleStream(globalRoleId).listen((role) {
      _globalUsersSub?.cancel();
      _globalUsersSub = Db.usersStream(role?.members ?? const []).listen((users) {
        if (mounted) setState(() => _global = users);
      });
    });
    final uid = context.read<AppState>().user?.uid;
    _viewerSub = Db.globalViewerRolesStream().listen((roles) {
      if (mounted) setState(() => _canSeeGlobal = roles.any((r) => r.members.contains(uid)));
    });
  }

  @override
  void dispose() {
    _globalRoleSub?.cancel();
    _globalUsersSub?.cancel();
    _viewerSub?.cancel();
    super.dispose();
  }

  /// Top 3, the user's rank and prizes for every role the user is in (or, for
  /// admins, every role — they aren't ranked, so they get an overview instead).
  Future<void> _loadBoards(AppState app) async {
    final me = app.userData!;
    final myRoles = app.isAdmin
        ? (await Db.getRoles()).where((r) => r.id != globalRoleId).map((r) => (r.id, r.name)).toList()
        : me.roles.where((r) => r.id != globalRoleId).map((r) => (r.id, r.name)).toList();

    final boards = await Future.wait(
      myRoles.map((role) async {
        final (id, name) = role;
        final results = await Future.wait([Db.roleStream(id).first, Db.getRewards(id)]);
        final roleDoc = results[0] as Role?;
        final members = roleDoc?.members ?? const <String>[];
        // Admins and the role's instructors run it, so they aren't ranked
        final ranked = (await Db.getUsers(members)).where((u) => !app.isStaff(roleDoc, u.uid)).map((u) => u.withRoleStats(id)).toList()
          ..sort((a, b) => byPointsThenName(a, b));
        final board = splitLeaderboard(ranked);
        return _RoleBoard(roleId: id, roleName: name, top3: board.podium, rewards: results[1] as Rewards, myRank: rankOf(board, me.uid));
      }),
    );
    if (mounted) {
      setState(() {
        _boards = boards;
        _boardsLoading = false;
      });
    }
  }

  Future<void> _refresh() {
    final app = context.read<AppState>();
    _boardsKey = '';
    return app.userData == null ? Future.value() : _loadBoards(app);
  }

  /// Roles hidden from Home in their Settings tab are left out.
  List<_RoleBoard> get _homeBoards {
    final hidden = context.read<AppState>().userData?.hideOnHome ?? const <String>[];
    return _boards.where((b) => !hidden.contains(b.roleId)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final me = app.userData;
    if (me == null) return const LoadingView();

    // Reload the per-role boards whenever the inputs that shape them change
    final key = '${app.isAdmin}|${app.admins.join(',')}|${app.instructors.length}|${me.roles.map((r) => '${r.id}:${r.points}').join(',')}';
    if (key != _boardsKey) {
      _boardsKey = key;
      _boardsLoading = _boards.isEmpty;
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadBoards(app));
    }

    final month = DateFormat('MMMM', 'en_US').format(DateTime.now());
    final globalRanked = _global.where((u) => !app.admins.contains(u.uid)).toList()..sort((a, b) => byPointsThenName(a, b));
    final placings = _homeBoards.where((b) => b.myRank != null && b.myRank! <= 3).toList()..sort((a, b) => a.myRank!.compareTo(b.myRank!));
    final rewardsCard = app.isAdmin ? _adminOverview(context, month) : _myRewards(context, month, placings);

    return PageScaffold(
      spacing: 32,
      onRefresh: _refresh,
      children: [
        FadeSlideIn(
          offset: 30,
          child: Column(
            children: [
              Pressable(
                onPressed: () => showProfileSheet(context, me),
                child: Avatar(me.photoURL, name: me.name, size: Avatar.md),
              ),
              const SizedBox(height: 12),
              Heading(me.name, size: 24),
              Muted(DateFormat('EEEE, MMMM d', 'en_US').format(DateTime.now()), color: Palette.gray400),
            ],
          ),
        ),
        if (!app.isAdmin)
          FadeSlideIn(
            offset: 30,
            child: Row(
              children: [
                Expanded(
                  child: _StatCard(label: 'Total Points', value: me.points),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _StatCard(label: 'Tasks Done', value: me.taskCompleted),
                ),
                // Only instructors see how many tasks they've given out
                if (app.isInstructor) ...[
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(label: 'Tasks Given', value: me.tasksGiven),
                  ),
                ],
              ],
            ),
          ),
        ?rewardsCard,
        // Admins always; instructors unless they turned it off in Settings; members of a role with it switched on
        if (app.isAdmin || (app.isInstructor && me.showGlobalLeaderboard) || _canSeeGlobal || me.canSeeGlobal)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Heading('Global Leaderboard'),
              const SizedBox(height: 12),
              Leaderboard(ranked: globalRanked, meUid: me.uid),
            ],
          )
        else if (_boardsLoading)
          const Muted('Loading leaderboards...', center: true, color: Palette.gray400)
        else if (_homeBoards.isNotEmpty)
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final b in _homeBoards) ...[
                Heading('${b.roleName} Leaderboard'),
                const SizedBox(height: 8),
                if (b.top3.isEmpty)
                  const EmptyState('No one has earned points yet.')
                else
                  for (var i = 0; i < b.top3.length; i++)
                    FadeSlideIn(
                      delay: stagger(i, 50),
                      offset: 8,
                      child: _TopRow(
                        rank: i,
                        user: b.top3[i],
                        reward: b.rewards.places[i],
                        isMe: b.top3[i].uid == me.uid,
                        roleId: b.roleId,
                      ),
                    ),
                const SizedBox(height: 24),
              ],
            ],
          ),
      ],
    );
  }

  Widget _prize(String reward, {double size = 12}) => Muted(
    Rewards.isRealPrize(reward) ? 'Prize: $reward' : 'No prize set',
    size: size,
    maxLines: 2,
    color: Rewards.isRealPrize(reward) ? Palette.gray500 : Palette.gray400,
  );

  Widget? _myRewards(BuildContext context, String month, List<_RoleBoard> placings) {
    if (placings.isEmpty) return null;
    const places = ['1st', '2nd', '3rd'];
    return _RewardsCard(
      title: 'Your $month Rewards',
      gap: 12,
      children: [
        for (final b in placings)
          Row(
            children: [
              MedalIcon(b.myRank! - 1, size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      b.roleName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                    ),
                    Muted('${places[b.myRank! - 1]} place'),
                    _prize(b.rewards.places[b.myRank! - 1]),
                  ],
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget? _adminOverview(BuildContext context, String month) {
    if (_homeBoards.isEmpty) return null;
    return _RewardsCard(
      title: '$month Rewards Overview',
      gap: 16,
      children: [
        for (final b in _homeBoards)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                b.roleName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
              ),
              const SizedBox(height: 8),
              if (b.top3.isEmpty)
                const Muted('No one has earned points yet.', size: 12, color: Palette.gray400)
              else
                for (var i = 0; i < b.top3.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Pressable(
                      scale: .98,
                      onPressed: () => showProfileSheet(context, b.top3[i], roleId: b.roleId),
                      child: Row(
                        children: [
                          SizedBox(width: 28, child: Center(child: MedalIcon(i, size: 20))),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  b.top3[i].name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                                ),
                                _prize(b.rewards.places[i]),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) => AppCard(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Number on top, label underneath; both stay on one centered line, shrinking to fit three cards on a small phone
        FittedBox(
          fit: BoxFit.scaleDown,
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value.toDouble()),
            duration: motionDuration(context, const Duration(milliseconds: 800)),
            curve: Curves.easeOutCubic,
            builder: (context, v, _) => Text(
              '${v.round()}',
              maxLines: 1,
              style: TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.w700,
                height: 1.1,
                color: Palette.label(context),
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            label.toUpperCase(),
            maxLines: 1,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: Palette.resolve(context, Palette.gray400)),
          ),
        ),
      ],
    ),
  );
}

/// `rounded-2xl border-2 border-yellow-300 bg-white shadow-sm p-4`.
class _RewardsCard extends StatelessWidget {
  const _RewardsCard({required this.title, required this.children, required this.gap});

  final String title;
  final List<Widget> children;
  final double gap;

  @override
  Widget build(BuildContext context) => FadeSlideIn(
    offset: 30,
    child: AppCard(
      padding: const EdgeInsets.all(16),
      borderColor: Palette.yellow300,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionLabel(title, padding: EdgeInsets.only(bottom: gap)),
          for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(height: gap), children[i]],
        ],
      ),
    ),
  );
}

/// Per-role leaderboard row: `rounded-2xl border-2` in the medal color.
class _TopRow extends StatelessWidget {
  const _TopRow({required this.rank, required this.user, required this.reward, required this.isMe, required this.roleId});

  final int rank;
  final UserData user;
  final String reward;
  final bool isMe;
  final String roleId;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    // The whole card opens their profile, same as tapping the name
    child: Pressable(
      scale: .98,
      onPressed: () => showProfileSheet(context, user, roleId: roleId),
      child: _card(context),
    ),
  );

  Widget _card(BuildContext context) => AppCard(
    padding: const EdgeInsets.all(12),
    shadow: false,
    borderColor: isMe ? const Color(0xFF93C5FD) : [Palette.yellow300, const Color(0xFFD1D5DB), const Color(0xFFFDBA74)][rank],
    color: isMe ? Palette.blue50 : null,
    child: Row(
      children: [
        SizedBox(width: 32, child: Center(child: MedalIcon(rank, size: 24))),
        const SizedBox(width: 12),
        Expanded(
          child: Builder(
            builder: (context) => Row(
              children: [
                Avatar(user.photoURL, name: user.name, size: Avatar.xxs),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Palette.label(context)),
                      ),
                      Muted(
                        Rewards.isRealPrize(reward) ? 'Prize: $reward' : 'No prize set',
                        size: 12,
                        maxLines: 1,
                        color: Rewards.isRealPrize(reward) ? Palette.gray500 : Palette.gray400,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
