// Liquid Glass surface for the floating tab bar — the native counterpart of the
// web's mobile nav (`bg-white/40 backdrop-blur-2xl backdrop-saturate-200
// border-white/50 shadow-xl`). Real refraction needs Impeller; with "Reduce glass
// effects" on, it falls back to a plain backdrop blur.
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:liquid_glass_renderer/liquid_glass_renderer.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../theme/palette.dart';

LiquidGlassSettings glassSettings(BuildContext context, {double thickness = 20}) {
  final dark = Palette.isDark(context);
  return LiquidGlassSettings(
    thickness: thickness,
    blur: 12,
    glassColor: dark ? const Color(0x66111827) : const Color(0x66FFFFFF),
    lightIntensity: dark ? .45 : .7,
    ambientStrength: dark ? .1 : .25,
    lightAngle: .7 * math.pi,
    saturation: 2,
    refractiveIndex: 1.25,
    chromaticAberration: .02,
  );
}

/// A single floating glass shape with its own render layer.
class GlassSurface extends StatelessWidget {
  const GlassSurface({super.key, required this.child, this.radius = 999, this.thickness = 20});

  final Widget child;
  final double radius;
  final double thickness;

  @override
  Widget build(BuildContext context) {
    final fake = context.select<AppState, bool>((s) => s.reduceGlass);
    final dark = Palette.isDark(context);
    return DecoratedBox(
      // shadow-xl shadow-black/10 + border-white/50 (dark: border-white/10)
      decoration: ShapeDecoration(
        shape: StadiumBorder(side: BorderSide(color: dark ? const Color(0x1AFFFFFF) : const Color(0x80FFFFFF))),
        shadows: const [BoxShadow(color: Color(0x1A000000), blurRadius: 25, offset: Offset(0, 12), spreadRadius: -4)],
      ),
      child: LiquidGlassLayer(
        fake: fake,
        settings: glassSettings(context, thickness: thickness),
        child: LiquidGlass(
          shape: LiquidRoundedSuperellipse(borderRadius: radius),
          child: child,
        ),
      ),
    );
  }
}
