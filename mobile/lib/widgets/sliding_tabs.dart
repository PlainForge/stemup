// The web's tab bars (RolePage + RoleAdmin): text tabs over a gray-200 rule with
// a 2px blue-600 underline that slides to the active tab (useSlidingIndicator).
// Scrolls horizontally when the tabs don't fit.
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';
import 'glass_tab_bar.dart' show PingDot;

class SlidingTab<T> {
  const SlidingTab(this.value, this.label, {this.count = 0, this.countColor = Palette.blue500, this.dot = false, this.newBadge = false});

  final T value;
  final String label;
  final int count;
  final Color countColor;
  final bool dot;
  final bool newBadge;
}

class SlidingTabs<T> extends StatefulWidget {
  const SlidingTabs({super.key, required this.tabs, required this.selected, required this.onChanged});

  final List<SlidingTab<T>> tabs;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  State<SlidingTabs<T>> createState() => _SlidingTabsState<T>();
}

class _SlidingTabsState<T> extends State<SlidingTabs<T>> {
  final _stackKey = GlobalKey();
  late List<GlobalKey> _keys;
  Rect? _active;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _keys = List.generate(widget.tabs.length, (_) => GlobalKey());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _measure();
      // Only animate after the first measurement so the underline doesn't fly in on load
      if (mounted) setState(() => _ready = true);
    });
  }

  @override
  void didUpdateWidget(SlidingTabs<T> old) {
    super.didUpdateWidget(old);
    if (old.tabs.length != widget.tabs.length) _keys = List.generate(widget.tabs.length, (_) => GlobalKey());
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure(scroll: old.selected != widget.selected));
  }

  void _measure({bool scroll = false}) {
    if (!mounted) return;
    final i = widget.tabs.indexWhere((t) => t.value == widget.selected);
    final stackBox = _stackKey.currentContext?.findRenderObject() as RenderBox?;
    final tabCtx = i < 0 ? null : _keys[i].currentContext;
    final tabBox = tabCtx?.findRenderObject() as RenderBox?;
    if (stackBox == null || tabBox == null) return;
    final rect = tabBox.localToGlobal(Offset.zero, ancestor: stackBox) & tabBox.size;
    if (rect != _active) setState(() => _active = rect);
    if (scroll && tabCtx != null) {
      Scrollable.ensureVisible(tabCtx, alignment: .5, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: Palette.separator(context))),
    ),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Stack(
        key: _stackKey,
        clipBehavior: Clip.none,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < widget.tabs.length; i++)
                GestureDetector(
                  key: _keys[i],
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    if (widget.tabs[i].value == widget.selected) return;
                    HapticFeedback.selectionClick();
                    widget.onChanged(widget.tabs[i].value);
                  },
                  child: _label(context, widget.tabs[i]),
                ),
            ],
          ),
          if (_active != null)
            AnimatedPositioned(
              left: _active!.left,
              top: _active!.bottom - 2,
              width: _active!.width,
              height: 2,
              duration: _ready ? const Duration(milliseconds: 300) : Duration.zero,
              curve: const Cubic(.32, .72, 0, 1),
              child: const DecoratedBox(
                decoration: BoxDecoration(color: Palette.blue600, borderRadius: BorderRadius.all(Radius.circular(2))),
              ),
            ),
        ],
      ),
    ),
  );

  Widget _label(BuildContext context, SlidingTab<T> tab) {
    final selected = tab.value == widget.selected;
    Widget pill(String text, Color color, {bool bold = false}) => Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(99)),
      child: Text(
        text,
        style: TextStyle(fontSize: 11.5, color: const Color(0xFFFFFFFF), fontWeight: bold ? FontWeight.w700 : FontWeight.w400),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 11),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 200),
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  color: selected ? Palette.blue600 : Palette.secondary(context),
                ),
                child: Text(tab.label, maxLines: 1),
              ),
              if (tab.newBadge) pill('NEW', Palette.red500, bold: true) else if (tab.count > 0) pill('${tab.count}', tab.countColor),
            ],
          ),
          if (tab.dot) const Positioned(top: -6, right: -8, child: PingDot(size: 9)),
        ],
      ),
    );
  }
}
