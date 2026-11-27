// Dialogs matching the web: ConfirmDialog.tsx's centered card for confirms and
// alerts, and the black/60 overlay + spring-in card used by the profile card,
// bug report, edit-member and semester-reset modals. Selects and date inputs use
// the native iOS pickers, as Safari does for the web app.
import 'package:flutter/cupertino.dart';

import 'motion.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';

/// Centered modal card over a black/60 scrim that springs in (scale .92 → 1).
///
/// [padding] is the space inside the card; pass zero for edge-to-edge content (it's clipped to the corners).
Future<T?> showModalCard<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  double maxWidth = 384,
  bool dismissible = true,
  EdgeInsets padding = const EdgeInsets.all(24),
}) => showGeneralDialog<T>(
  context: context,
  barrierDismissible: dismissible,
  barrierLabel: 'Close',
  barrierColor: const Color(0x99000000),
  transitionDuration: const Duration(milliseconds: 260),
  pageBuilder: (ctx, _, _) => SafeArea(
    child: Center(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: MediaQuery.sizeOf(ctx).height * .85),
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: Palette.card(ctx),
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 50, offset: Offset(0, 25), spreadRadius: -12)],
            ),
            child: SingleChildScrollView(padding: padding, child: builder(ctx)),
          ),
        ),
      ),
    ),
  ),
  transitionBuilder: (ctx, anim, _, child) {
    // Reduced motion: just fade, no bounce
    if (reduceMotion(ctx)) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
        child: child,
      );
    }
    final t = CurvedAnimation(parent: anim, curve: const ElasticOutCurve(1.1), reverseCurve: Curves.easeIn);
    return FadeTransition(
      opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
      child: AnimatedBuilder(
        animation: t,
        builder: (_, c) => Transform.translate(
          offset: Offset(0, 20 * (1 - t.value)),
          child: Transform.scale(scale: .92 + .08 * t.value, child: c),
        ),
        child: child,
      ),
    );
  },
);

Future<bool> confirmDialog(
  BuildContext context, {
  String? title,
  required String message,
  String confirmLabel = 'Confirm',
  bool destructive = false,
}) async =>
    await _confirmCard(
      context,
      title: title ?? 'Are you sure?',
      message: message,
      confirmLabel: confirmLabel,
      danger: destructive,
      alertOnly: false,
    ) ??
    false;

Future<void> alertDialog(BuildContext context, {String? title, required String message}) =>
    _confirmCard(context, title: title ?? 'Notice', message: message, confirmLabel: 'OK', danger: false, alertOnly: true);

Future<bool?> _confirmCard(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  required bool danger,
  required bool alertOnly,
}) => showModalCard<bool>(
  context,
  maxWidth: 320,
  builder: (ctx) => Column(
    children: [
      Heading(title, maxLines: null),
      const SizedBox(height: 16),
      Muted(message, center: true),
      const SizedBox(height: 16),
      Row(
        children: [
          if (!alertOnly) ...[
            Expanded(
              child: AppButton(
                label: 'Cancel',
                style: AppButtonStyle.cancel,
                size: AppButtonSize.full,
                onPressed: () => Navigator.pop(ctx, false),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: AppButton(
              label: confirmLabel,
              style: danger ? AppButtonStyle.red : AppButtonStyle.blue,
              size: AppButtonSize.full,
              onPressed: () => Navigator.pop(ctx, true),
            ),
          ),
        ],
      ),
    ],
  ),
);

/// Confirm card with a text field (the web's window.prompt, e.g. password to delete).
Future<String?> promptText(
  BuildContext context, {
  required String title,
  String? message,
  String placeholder = '',
  String? initialValue,
  TextInputType? keyboardType,
  bool obscure = false,
  String confirmLabel = 'OK',
  bool destructive = false,
}) {
  final controller = TextEditingController(text: initialValue);
  return showModalCard<String>(
    context,
    maxWidth: 320,
    builder: (ctx) => Column(
      children: [
        Heading(title, maxLines: null),
        if (message != null) ...[const SizedBox(height: 12), Muted(message, center: true)],
        const SizedBox(height: 16),
        AppTextField(controller: controller, placeholder: placeholder, keyboardType: keyboardType, obscure: obscure, autofocus: true),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: 'Cancel',
                style: AppButtonStyle.cancel,
                size: AppButtonSize.full,
                onPressed: () => Navigator.pop(ctx),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: AppButton(
                label: confirmLabel,
                style: destructive ? AppButtonStyle.red : AppButtonStyle.blue,
                size: AppButtonSize.full,
                onPressed: () => Navigator.pop(ctx, controller.text),
              ),
            ),
          ],
        ),
      ],
    ),
  ).whenComplete(controller.dispose);
}

/// Native chooser for a `<select>`; returns the picked value or null if cancelled.
Future<T?> pickOption<T>(BuildContext context, {String? title, required List<(T, String)> options, T? selected}) =>
    showCupertinoModalPopup<T>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: title == null ? null : Text(title),
        actions: [
          for (final (value, label) in options)
            CupertinoActionSheetAction(isDefaultAction: value == selected, onPressed: () => Navigator.pop(ctx, value), child: Text(label)),
        ],
        cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
      ),
    );

/// Brief confirmation near the top of the screen (the web's PhraseAlert, which
/// shows a message for 3 seconds).
void showToast(BuildContext context, String message, {bool error = false}) {
  HapticFeedback.mediumImpact();
  final overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Toast(message: message, error: error, onDone: () => entry.remove()),
  );
  overlay.insert(entry);
}

class _Toast extends StatefulWidget {
  const _Toast({required this.message, required this.error, required this.onDone});

  final String message;
  final bool error;
  final VoidCallback onDone;

  @override
  State<_Toast> createState() => _ToastState();
}

class _ToastState extends State<_Toast> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 250));

  @override
  void initState() {
    super.initState();
    _c.forward();
    Future.delayed(const Duration(seconds: 3), () async {
      if (!mounted) return;
      await _c.reverse();
      widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Positioned(
    top: MediaQuery.paddingOf(context).top + 8,
    left: 16,
    right: 16,
    child: IgnorePointer(
      child: FadeTransition(
        opacity: _c,
        child: SlideTransition(
          position: Tween(begin: const Offset(0, -.4), end: Offset.zero).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutCubic)),
          child: Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: widget.error ? Palette.red400 : Palette.card(context),
                borderRadius: BorderRadius.circular(12),
                border: widget.error ? null : Border.all(color: Palette.resolve(context, Palette.gray100)),
                boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 15, offset: Offset(0, 6))],
              ),
              child: Text(
                widget.message,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, color: widget.error ? const Color(0xFFFFFFFF) : Palette.label(context)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// Someone to pick in [pickPerson].
typedef PickablePerson = ({String uid, String name, String photoURL, String? hint});

/// Bottom sheet listing people with their photos and a search box, in place of
/// a plain action sheet. Returns the picked uid, or null if dismissed. [chosen]
/// people show a check (e.g. already selected for a task).
Future<String?> pickPerson(
  BuildContext context, {
  required String title,
  required List<PickablePerson> people,
  Set<String> chosen = const {},
  String emptyText = 'No one to pick.',
}) => showCupertinoModalPopup<String>(
  context: context,
  builder: (ctx) => _PersonSheet(title: title, people: people, chosen: chosen, emptyText: emptyText),
);

class _PersonSheet extends StatefulWidget {
  const _PersonSheet({required this.title, required this.people, required this.chosen, required this.emptyText});

  final String title;
  final List<PickablePerson> people;
  final Set<String> chosen;
  final String emptyText;

  @override
  State<_PersonSheet> createState() => _PersonSheetState();
}

class _PersonSheetState extends State<_PersonSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty ? widget.people : widget.people.where((p) => p.name.toLowerCase().contains(q)).toList();
    final media = MediaQuery.of(context);
    return Container(
      height: media.size.height * .7,
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      decoration: BoxDecoration(
        color: Palette.card(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 5,
              decoration: BoxDecoration(color: Palette.resolve(context, Palette.gray300), borderRadius: BorderRadius.circular(3)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 8, 4),
              child: Row(
                children: [
                  Expanded(child: Heading(widget.title, size: 18)),
                  CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancel'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: CupertinoSearchTextField(placeholder: 'Search by name', onChanged: (v) => setState(() => _query = v)),
            ),
            Expanded(
              child: shown.isEmpty
                  ? Center(child: Muted(widget.people.isEmpty ? widget.emptyText : 'No matches.', color: Palette.gray400))
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                      itemCount: shown.length,
                      itemBuilder: (context, i) {
                        final p = shown[i];
                        final isChosen = widget.chosen.contains(p.uid);
                        return Pressable(
                          scale: .98,
                          onPressed: () => Navigator.pop(context, p.uid),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 6),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            decoration: BoxDecoration(
                              color: isChosen ? Palette.resolve(context, Palette.blue50) : Palette.fill(context),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: isChosen ? Palette.blue500.withValues(alpha: .35) : Palette.separator(context)),
                            ),
                            child: Row(
                              children: [
                                Avatar(p.photoURL, name: p.name, size: Avatar.xxs),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        p.name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: Palette.label(context)),
                                      ),
                                      if (p.hint != null) Muted(p.hint!, size: 12, color: Palette.gray400),
                                    ],
                                  ),
                                ),
                                if (isChosen)
                                  Icon(CupertinoIcons.checkmark_alt, size: 18, color: Palette.resolve(context, Palette.navActive)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A message in the middle of the screen that fades in, stays a couple of
/// seconds and fades out (e.g. after sending a bug report).
void showCenterNotice(OverlayState overlay, {required String title, String? message}) {
  HapticFeedback.mediumImpact();
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _CenterNotice(title: title, message: message, onDone: () => entry.remove()),
  );
  overlay.insert(entry);
}

class _CenterNotice extends StatefulWidget {
  const _CenterNotice({required this.title, required this.message, required this.onDone});

  final String title;
  final String? message;
  final VoidCallback onDone;

  @override
  State<_CenterNotice> createState() => _CenterNoticeState();
}

class _CenterNoticeState extends State<_CenterNotice> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 250));

  @override
  void initState() {
    super.initState();
    _c.forward();
    Future.delayed(const Duration(milliseconds: 2500), () async {
      if (!mounted) return;
      await _c.reverse();
      widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Center(
      child: FadeTransition(
        opacity: _c,
        child: ScaleTransition(
          scale: Tween(begin: .9, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeOutBack)),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 32),
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
            decoration: BoxDecoration(
              color: const Color(0xE6111827),
              borderRadius: BorderRadius.circular(18),
              boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 30, offset: Offset(0, 12))],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(CupertinoIcons.checkmark_circle_fill, color: Color(0xFF4ADE80), size: 26),
                const SizedBox(width: 12),
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFFFFFFF),
                          decoration: TextDecoration.none,
                        ),
                      ),
                      if (widget.message != null)
                        Text(
                          widget.message!,
                          style: const TextStyle(fontSize: 13, color: Color(0xB3FFFFFF), decoration: TextDecoration.none),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
