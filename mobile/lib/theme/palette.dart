// The web app's Tailwind palette, including the dark-mode overrides from
// src/index.css, so screens can say "gray-500" and get what the site shows.
import 'package:flutter/cupertino.dart';

class Palette {
  Palette._();

  // Text
  static const foreground = CupertinoDynamicColor.withBrightness(
    color: Color(0xFF181818),
    darkColor: Color(0xFFF3F4F6),
  ); // body text / text-black
  static const gray500 = CupertinoDynamicColor.withBrightness(color: Color(0xFF6B7280), darkColor: Color(0xFF9CA3AF)); // secondary text
  static const gray400 = CupertinoDynamicColor.withBrightness(color: Color(0xFF9CA3AF), darkColor: Color(0xFF6B7280)); // captions, labels
  static const gray300 = CupertinoDynamicColor.withBrightness(color: Color(0xFFD1D5DB), darkColor: Color(0xFF4B5563));

  // Surfaces
  static const page = CupertinoDynamicColor.withBrightness(color: Color(0xFFFFFFFF), darkColor: Color(0xFF0A0A0A)); // body background
  static const white = CupertinoDynamicColor.withBrightness(color: Color(0xFFFFFFFF), darkColor: Color(0xFF111827)); // bg-white (cards)
  static const gray50 = CupertinoDynamicColor.withBrightness(color: Color(0xFFF9FAFB), darkColor: Color(0xFF1F2937)); // inputs, inset rows
  static const gray100 = CupertinoDynamicColor.withBrightness(
    color: Color(0xFFF3F4F6),
    darkColor: Color(0xFF374151),
  ); // card borders, inactive chips
  static const gray200 = CupertinoDynamicColor.withBrightness(
    color: Color(0xFFE5E7EB),
    darkColor: Color(0xFF4B5563),
  ); // input borders, dividers
  static const blue50 = CupertinoDynamicColor.withBrightness(
    color: Color(0xFFEFF6FF),
    darkColor: Color(0xFF172554),
  ); // "active"/"you" highlight

  // Accents
  static const blue600 = Color(0xFF2563EB);
  static const blue500 = Color(0xFF3B82F6);
  static const navActive = CupertinoDynamicColor.withBrightness(
    color: Color(0xFF3B82F6),
    darkColor: Color(0xFF60A5FA),
  ); // blue-500 / dark:blue-400
  static const blue100 = Color(0xFFDBEAFE);
  static const blue700 = Color(0xFF1D4ED8);
  static const green600 = Color(0xFF16A34A);
  static const green500 = Color(0xFF22C55E);
  static const green100 = Color(0xFFDCFCE7);
  static const green700 = Color(0xFF15803D);
  static const red500 = Color(0xFFEF4444);
  static const red400 = Color(0xFFF87171);
  static const red100 = Color(0xFFFEE2E2);
  static const red600 = Color(0xFFDC2626);
  static const yellow300 = Color(0xFFFDE047);
  static const yellow200 = Color(0xFFFEF08A);
  static const yellow100 = Color(0xFFFEF9C3);
  static const yellow700 = Color(0xFFA16207);
  static const orange200 = Color(0xFFFED7AA);
  static const orange100 = Color(0xFFFFEDD5);
  static const orange700 = Color(0xFFC2410C);
  static const purple700 = Color(0xFF7E22CE);
  static const amber50 = Color(0xFFFFFBEB);
  static const amber700 = Color(0xFFB45309);
  static const sky500 = Color(0xFF0EA5E9);
  static const sky400 = Color(0xFF38BDF8);

  // Buttons (components/Button.tsx)
  static const buttonNeutral = CupertinoDynamicColor.withBrightness(color: Color(0xFF181818), darkColor: Color(0xFFF3F4F6));
  static const buttonNeutralText = CupertinoDynamicColor.withBrightness(color: Color(0xFFFFFFFF), darkColor: Color(0xFF181818));
  static const buttonRed = Color(0xFFFF1818);
  static const buttonGray = Color(0xFFC8C8C8);

  // Medals (MedalIcon.tsx): yellow-500, gray-400, amber-700
  static const medals = [Color(0xFFEAB308), Color(0xFF9CA3AF), amber700];

  static bool isDark(BuildContext c) => CupertinoTheme.brightnessOf(c) == Brightness.dark;
  static Color resolve(BuildContext c, Color color) => CupertinoDynamicColor.resolve(color, c);

  // Shorthands used everywhere
  static Color label(BuildContext c) => resolve(c, foreground);
  static Color secondary(BuildContext c) => resolve(c, gray500);
  static Color tertiary(BuildContext c) => resolve(c, gray400);
  static Color separator(BuildContext c) => resolve(c, gray200);
  static Color fill(BuildContext c) => resolve(c, gray50);
  static Color card(BuildContext c) => resolve(c, white);
  static Color background(BuildContext c) => resolve(c, page);

  /// Light tint + strong text for a badge in [base] color, adjusted for dark mode.
  static (Color bg, Color fg) badge(BuildContext c, Color base) {
    final dark = isDark(c);
    return (
      base.withValues(alpha: dark ? .25 : .15),
      dark ? Color.lerp(base, const Color(0xFFFFFFFF), .35)! : Color.lerp(base, const Color(0xFF000000), .25)!,
    );
  }
}
