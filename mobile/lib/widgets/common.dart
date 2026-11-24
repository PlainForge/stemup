// Shared pieces matching the web's recurring Tailwind patterns: white bordered
// cards, uppercase tracking-widest captions, gray-50 inputs, pill chips, etc.
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../models/models.dart';
import '../theme/palette.dart';
import 'buttons.dart';
import 'dialogs.dart';

/// `bg-white rounded-2xl border border-gray-100 shadow-sm`, or `border-2` in
/// [borderColor] for the highlighted variants.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.borderColor,
    this.color,
    this.radius = 16,
    this.shadow = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? borderColor;
  final Color? color;
  final double radius;
  final bool shadow;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: padding,
    decoration: BoxDecoration(
      color: color == null ? Palette.card(context) : Palette.resolve(context, color!),
      borderRadius: BorderRadius.circular(radius),
      border: borderColor == null
          ? Border.all(color: Palette.resolve(context, Palette.gray100))
          : Border.all(color: Palette.resolve(context, borderColor!), width: 2),
      boxShadow: shadow && !Palette.isDark(context)
          ? const [BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1))]
          : null,
    ),
    child: child,
  );
}

/// `text-sm font-semibold uppercase tracking-widest text-gray-400`.
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.color, this.padding = const EdgeInsets.only(bottom: 16), this.size = 13});

  final String text;
  final Color? color;
  final EdgeInsetsGeometry padding;
  final double size;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding,
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: size,
        fontWeight: FontWeight.w600,
        letterSpacing: size * .1,
        color: Palette.resolve(context, color ?? Palette.gray400),
      ),
    ),
  );
}

/// Page/section headings: `text-2xl font-bold` (size 24) or `text-lg font-semibold` (18).
class Heading extends StatelessWidget {
  const Heading(this.text, {super.key, this.size = 18, this.maxLines = 1});

  final String text;
  final double size;
  final int? maxLines;

  @override
  Widget build(BuildContext context) => Text(
    text,
    maxLines: maxLines,
    overflow: maxLines == null ? null : TextOverflow.ellipsis,
    style: TextStyle(fontSize: size, fontWeight: size >= 22 ? FontWeight.w700 : FontWeight.w600, color: Palette.label(context)),
  );
}

/// `text-sm text-gray-500`.
class Muted extends StatelessWidget {
  const Muted(this.text, {super.key, this.size = 14, this.center = false, this.maxLines, this.color});

  final String text;
  final double size;
  final bool center;
  final int? maxLines;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text,
    textAlign: center ? TextAlign.center : null,
    maxLines: maxLines,
    overflow: maxLines == null ? null : TextOverflow.ellipsis,
    style: TextStyle(fontSize: size, color: Palette.resolve(context, color ?? Palette.gray500), height: 1.4),
  );
}

/// `text-gray-400 text-sm text-center py-8`.
class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
    child: Center(child: Muted(text, center: true, color: Palette.gray400)),
  );
}

/// Google photo URLs carry a size param like =s96-c; ui-avatars defaults to 64px.
/// Placeholder avatars are stored with name=User, so [name] is swapped in to
/// make the initials match the person (and follow name changes).
String optimizePhoto(String src, {String? name}) {
  if (src.contains('googleusercontent.com')) {
    return src.replaceAll(RegExp(r'=s\d+-c'), '=s400-c').replaceAll(RegExp(r'=s\d+$'), '=s400');
  }
  if (src.contains('ui-avatars.com')) {
    final uri = Uri.tryParse(src);
    // With a size param ui-avatars switches to SVG, which Flutter can't decode — ask for PNG explicitly
    if (uri != null) {
      return uri
          .replace(
            queryParameters: {
              ...uri.queryParameters,
              'size': '512',
              'format': 'png',
              if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
            },
          )
          .toString();
    }
  }
  return src;
}

/// Background behind avatars (and the empty space around uncropped photos).
Color avatarFill(BuildContext context) => Palette.isDark(context) ? const Color(0xFF374151) : const Color(0xFFE0E0E0);

/// ProfileImg.tsx sizes: xxs 32, xs 56, sm 96, md 136, lg 176.
class Avatar extends StatelessWidget {
  const Avatar(this.url, {super.key, this.size = 136, this.name});

  final String url;
  final double size;

  /// The person's name, used for the initials on placeholder avatars.
  final String? name;

  static const xxs = 32.0, xs = 56.0, sm = 96.0, md = 136.0;

  @override
  Widget build(BuildContext context) {
    final fill = avatarFill(context);
    final placeholder = ColoredBox(color: fill);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        // Shows around photos that aren't square, since they're shown whole rather than cropped
        color: fill,
        border: Border.all(color: Palette.separator(context)),
      ),
      child: ClipOval(
        child: url.isEmpty
            ? placeholder
            : Image.network(
                optimizePhoto(url, name: name),
                // The whole photo, uncropped, inside the circle
                fit: BoxFit.contain,
                width: size,
                height: size,
                gaplessPlayback: true,
                // Web builds only: Firebase Storage sends no CORS headers, so the byte fetch
                // fails in a browser — fall back to a plain <img> element. No effect on iOS.
                webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
                frameBuilder: (_, child, frame, sync) => sync
                    ? child
                    : AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: const Duration(milliseconds: 150), child: child),
                loadingBuilder: (_, child, progress) =>
                    progress == null ? child : Stack(fit: StackFit.expand, children: [placeholder, child]),
                errorBuilder: (_, error, _) {
                  debugPrint('Avatar failed to load $url: $error');
                  return placeholder;
                },
              ),
      ),
    );
  }
}

/// MedalIcon.tsx: Font Awesome medal in gold / silver / bronze.
class MedalIcon extends StatelessWidget {
  /// 0 = 1st place, 1 = 2nd, 2 = 3rd
  const MedalIcon(this.rank, {super.key, this.size = 20});

  final int rank;
  final double size;

  @override
  Widget build(BuildContext context) =>
      Icon(FontAwesomeIcons.medal.data, size: size, color: rank >= 0 && rank < 3 ? Palette.medals[rank] : Palette.medals[1]);
}

/// `text-xs font-semibold px-2 py-0.5 rounded-full` badge: light tint + strong text,
/// or white on solid [color] when [solid].
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.color = Palette.blue600, this.solid = false});

  final String text;
  final Color color;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final c = Palette.resolve(context, color);
    final (bg, fg) = solid ? (c, const Color(0xFFFFFFFF)) : Palette.badge(context, c);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(
        text,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

/// Red count bubble, e.g. unfinished tasks on a role.
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key, this.color = Palette.red500});

  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(minWidth: 20),
    height: 20,
    padding: const EdgeInsets.symmetric(horizontal: 5),
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: Palette.resolve(context, color),
      borderRadius: BorderRadius.circular(10),
      boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 3, offset: Offset(0, 1))],
    ),
    child: Text(
      '$count',
      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFFFFFFF)),
    ),
  );
}

/// `bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl` input.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    required this.placeholder,
    this.obscure = false,
    this.keyboardType,
    this.maxLength,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.autofocus = false,
    this.textInputAction,
    this.autofillHints,
    this.prefix,
  });

  final TextEditingController? controller;
  final String placeholder;
  final bool obscure;
  final TextInputType? keyboardType;
  final int? maxLength;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final Widget? prefix;

  @override
  Widget build(BuildContext context) => CupertinoTextField(
    controller: controller,
    placeholder: placeholder,
    obscureText: obscure,
    keyboardType: keyboardType,
    maxLength: maxLength,
    maxLines: obscure ? 1 : maxLines,
    minLines: maxLines != null && maxLines! > 1 ? maxLines : null,
    onChanged: onChanged,
    onSubmitted: onSubmitted,
    autofocus: autofocus,
    textInputAction: textInputAction,
    autofillHints: autofillHints,
    prefix: prefix,
    // Multi-line fields have no Done key, so tapping anywhere else closes the keyboard.
    onTapOutside: (_) => FocusManager.instance.primaryFocus?.unfocus(),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    style: TextStyle(fontSize: 16, color: Palette.label(context)),
    placeholderStyle: TextStyle(fontSize: 16, color: Palette.tertiary(context)),
    decoration: BoxDecoration(
      color: Palette.fill(context),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Palette.separator(context)),
    ),
  );
}

/// Looks like the web's styled `<select>`; opens a native picker on tap.
class PickerRow extends StatelessWidget {
  const PickerRow({super.key, required this.value, required this.onTap, this.label, this.placeholder = false});

  final String? label;
  final String value;
  final VoidCallback onTap;

  /// Show [value] in placeholder gray (e.g. "Select a member").
  final bool placeholder;

  @override
  Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Palette.fill(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Palette.separator(context)),
      ),
      child: Row(
        children: [
          if (label != null) ...[Text(label!, style: TextStyle(fontSize: 15, color: Palette.secondary(context))), const SizedBox(width: 8)],
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 15, color: placeholder ? Palette.tertiary(context) : Palette.label(context)),
            ),
          ),
          Icon(CupertinoIcons.chevron_down, size: 14, color: Palette.secondary(context)),
        ],
      ),
    ),
  );
}

/// Row of `px-3 py-1 rounded-full text-xs font-semibold` filter chips.
class ChipGroup<T> extends StatelessWidget {
  const ChipGroup({super.key, required this.options, required this.selected, required this.onChanged, this.activeColor = Palette.blue600});

  final List<(T, String)> options;
  final T selected;
  final ValueChanged<T> onChanged;
  final Color activeColor;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final (value, label) in options)
        GestureDetector(
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: value == selected ? Palette.resolve(context, activeColor) : Palette.resolve(context, Palette.gray100),
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: value == selected ? const Color(0xFFFFFFFF) : Palette.secondary(context),
              ),
            ),
          ),
        ),
    ],
  );
}

/// "123 pts" with the number bold (`<strong className="text-black">`).
class StatText extends StatelessWidget {
  const StatText(this.value, this.unit, {super.key, this.size = 14});

  final int value;
  final String unit;
  final double size;

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(
      children: [
        TextSpan(
          text: '$value',
          style: TextStyle(fontWeight: FontWeight.w700, color: Palette.label(context)),
        ),
        TextSpan(text: ' $unit'),
      ],
    ),
    style: TextStyle(fontSize: size, color: Palette.resolve(context, const Color(0xFF4B5563))),
  );
}

/// The web's red-bordered "Danger Zone" card.
class DangerZone extends StatelessWidget {
  const DangerZone({super.key, this.title = 'Danger Zone', required this.text, required this.button});

  final String title;
  final String text;
  final Widget button;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: Palette.card(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Palette.isDark(context) ? const Color(0xFF7F1D1D) : Palette.red100),
      boxShadow: Palette.isDark(context) ? null : const [BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1))],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(title, color: Palette.red400, padding: const EdgeInsets.only(bottom: 4)),
        Muted(text),
        const SizedBox(height: 16),
        button,
      ],
    ),
  );
}

/// Entrance animation (fade + rise), the counterpart of motion's initial/animate.
class FadeSlideIn extends StatefulWidget {
  const FadeSlideIn({super.key, required this.child, this.delay = Duration.zero, this.offset = 16, this.dx = 0});

  final Widget child;
  final Duration delay;
  final double offset;
  final double dx;

  @override
  State<FadeSlideIn> createState() => _FadeSlideInState();
}

class _FadeSlideInState extends State<FadeSlideIn> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));

  @override
  void initState() {
    super.initState();
    if (widget.delay == Duration.zero) {
      _c.forward();
    } else {
      Future.delayed(widget.delay, () {
        if (mounted) _c.forward();
      });
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, child) {
      final t = Curves.easeOutCubic.transform(_c.value);
      return Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(widget.dx * (1 - t), widget.offset * (1 - t)), child: child),
      );
    },
    child: widget.child,
  );
}

/// Staggered delay for list item [i], capped so long lists don't crawl in.
Duration stagger(int i, [int ms = 35]) => Duration(milliseconds: (i.clamp(0, 10)) * ms);

/// User / Instructor / Admin pill (the web's AccessBadge).
class AccessTag extends StatelessWidget {
  const AccessTag(this.level, {super.key});

  final AccessLevel level;

  @override
  Widget build(BuildContext context) => Tag(
    level.label,
    color: switch (level) {
      AccessLevel.user => const Color(0xFF6B7280),
      AccessLevel.instructor => Palette.purple700,
      AccessLevel.admin => Palette.blue700,
    },
  );
}

/// An ID in small gray monospace with a copy icon; tap to copy it (role and user IDs).
class CopyIdChip extends StatelessWidget {
  const CopyIdChip(this.id, {super.key, required this.copiedMessage});

  final String id;

  /// Toast shown once copied, e.g. "Role ID copied".
  final String copiedMessage;

  @override
  Widget build(BuildContext context) => Pressable(
    onPressed: () async {
      await Clipboard.setData(ClipboardData(text: id));
      if (context.mounted) showToast(context, copiedMessage);
    },
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Palette.fill(context),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Palette.resolve(context, Palette.gray100)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              id,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontFamily: 'Menlo', color: Palette.resolve(context, Palette.gray400)),
            ),
          ),
          const SizedBox(width: 6),
          Icon(CupertinoIcons.doc_on_doc, size: 12, color: Palette.resolve(context, Palette.gray400)),
        ],
      ),
    ),
  );
}
