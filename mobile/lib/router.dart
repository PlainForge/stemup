// Routes mirror src/Routes.tsx. The five main sections are StatefulShellRoute
// branches, so each tab keeps its own navigation stack (and scroll position)
// while you switch between them, as iOS tab bars do.
import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';

import 'screens/admin_screen.dart';
import 'widgets/motion.dart';
import 'screens/admin_user_screen.dart';
import 'screens/alumni_batch_screen.dart';
import 'screens/auth_screens.dart';
import 'screens/home_screen.dart';
import 'screens/instructor_screen.dart';
import 'screens/role_member_screen.dart';
import 'screens/role_screen.dart';
import 'screens/roles_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/tasks_screen.dart';
import 'screens/shell.dart';
import 'state/app_state.dart';
import 'widgets/page_scaffold.dart';

Page<void> _page(Widget child, GoRouterState state) => AppPage<void>(key: state.pageKey, child: child);

/// A role member's page, under both the role page and the admin role page.
final _memberRoute = GoRoute(
  path: 'members/:uid',
  pageBuilder: (_, s) => _page(RoleMemberScreen(roleId: s.pathParameters['id']!, uid: s.pathParameters['uid']!), s),
);

const _authPaths = {'/splash', '/login', '/register', '/verify'};
const _adminPrefixes = ['/admin'];

GoRouter buildRouter(AppState app) => GoRouter(
  initialLocation: '/splash',
  refreshListenable: app,
  redirect: (context, state) {
    final loc = state.matchedLocation;
    if (app.initializing) return loc == '/splash' ? null : '/splash';
    if (app.user == null) return loc == '/login' || loc == '/register' ? null : '/login';
    if (app.needsVerification) return loc == '/verify' ? null : '/verify';

    // Signed in: leaving the auth screens lands on the user's current role, like the web app
    if (_authPaths.contains(loc)) {
      final role = app.userData?.currentRole ?? '';
      return role.isEmpty ? '/' : '/roles/$role';
    }
    // Alumni and Old Users became the Admin tab's Inactive Users
    if (loc.startsWith('/alumni') || loc.startsWith('/old-users')) return '/admin';
    if (!app.isAdmin && app.admins.isNotEmpty && _adminPrefixes.any(loc.startsWith)) return '/';
    // The Instructor tab is for Instructors; admins get the same views on the Admin tab
    if (loc.startsWith('/instructor') && app.admins.isNotEmpty) {
      if (app.isAdmin) return loc.replaceFirst('/instructor', '/admin');
      if (!app.isInstructor) return '/';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/splash', pageBuilder: (_, s) => _page(const LoadingView(), s)),
    GoRoute(path: '/login', pageBuilder: (_, s) => _page(const LoginScreen(), s)),
    GoRoute(path: '/register', pageBuilder: (_, s) => _page(const RegisterScreen(), s)),
    GoRoute(path: '/verify', pageBuilder: (_, s) => _page(const VerifyEmailScreen(), s)),
    StatefulShellRoute(
      builder: (context, state, shell) => AppShell(shell: shell),
      navigatorContainerBuilder: (context, shell, children) => FadingBranchContainer(currentIndex: shell.currentIndex, children: children),
      branches: [
        StatefulShellBranch(
          routes: [GoRoute(path: '/', pageBuilder: (_, s) => _page(const HomeScreen(), s))],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/roles',
              pageBuilder: (_, s) => _page(const RolesScreen(), s),
              routes: [
                GoRoute(
                  path: ':id',
                  pageBuilder: (_, s) => _page(RoleScreen(roleId: s.pathParameters['id']!), s),
                  routes: [_memberRoute],
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/admin',
              pageBuilder: (_, s) => _page(const AdminScreen(), s),
              routes: [
                GoRoute(
                  path: 'roles/:id',
                  pageBuilder: (_, s) => _page(AdminRoleScreen(roleId: s.pathParameters['id']!), s),
                  routes: [_memberRoute],
                ),
                GoRoute(
                  path: 'users/:uid',
                  pageBuilder: (_, s) => _page(AdminUserScreen(uid: s.pathParameters['uid']!), s),
                ),
                GoRoute(
                  path: 'inactive/:id',
                  pageBuilder: (_, s) => _page(AlumniBatchScreen(batchId: s.pathParameters['id']!), s),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              pageBuilder: (_, s) => _page(const SettingsScreen(), s),
              routes: [
                GoRoute(
                  path: ':section',
                  pageBuilder: (_, s) => _page(SettingsScreen(section: s.pathParameters['section']), s),
                ),
              ],
            ),
          ],
        ),
        // Shown between Admin and Settings in the tab bar (see shell.dart)
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/instructor',
              pageBuilder: (_, s) => _page(const InstructorScreen(), s),
              routes: [
                GoRoute(
                  path: 'roles/:id',
                  pageBuilder: (_, s) => _page(AdminRoleScreen(roleId: s.pathParameters['id']!, instructorMode: true), s),
                  routes: [_memberRoute],
                ),
              ],
            ),
          ],
        ),
        // Every task you've been given, across your roles (users and instructors; shown after Roles)
        StatefulShellBranch(
          routes: [GoRoute(path: '/tasks', pageBuilder: (_, s) => _page(const TasksScreen(), s))],
        ),
      ],
    ),
  ],
);
