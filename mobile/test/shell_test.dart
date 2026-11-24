// Navigation through the real app shell (tab bar + branch container) with
// stand-in pages, so it runs without Firebase.
import 'package:flutter/cupertino.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:stemup/models/models.dart';
import 'package:stemup/screens/settings_screen.dart';
import 'package:stemup/screens/shell.dart';
import 'package:stemup/state/app_state.dart';
import 'package:stemup/widgets/glass_tab_bar.dart';

Widget _page(String name, {bool long = false}) => CupertinoPageScaffold(
  child: ListView(
    children: [
      Text('$name page'),
      if (long)
        for (var i = 0; i < 80; i++) SizedBox(height: 60, child: Text('$name row $i')),
    ],
  ),
);

/// How opaque [f] actually paints, multiplying every animated opacity above it.
double paintedOpacity(WidgetTester tester, Finder f) {
  var opacity = 1.0;
  RenderObject? r = tester.renderObject(f);
  while (r != null) {
    if (r is RenderAnimatedOpacity) opacity *= r.opacity.value;
    r = r.parent;
  }
  return opacity;
}

void main() {
  testWidgets('tabs still work after scrolling down the Settings page', (tester) async {
    SharedPreferences.setMockInitialValues({'reduceGlass': true});
    final state = AppState(await SharedPreferences.getInstance(), authChanges: const Stream.empty())
      ..userData = const UserData(
        uid: 'u1',
        name: 'Test User',
        roles: [UserRoleData(id: globalRoleId, name: 'global')],
      );
    tester.view.physicalSize = const Size(1179, 2556);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    GoRoute route(String path, String name, {bool long = false}) => GoRoute(
      path: path,
      builder: (_, _) => _page(name, long: long),
    );
    final router = GoRouter(
      initialLocation: '/settings',
      routes: [
        StatefulShellRoute(
          builder: (context, state, shell) => AppShell(shell: shell),
          navigatorContainerBuilder: (context, shell, children) =>
              FadingBranchContainer(currentIndex: shell.currentIndex, children: children),
          branches: [
            StatefulShellBranch(routes: [route('/', 'Home')]),
            StatefulShellBranch(routes: [route('/roles', 'Roles')]),
            StatefulShellBranch(routes: [route('/admin', 'Admin')]),
            StatefulShellBranch(
              routes: [GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen())],
            ),
          ],
        ),
      ],
    );
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: CupertinoApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account Settings'), findsOneWidget);

    // Scroll well down the long page, the way you would on Settings
    for (var i = 0; i < 3; i++) {
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -500));
      await tester.pumpAndSettle();
    }

    // The bar must still be on screen to be tappable
    final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(tester.getRect(find.byType(GlassTabBar)).bottom, lessThanOrEqualTo(screen.height));

    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, '/');
    // The Settings page must actually go away, not just the route change
    expect(paintedOpacity(tester, find.byType(SettingsScreen, skipOffstage: false)), 0);
    expect(paintedOpacity(tester, find.text('Home page')), 1);

    await tester.tap(find.text('Roles'));
    await tester.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, '/roles');
    expect(paintedOpacity(tester, find.text('Home page', skipOffstage: false)), 0);
    expect(paintedOpacity(tester, find.text('Roles page')), 1);
  });
}
