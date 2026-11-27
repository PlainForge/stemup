// pages/UserPage.tsx: /users/:uid, anyone's page, opened from "View their page"
// on a card and kept under the Home tab. Everyone sees who they are, their
// stats and their roles (read only); instructors can jump to the person's
// member page in a role they both share and run, to edit their points and
// tasks. Admins get the full admin user page instead.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/page_scaffold.dart';
import '../widgets/role_icons.dart';
import 'admin_user_screen.dart';

class UserScreen extends StatefulWidget {
  const UserScreen({super.key, required this.uid});

  final String uid;

  @override
  State<UserScreen> createState() => _UserScreenState();
}

class _UserScreenState extends State<UserScreen> {
  late final Stream<UserData?> _user = Db.userStream(widget.uid);

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    // Admins see everything, including removing a deleted account
    if (app.isAdmin) return AdminUserScreen(uid: widget.uid);

    return StreamBuilder<UserData?>(
      stream: _user,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting && !snap.hasData) return const LoadingView();
        final u = snap.data;
        if (u == null) {
          return const PageScaffold(backLabel: 'Back', backPath: '/', children: [EmptyState('This account no longer exists.')]);
        }
        final me = app.user?.uid;
        final level = app.accessOf(u.uid);
        // Roles they've hidden from their page show only to them, admins and whoever runs that role
        final theirs = app.roles.where((r) => r.id != globalRoleId && r.members.contains(u.uid) && app.showsRoleOf(u, r.id)).toList()
          ..sort((a, b) => a.name.compareTo(b.name));
        final instructing = theirs.where((r) => r.instructors.contains(u.uid)).toList();
        final memberOf = theirs.where((r) => !r.instructors.contains(u.uid)).toList();
        // Roles the viewer runs, where they can edit this person's points and tasks
        bool viewerRuns(Role r) => app.isInstructor && me != null && me != u.uid && r.instructors.contains(me);

        Widget roleList(List<Role> list) => Column(
          children: [for (final r in list) _RoleRow(role: r, person: u, manage: viewerRuns(r))],
        );

        return PageScaffold(
          backLabel: 'Back',
          backPath: '/',
          children: [
            _header(context, u, level),
            // Their totals (admins don't earn points)
            if (level != AccessLevel.admin)
              Row(
                children: [
                  _stat(context, 'Points', u.points, FontAwesomeIcons.trophy.data, const Color(0xFFD97706)),
                  const SizedBox(width: 8),
                  _stat(context, 'Tasks Done', u.taskCompleted, FontAwesomeIcons.circleCheck.data, const Color(0xFF16A34A)),
                  if (level != AccessLevel.user) ...[
                    const SizedBox(width: 8),
                    _stat(context, 'Tasks Given', u.tasksGiven, FontAwesomeIcons.clipboardList.data, Palette.blue600),
                  ],
                ],
              ),
            if (level == AccessLevel.admin)
              AppCard(shadow: false, child: Muted("${u.name} is an admin, so they're in every role automatically."))
            else ...[
              if (level == AccessLevel.instructor)
                AppCard(
                  shadow: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SectionLabel('Instructing'),
                      if (instructing.isEmpty) const Muted('Not running any roles yet.', color: Palette.gray400) else roleList(instructing),
                    ],
                  ),
                ),
              AppCard(
                shadow: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionLabel(level == AccessLevel.instructor ? 'Member of' : 'Roles'),
                    if (memberOf.isEmpty)
                      Muted('Not in any ${level == AccessLevel.instructor ? 'other ' : ''}roles yet.', color: Palette.gray400)
                    else
                      roleList(memberOf),
                    if (memberOf.any(viewerRuns)) ...[
                      const SizedBox(height: 4),
                      const Muted(
                        'Open a role you run to edit their points, tasks and membership there.',
                        size: 12,
                        color: Palette.gray400,
                      ),
                    ],
                  ],
                ),
              ),
            ],
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
                if (level != AccessLevel.user) ...[const SizedBox(height: 6), AccessTag(level)],
                if (u.aboutMe.isNotEmpty) ...[const SizedBox(height: 14), AboutMeBox(u.aboutMe)],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stat(BuildContext context, String label, int value, IconData icon, Color tint) {
    final dark = Palette.isDark(context);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: dark ? .16 : .08),
          borderRadius: BorderRadius.circular(16),
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
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Palette.label(context)),
            ),
          ],
        ),
      ),
    );
  }
}

/// One of their roles, with their points there; "Manage" when the viewer runs it.
class _RoleRow extends StatelessWidget {
  const _RoleRow({required this.role, required this.person, required this.manage});

  final Role role;
  final UserData person;
  final bool manage;

  @override
  Widget build(BuildContext context) {
    final stat = person.roles.where((r) => r.id == role.id).firstOrNull;
    final showStat = stat != null && !role.instructors.contains(person.uid);
    final row = Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Palette.card(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Palette.separator(context)),
      ),
      child: Row(
        children: [
          RoleIconBadge.of(role, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  role.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: Palette.label(context)),
                ),
                if (showStat)
                  Muted(
                    '${stat.points} pts · ${stat.taskCompleted} task${stat.taskCompleted == 1 ? '' : 's'} done',
                    size: 12,
                    color: Palette.gray400,
                  ),
              ],
            ),
          ),
          if (manage) ...[
            const SizedBox(width: 8),
            Icon(FontAwesomeIcons.pen.data, size: 10, color: Palette.resolve(context, Palette.navActive)),
            const SizedBox(width: 5),
            Text(
              'Manage',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.resolve(context, Palette.navActive)),
            ),
            const SizedBox(width: 4),
            Icon(CupertinoIcons.chevron_right, size: 12, color: Palette.resolve(context, Palette.navActive)),
          ],
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: manage
          ? Semantics(
              button: true,
              label: "Manage ${person.name} in ${role.name}",
              child: Pressable(scale: .98, onPressed: () => context.push('/instructor/roles/${role.id}/members/${person.uid}'), child: row),
            )
          : row,
    );
  }
}
