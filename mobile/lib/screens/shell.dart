// The signed-in frame (App.tsx + Nav.tsx on a phone): tab branches under the
// floating glass tab bar. Scrolling down any page shrinks the bar to the left
// into a bubble with just the active tab's icon; scrolling up, reaching the
// top, switching tabs or tapping the bubble brings the whole bar back.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/glass_tab_bar.dart';
import '../widgets/motion.dart';

class _Tab {
  const _Tab(this.branch, this.item);
  final int branch;
  final GlassTabItem item;
}

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with SingleTickerProviderStateMixin {
  /// 0 = full bar, 1 = collapsed bubble.
  late final AnimationController _collapse = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
  bool _collapsed = false;

  /// Scroll distance in the current direction, so tiny jitters don't flip the bar.
  double _travel = 0;

  StatefulNavigationShell get shell => widget.shell;

  @override
  void didUpdateWidget(AppShell old) {
    super.didUpdateWidget(old);
    // A different tab starts with the whole bar showing
    if (old.shell.currentIndex != widget.shell.currentIndex) _setCollapsed(false);
  }

  @override
  void dispose() {
    _collapse.dispose();
    super.dispose();
  }

  void _setCollapsed(bool value) {
    if (value == _collapsed) return;
    _collapsed = value;
    if (reduceMotion(context)) {
      _collapse.value = value ? 1 : 0;
    } else if (value) {
      _collapse.animateTo(1, curve: Curves.easeInOutCubic);
    } else {
      _collapse.animateBack(0, duration: const Duration(milliseconds: 420), curve: Curves.easeOutBack);
    }
  }

  bool _onScroll(ScrollUpdateNotification n) {
    final m = n.metrics;
    // Only a page's own vertical scrolling, not carousels or lists nested inside it
    if (m.axis != Axis.vertical || n.depth != 0) return false;
    if (m.pixels <= m.minScrollExtent + 4) {
      _travel = 0;
      _setCollapsed(false);
      return false;
    }
    // Ignore the bounce past the bottom, which scrolls "up" on its way back
    if (m.outOfRange) return false;
    final d = n.scrollDelta ?? 0;
    if (d == 0) return false;
    if ((d > 0) != (_travel > 0)) _travel = 0;
    _travel += d;
    if (_travel > 24) {
      _setCollapsed(true);
    } else if (_travel < -24) {
      _setCollapsed(false);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final tabs = [
      _Tab(0, GlassTabItem(icon: FontAwesomeIcons.house.data, label: 'Home')),
      _Tab(1, GlassTabItem(icon: FontAwesomeIcons.users.data, label: 'Roles', badge: app.rolesTabBadge)),
      // Admins aren't given tasks, so only users and instructors get this tab
      if (!app.isAdmin) _Tab(5, GlassTabItem(icon: FontAwesomeIcons.listCheck.data, label: 'Tasks')),
      if (app.isAdmin) _Tab(2, GlassTabItem(icon: FontAwesomeIcons.userShield.data, label: 'Admin', badge: app.adminQueue.isNotEmpty)),
      // Instructors (who aren't admins) get their own tab, like the Admin tab
      if (!app.isAdmin && app.isInstructor)
        _Tab(4, GlassTabItem(icon: FontAwesomeIcons.chalkboardUser.data, label: 'Instructor', badge: app.instructorRequestCount > 0)),
      _Tab(3, GlassTabItem(icon: FontAwesomeIcons.gears.data, label: 'Settings')),
    ];
    final current = tabs.indexWhere((t) => t.branch == shell.currentIndex).clamp(0, tabs.length - 1);
    final mq = MediaQuery.of(context);
    // bottom-[calc(env(safe-area-inset-bottom)+0.25rem)]
    final barBottom = mq.padding.bottom + 4;
    // While typing, the keyboard covers the bar's spot; hide the bar rather than float it above the keyboard
    final keyboardOpen = mq.viewInsets.bottom > 0;

    return CupertinoPageScaffold(
      child: Stack(
        children: [
          // Pages see extra bottom padding so their content can scroll out from under the bar.
          // The scaffold above already makes room for the keyboard, so pages get no view
          // insets: otherwise each page makes room for it a second time (a keyboard-sized gap).
          MediaQuery(
            data: mq
                .removeViewInsets(removeBottom: true)
                .copyWith(padding: mq.padding.copyWith(bottom: keyboardOpen ? 0 : barBottom + GlassTabBar.height + 8)),
            child: NotificationListener<ScrollUpdateNotification>(onNotification: _onScroll, child: shell),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: barBottom,
            child: Offstage(
              offstage: keyboardOpen,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 448), // max-w-md
                  child: AnimatedBuilder(
                    animation: _collapse,
                    builder: (context, _) => GlassTabBar(
                      items: [for (final t in tabs) t.item],
                      currentIndex: current,
                      // easeOutBack overshoots past 0 on the way back; the bar just stays full then
                      collapse: _collapse.value.clamp(0.0, 1.0),
                      onExpand: () => _setCollapsed(false),
                      onSelect: (i) {
                        final branch = tabs[i].branch;
                        // Tapping the active tab pops back to that tab's root
                        shell.goBranch(branch, initialLocation: branch == shell.currentIndex);
                      },
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Cross-fades between tab branches instead of cutting.
class FadingBranchContainer extends StatelessWidget {
  const FadingBranchContainer({super.key, required this.currentIndex, required this.children});

  final int currentIndex;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      for (var i = 0; i < children.length; i++)
        IgnorePointer(
          ignoring: i != currentIndex,
          // The fade must sit outside TickerMode: a muted ticker would freeze the
          // outgoing page's fade-out at full opacity, leaving it painted on top
          child: AnimatedOpacity(
            opacity: i == currentIndex ? 1 : 0,
            duration: const Duration(milliseconds: 150),
            curve: Curves.easeOut,
            child: TickerMode(enabled: i == currentIndex, child: children[i]),
          ),
        ),
    ],
  );
}
