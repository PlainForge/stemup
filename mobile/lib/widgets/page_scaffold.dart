// Page frame matching the web layout: plain page background, an optional
// "‹ Back" link row, a `text-2xl font-bold` title with a gray subtitle, then the
// content in a column — padded clear of the floating tab bar.
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';

import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';

class PageScaffold extends StatelessWidget {
  const PageScaffold({
    super.key,
    this.title,
    this.subtitle,
    required this.children,
    this.backLabel,
    this.backPath,
    this.trailing,
    this.onRefresh,
    this.spacing = 16,
  });

  final String? title;
  final String? subtitle;
  final List<Widget> children;

  /// Shows a "‹ [backLabel]" link that pops, or goes to [backPath] if there's nothing to pop.
  final String? backLabel;
  final String? backPath;

  /// Right side of the back row (e.g. the role ID chip).
  final Widget? trailing;
  final Future<void> Function()? onRefresh;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    final header = <Widget>[
      if (backLabel != null || trailing != null)
        Row(
          children: [
            if (backLabel != null)
              _BackPill(label: backLabel!, onPressed: () => context.canPop() ? context.pop() : context.go(backPath ?? '/')),
            const Spacer(),
            ?trailing,
          ],
        ),
      if (title != null)
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Heading(title!, size: 24, maxLines: 2),
            if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 2), child: Muted(subtitle!)),
          ],
        ),
    ];
    final items = [...header, ...children];

    return CupertinoPageScaffold(
      backgroundColor: Palette.background(context),
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          SliverToBoxAdapter(child: SizedBox(height: pad.top)),
          if (onRefresh != null) CupertinoSliverRefreshControl(onRefresh: onRefresh),
          SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, pad.bottom + 24),
            sliver: SliverList.separated(
              itemCount: items.length,
              itemBuilder: (_, i) => items[i],
              separatorBuilder: (_, i) => SizedBox(height: i < header.length ? (i == header.length - 1 ? 24 : 12) : spacing),
            ),
          ),
        ],
      ),
    );
  }
}

/// The "‹ Roles" back button: a blue pill so it's easy to spot.
class _BackPill extends StatelessWidget {
  const _BackPill({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final color = Palette.resolve(context, Palette.navActive);
    return Pressable(
      onPressed: onPressed,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 7, 14, 7),
        decoration: BoxDecoration(
          color: Palette.resolve(context, Palette.blue50),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withValues(alpha: .35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.chevron_left, size: 16, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

/// pages/Loading.tsx: a centered ring spinner.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) => CupertinoPageScaffold(
    backgroundColor: Palette.background(context),
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const RingSpinner(),
          if (message != null) ...[const SizedBox(height: 16), Muted(message!)],
        ],
      ),
    ),
  );
}

class RingSpinner extends StatefulWidget {
  const RingSpinner({super.key, this.size = 50});

  final double size;

  @override
  State<RingSpinner> createState() => _RingSpinnerState();
}

class _RingSpinnerState extends State<RingSpinner> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RotationTransition(
    turns: _c,
    child: CustomPaint(size: Size.square(widget.size), painter: _RingPainter(Palette.label(context))),
  );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    canvas.drawCircle(rect.center, size.width / 2 - 1.5, paint..color = color.withValues(alpha: .3));
    canvas.drawArc(rect.deflate(1.5), -math.pi * .75, math.pi / 2, false, paint..color = color);
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.color != color;
}
