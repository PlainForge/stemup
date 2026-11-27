// Reduce Motion: the app's own setting (Settings > Preferences) or the iPhone's
// (Settings > Accessibility > Motion). main.dart folds the app setting into
// MediaQuery.disableAnimations, so everything reads it the same way here.
// With it on, things fade instead of sliding, scaling, springing or bouncing.
import 'package:flutter/cupertino.dart';

bool reduceMotion(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// [normal], or no time at all when motion is reduced.
Duration motionDuration(BuildContext context, Duration normal) => reduceMotion(context) ? Duration.zero : normal;

/// Pages that slide in and out normally and simply fade when motion is reduced
/// (the iOS swipe-back gesture still works).
class AppPage<T> extends CupertinoPage<T> {
  const AppPage({super.key, required super.child});

  @override
  Route<T> createRoute(BuildContext context) => _AppPageRoute<T>(this);
}

class _AppPageRoute<T> extends PageRoute<T> with CupertinoRouteTransitionMixin<T> {
  _AppPageRoute(AppPage<T> page) : super(settings: page);

  AppPage<T> get _page => settings as AppPage<T>;

  @override
  Widget buildContent(BuildContext context) => _page.child;

  @override
  String? get title => _page.title;

  @override
  bool get maintainState => _page.maintainState;

  @override
  bool get fullscreenDialog => _page.fullscreenDialog;

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) =>
      reduceMotion(context)
      ? FadeTransition(
          opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
          child: child,
        )
      : super.buildTransitions(context, animation, secondaryAnimation, child);
}
