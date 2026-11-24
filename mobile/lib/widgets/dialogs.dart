// Dialogs matching the web: ConfirmDialog.tsx's centered card for confirms and
// alerts, and the black/60 overlay + spring-in card used by the profile card,
// bug report, edit-member and semester-reset modals. Selects and date inputs use
// the native iOS pickers, as Safari does for the web app.
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';

import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';

/// Centered modal card over a black/60 scrim that springs in (scale .92 → 1).
Future<T?> showModalCard<T>(BuildContext context, {required WidgetBuilder builder, double maxWidth = 384, bool dismissible = true}) =>
    showGeneralDialog<T>(
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
                decoration: BoxDecoration(
                  color: Palette.card(ctx),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 50, offset: Offset(0, 25), spreadRadius: -12)],
                ),
                child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: builder(ctx)),
              ),
            ),
          ),
        ),
      ),
      transitionBuilder: (ctx, anim, _, child) {
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
              child: AppButton(label: 'Cancel', style: AppButtonStyle.cancel, size: AppButtonSize.full, onPressed: () => Navigator.pop(ctx)),
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

/// Wheel date picker for an `<input type="date">`. Returns null when cancelled;
/// the "Clear" button returns [clearSentinel].
final clearSentinel = DateTime(0);

Future<DateTime?> pickDate(BuildContext context, {DateTime? initial, bool allowClear = false}) {
  final today = DateTime.now();
  final min = DateTime(today.year, today.month, today.day);
  var value = initial != null && initial.isAfter(min) ? initial : min;
  return showCupertinoModalPopup<DateTime>(
    context: context,
    builder: (ctx) => Container(
      height: 320,
      padding: const EdgeInsets.only(top: 6),
      color: Palette.card(ctx),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            Row(
              children: [
                if (allowClear)
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx, clearSentinel),
                    child: const Text('Clear', style: TextStyle(color: Palette.red500)),
                  ),
                const Spacer(),
                CupertinoButton(
                  onPressed: () => Navigator.pop(ctx, value),
                  child: const Text(
                    'Done',
                    style: TextStyle(fontWeight: FontWeight.w600, color: Palette.blue600),
                  ),
                ),
              ],
            ),
            Expanded(
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.date,
                initialDateTime: value,
                minimumDate: min,
                onDateTimeChanged: (d) => value = d,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

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
