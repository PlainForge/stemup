// Layout smoke tests for the custom controls, run with "Reduce glass effects"
// on (the refraction shader needs Impeller, which the test renderer doesn't have).
import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:stemup/models/models.dart';
import 'package:stemup/state/app_state.dart';
import 'package:stemup/widgets/buttons.dart';
import 'package:stemup/widgets/glass_tab_bar.dart';
import 'package:stemup/widgets/leaderboard.dart';
import 'package:stemup/widgets/sliding_tabs.dart';

Future<void> pumpApp(WidgetTester tester, Widget child) async {
  SharedPreferences.setMockInitialValues({'reduceGlass': true});
  final prefs = await SharedPreferences.getInstance();
  final state = AppState(prefs, authChanges: const Stream.empty());
  tester.view.physicalSize = const Size(1179, 2556); // iPhone 15 Pro
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: state,
      child: CupertinoApp(
        home: CupertinoPageScaffold(child: SafeArea(child: child)),
      ),
    ),
  );
}

void main() {
  testWidgets('tab bar switches tabs on tap and on drag', (tester) async {
    var selected = 0;
    await pumpApp(
      tester,
      StatefulBuilder(
        builder: (context, setState) => Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: GlassTabBar(
              currentIndex: selected,
              onSelect: (i) => setState(() => selected = i),
              items: const [
                GlassTabItem(icon: CupertinoIcons.house_fill, label: 'Home'),
                GlassTabItem(icon: CupertinoIcons.person_3_fill, label: 'Roles', badge: true),
                GlassTabItem(icon: CupertinoIcons.book_fill, label: 'Alumni'),
                GlassTabItem(icon: CupertinoIcons.clock_fill, label: 'Old Users'),
                GlassTabItem(icon: CupertinoIcons.gear_solid, label: 'Settings'),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Settings'));
    await tester.pump(const Duration(seconds: 1));
    expect(selected, 4);

    await tester.drag(find.text('Settings'), const Offset(-400, 0));
    await tester.pump(const Duration(seconds: 1));
    expect(selected, lessThan(4));
    expect(tester.takeException(), isNull);
  });

  testWidgets('sliding tabs lay out six tabs on a phone and select on tap', (tester) async {
    var selected = 'a';
    await pumpApp(
      tester,
      StatefulBuilder(
        builder: (context, setState) => Padding(
          padding: const EdgeInsets.all(16),
          child: SlidingTabs<String>(
            selected: selected,
            onChanged: (v) => setState(() => selected = v),
            tabs: const [
              SlidingTab('a', 'Requests', count: 3),
              SlidingTab('b', 'Assign Task'),
              SlidingTab('c', 'Tasks', count: 12),
              SlidingTab('d', 'Members'),
              SlidingTab('e', 'Rewards', dot: true),
              SlidingTab('f', 'Config', newBadge: true),
            ],
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
    // Six tabs don't fit on a phone, so the strip scrolls
    await tester.ensureVisible(find.text('Members'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.text('Members'));
    await tester.pump(const Duration(seconds: 1));
    expect(selected, 'd');
    expect(tester.takeException(), isNull);
  });

  testWidgets('leaderboard renders a podium with fewer than three people and a long list', (tester) async {
    UserData u(int i) => UserData(uid: 'u$i', name: 'Member number $i with a long name', points: 100 - i);
    await pumpApp(
      tester,
      SingleChildScrollView(
        child: Leaderboard(ranked: [u(1), u(2)], meUid: 'u1'),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(tester.takeException(), isNull);

    await pumpApp(
      tester,
      SingleChildScrollView(
        child: Leaderboard(ranked: [for (var i = 0; i < 12; i++) u(i)], meUid: 'u5'),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('12'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('buttons render every style and fire', (tester) async {
    var taps = 0;
    await pumpApp(
      tester,
      Column(
        children: [
          for (final s in AppButtonStyle.values) AppButton(label: s.name, style: s, onPressed: () => taps++),
          const AppButton(label: 'Loading', loading: true, onPressed: null),
          AppButton(label: 'Wide', icon: CupertinoIcons.star_fill, size: AppButtonSize.full, onPressed: () {}),
        ],
      ),
    );
    await tester.tap(find.text('neutral'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });
}
