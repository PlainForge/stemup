// Floating iOS 26–style tab bar. The selection pill rides a spring: it stretches
// with its own velocity while travelling and settles back to the tab's width, the
// Flutter counterpart of the web Nav's "squishy" PillBar. The pill can also be
// dragged to scrub between tabs, like the system tab bar.
//
// It can also collapse (AppShell does this while a page scrolls down) into a
// small bubble showing just the active tab's icon; tapping the bubble expands it.
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';

import 'motion.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';
import 'glass.dart';

class GlassTabItem {
  const GlassTabItem({required this.icon, required this.label, this.badge = false});

  final IconData icon;
  final String label;
  final bool badge;
}

const _barHeight = 64.0;

/// Width and height of the collapsed bubble.
const _collapsedSize = 54.0;
const _inset = 5.0;
const _spring = SpringDescription(mass: 1, stiffness: 900, damping: 42);

class GlassTabBar extends StatefulWidget {
  const GlassTabBar({super.key, required this.items, required this.currentIndex, required this.onSelect, this.collapse = 0, this.onExpand});

  final List<GlassTabItem> items;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  /// 0 for the full bar, 1 for the bubble showing only the active tab's icon,
  /// in between while animating. The bar shrinks toward the left edge.
  final double collapse;

  /// Tapping the collapsed bubble.
  final VoidCallback? onExpand;

  static const height = _barHeight;
  static const collapsedSize = _collapsedSize;

  @override
  State<GlassTabBar> createState() => _GlassTabBarState();
}

class _GlassTabBarState extends State<GlassTabBar> with TickerProviderStateMixin {
  // Indicator position in "tab units" (0 = first tab), unbounded so the spring can overshoot
  late final AnimationController _pos = AnimationController.unbounded(vsync: this, value: widget.currentIndex.toDouble());
  late final AnimationController _lift = AnimationController(vsync: this, duration: const Duration(milliseconds: 180));
  bool _dragging = false;

  int get _count => widget.items.length;

  @override
  void didUpdateWidget(GlassTabBar old) {
    super.didUpdateWidget(old);
    if (old.items.length != widget.items.length) {
      _pos.value = widget.currentIndex.toDouble();
    } else if (old.currentIndex != widget.currentIndex && !_dragging) {
      _springTo(widget.currentIndex);
    }
  }

  void _springTo(int index, [double velocity = 0]) {
    if (reduceMotion(context)) {
      _pos.value = index.toDouble();
      return;
    }
    _pos.animateWith(SpringSimulation(_spring, _pos.value, index.toDouble(), velocity));
  }

  void _select(int index, [double velocity = 0]) {
    if (index != widget.currentIndex) HapticFeedback.selectionClick();
    _springTo(index, velocity);
    widget.onSelect(index);
  }

  @override
  void dispose() {
    _pos.dispose();
    _lift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, outer) {
        final fullW = outer.maxWidth;
        final t = widget.collapse.clamp(0.0, 1.0);
        if (t == 0) {
          return SizedBox(
            height: _barHeight,
            child: GlassSurface(radius: _barHeight / 2, child: _full(context, fullW)),
          );
        }

        // Shrinks toward the left: the full bar fades out early, the active icon fades in late
        final w = _lerp(fullW, _collapsedSize, t);
        final h = _lerp(_barHeight, _collapsedSize, t);
        final item = widget.items[widget.currentIndex.clamp(0, _count - 1)];
        final anyBadge = widget.items.any((i) => i.badge);
        return SizedBox(
          height: _barHeight,
          child: Align(
            alignment: Alignment.centerLeft,
            child: SizedBox(
              width: w,
              height: h,
              child: Semantics(
                button: true,
                label: 'Show navigation (${item.label})',
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: t > .5 ? widget.onExpand : null,
                  child: GlassSurface(
                    radius: h / 2,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(h / 2),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          // The full bar, kept at full width so nothing squeezes while it fades
                          Opacity(
                            opacity: (1 - t / .45).clamp(0.0, 1.0),
                            child: IgnorePointer(
                              child: OverflowBox(
                                alignment: Alignment.centerLeft,
                                minWidth: fullW,
                                maxWidth: fullW,
                                minHeight: _barHeight,
                                maxHeight: _barHeight,
                                child: _full(context, fullW),
                              ),
                            ),
                          ),
                          // Just the active page's icon
                          Center(
                            child: Opacity(
                              opacity: ((t - .35) / .65).clamp(0.0, 1.0),
                              child: Transform.scale(
                                scale: .7 + .3 * t,
                                child: Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    _TabIcon(item.icon, size: 21, color: Palette.resolve(context, Palette.navActive)),
                                    // Something on another tab still needs attention
                                    if (anyBadge) const Positioned(top: -3, right: -7, child: PingDot()),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  static double _lerp(double a, double b, double t) => a + (b - a) * t;

  /// The full bar: the sliding pill and every tab.
  Widget _full(BuildContext context, double width) {
    return SizedBox(
      width: width,
      height: _barHeight,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final tabW = (constraints.maxWidth - _inset * 2) / _count;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragStart: (_) {
              _dragging = true;
              _pos.stop();
              _lift.forward();
            },
            onHorizontalDragUpdate: (d) {
              _pos.value = (_pos.value + d.delta.dx / tabW).clamp(-.25, _count - .75);
            },
            onHorizontalDragEnd: (d) {
              _dragging = false;
              _lift.reverse();
              final v = d.velocity.pixelsPerSecond.dx / tabW;
              final target = (_pos.value + v * .12).round().clamp(0, _count - 1);
              _select(target, v);
            },
            child: AnimatedBuilder(
              animation: Listenable.merge([_pos, _lift]),
              builder: (context, _) => Stack(
                clipBehavior: Clip.none,
                children: [
                  _indicator(context, tabW),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: _inset),
                    child: Row(
                      children: [
                        for (var i = 0; i < _count; i++)
                          Expanded(
                            child: _TabButton(
                              item: widget.items[i],
                              // 1 when the pill is centered on this tab, fading out as it leaves
                              activeness: (1 - (_pos.value - i).abs()).clamp(0.0, 1.0),
                              selected: i == widget.currentIndex,
                              onTap: () => _select(i),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _indicator(BuildContext context, double tabW) {
    // Stretch along the direction of travel in proportion to speed, squash a little vertically
    final speed = _pos.velocity.abs();
    final stretch = math.min(.55, speed * .09);
    final lift = Curves.easeOut.transform(_lift.value);
    final w = tabW * (1 + stretch) + lift * 8;
    final h = (_barHeight - _inset * 2) * (1 - stretch * .18) + lift * 6;
    final cx = _inset + tabW * (_pos.value + .5);
    final dark = Palette.isDark(context);

    return Positioned(
      left: cx - w / 2,
      top: (_barHeight - h) / 2,
      width: w,
      height: h,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: ShapeDecoration(
            shape: RoundedSuperellipseBorder(borderRadius: BorderRadius.circular(h / 2)),
            // bg-black/10 (dark: bg-white/15), lightening a touch while dragged
            color: dark
                ? Color.lerp(const Color(0x26FFFFFF), const Color(0x38FFFFFF), lift)
                : Color.lerp(const Color(0x1A000000), const Color(0x12000000), lift),
            shadows: lift > 0 ? [BoxShadow(color: Color.fromRGBO(0, 0, 0, .12 * lift), blurRadius: 12, offset: const Offset(0, 4))] : null,
          ),
        ),
      ),
    );
  }
}

class _TabButton extends StatefulWidget {
  const _TabButton({required this.item, required this.activeness, required this.selected, required this.onTap});

  final GlassTabItem item;
  final double activeness;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_TabButton> createState() => _TabButtonState();
}

class _TabButtonState extends State<_TabButton> with TickerProviderStateMixin {
  // Springy overshoot the moment this tab becomes active, like the web MobileNavItem
  late final AnimationController _pop = AnimationController(vsync: this, duration: const Duration(milliseconds: 260));
  late final AnimationController _press = AnimationController(vsync: this, duration: const Duration(milliseconds: 120));

  @override
  void didUpdateWidget(_TabButton old) {
    super.didUpdateWidget(old);
    if (widget.selected && !old.selected && !reduceMotion(context)) _pop.forward(from: 0);
  }

  @override
  void dispose() {
    _pop.dispose();
    _press.dispose();
    super.dispose();
  }

  double get _popScale {
    final t = _pop.value;
    if (t == 0 || t == 1) return 1;
    // Up to 1.25 over the first 40%, then an elastic settle back to 1
    return t < .4 ? 1 + .25 * Curves.easeOut.transform(t / .4) : 1 + .25 * (1 - Curves.elasticOut.transform((t - .4) / .6));
  }

  @override
  Widget build(BuildContext context) {
    // text-gray-700 (dark: gray-200) → text-blue-500 (dark: blue-400)
    final idle = Palette.isDark(context) ? const Color(0xFFE5E7EB) : const Color(0xFF374151);
    final color = Color.lerp(idle, Palette.resolve(context, Palette.navActive), widget.activeness)!;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _press.forward(),
      onTapCancel: () => _press.reverse(),
      onTapUp: (_) {
        _press.reverse();
        widget.onTap();
      },
      child: AnimatedBuilder(
        animation: Listenable.merge([_pop, _press]),
        builder: (context, _) => Transform.scale(
          scale: 1 - _press.value * .08,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Transform.scale(
                    scale: _popScale,
                    child: _TabIcon(widget.item.icon, size: 20, color: color),
                  ),
                  if (widget.item.badge) const Positioned(top: -2, right: -6, child: PingDot()),
                ],
              ),
              const SizedBox(height: 3),
              Text(
                widget.item.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pulsing blue dot for "something needs your attention", like Tailwind's animate-ping.
class PingDot extends StatefulWidget {
  const PingDot({super.key, this.size = 8});

  final double size;

  @override
  State<PingDot> createState() => _PingDotState();
}

class _PingDotState extends State<PingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return RepaintBoundary(
      child: SizedBox(
        width: s,
        height: s,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            AnimatedBuilder(
              animation: _c,
              builder: (context, _) => Transform.scale(
                scale: 1 + _c.value * 1.2,
                child: Opacity(
                  opacity: (1 - _c.value) * .75,
                  child: Container(
                    width: s,
                    height: s,
                    decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF38BDF8)),
                  ),
                ),
              ),
            ),
            Container(
              width: s,
              height: s,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF0EA5E9)),
            ),
          ],
        ),
      ),
    );
  }
}

/// A tab's icon, centered on its real width. Font Awesome glyphs are often wider
/// than they are tall (users, gears...), and a plain [Icon] lays them out in a
/// [size]-wide square, so they spill to the right and sit off-center.
class _TabIcon extends StatelessWidget {
  const _TabIcon(this.icon, {required this.size, required this.color});

  final IconData icon;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: Text(
      String.fromCharCode(icon.codePoint),
      textAlign: TextAlign.center,
      textScaler: TextScaler.noScaling,
      style: TextStyle(
        inherit: false,
        fontFamily: icon.fontFamily,
        package: icon.fontPackage,
        fontFamilyFallback: icon.fontFamilyFallback,
        fontSize: size,
        height: 1,
        color: color,
      ),
    ),
  );
}
