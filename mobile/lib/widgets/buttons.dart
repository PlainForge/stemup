// components/Button.tsx and LinkButton.tsx. Same colors, radius and sizes as the
// web, plus a springy press-down in place of the web's hover effects.
import 'package:flutter/cupertino.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';

/// Button.tsx `color` prop.
enum AppButtonStyle { neutral, blue, gray, red, green }

/// Button.tsx `size` prop, for phone widths: xsm = 88, sm = 128, md = 208, full = stretch.
enum AppButtonSize { xsm, sm, md, full }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.style = AppButtonStyle.neutral,
    this.size = AppButtonSize.md,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonStyle style;
  final AppButtonSize size;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    final (Color bg, Color fg) = switch (style) {
      AppButtonStyle.neutral => (Palette.resolve(context, Palette.buttonNeutral), Palette.resolve(context, Palette.buttonNeutralText)),
      AppButtonStyle.blue => (Palette.blue600, const Color(0xFFFFFFFF)),
      AppButtonStyle.gray => (Palette.buttonGray, const Color(0xFF000000)),
      AppButtonStyle.red => (Palette.buttonRed, const Color(0xFFFFFFFF)),
      AppButtonStyle.green => (Palette.green600, const Color(0xFFFFFFFF)),
    };
    final width = switch (size) {
      AppButtonSize.xsm => 88.0,
      AppButtonSize.sm => 128.0,
      AppButtonSize.md => 208.0,
      AppButtonSize.full => double.infinity,
    };

    return Pressable(
      onPressed: enabled ? onPressed : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 150),
        opacity: enabled || loading ? 1 : .5,
        child: Container(
          width: width,
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
          child: loading
              ? CupertinoActivityIndicator(color: fg, radius: 9)
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (icon != null) ...[Icon(icon, size: 15, color: fg), const SizedBox(width: 8)],
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(color: fg, fontSize: 16, fontWeight: FontWeight.w400),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Scales its child down on touch and springs back on release, with a light haptic.
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, this.onPressed, this.scale = .95, this.haptic = true});

  final Widget child;
  final VoidCallback? onPressed;
  final double scale;
  final bool haptic;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> with SingleTickerProviderStateMixin {
  // Created eagerly: a disabled Pressable never touches it in build, and a lazy
  // controller first created inside dispose() would look up a deactivated TickerMode
  late final AnimationController _c;
  static const _spring = SpringDescription(mass: 1, stiffness: 600, damping: 22);

  @override
  void initState() {
    super.initState();
    _c = AnimationController.unbounded(vsync: this, value: 0);
  }

  void _to(double v) => _c.animateWith(SpringSimulation(_spring, _c.value, v, _c.velocity));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onPressed == null) return widget.child;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _to(1),
      onTapCancel: () => _to(0),
      onTapUp: (_) {
        _to(0);
        if (widget.haptic) HapticFeedback.lightImpact();
        widget.onPressed!();
      },
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) => Transform.scale(scale: 1 - (1 - widget.scale) * _c.value, child: child),
        child: widget.child,
      ),
    );
  }
}

/// LinkButton.tsx: plain inline text action.
class LinkText extends StatelessWidget {
  const LinkText(this.label, {super.key, required this.onPressed, this.color, this.bold = false, this.size = 16, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final Color? color;
  final bool bold;
  final double size;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = color == null ? Palette.label(context) : Palette.resolve(context, color!);
    return Pressable(
      onPressed: onPressed,
      scale: .92,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: size * .75, color: c), const SizedBox(width: 6)],
            Text(
              label,
              style: TextStyle(color: c, fontSize: size, fontWeight: bold ? FontWeight.w500 : FontWeight.w400),
            ),
          ],
        ),
      ),
    );
  }
}
