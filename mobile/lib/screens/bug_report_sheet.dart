// Port of components/BugReport.tsx: members send a bug report or a feature request;
// admins read them (labelled and filterable by type) and dismiss them.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

Future<void> showBugReportSheet(BuildContext context) =>
    showModalCard<void>(context, builder: (ctx) => ctx.read<AppState>().isAdmin ? const _BugList() : const _BugForm());

/// Each type's icon and colors, like TYPE_LOOK in BugReport.tsx.
({IconData icon, Color fg, Color bg, String label}) _look(BuildContext context, FeedbackType t) => switch (t) {
  FeedbackType.bug => (icon: FontAwesomeIcons.bug.data, fg: Palette.red500, bg: Palette.red500.withValues(alpha: .12), label: 'Bug'),
  FeedbackType.feature => (
    icon: FontAwesomeIcons.lightbulb.data,
    fg: const Color(0xFFD97706),
    bg: const Color(0xFFF59E0B).withValues(alpha: .14),
    label: 'Feature',
  ),
};

/// Same X as the web panel: gray icon in a round tap target that closes the card.
class _CloseButton extends StatelessWidget {
  const _CloseButton();

  @override
  Widget build(BuildContext context) => Transform.translate(
    offset: const Offset(8, -4),
    child: CupertinoButton(
      padding: EdgeInsets.zero,
      minimumSize: const Size(32, 32),
      borderRadius: BorderRadius.circular(16),
      onPressed: () => Navigator.pop(context),
      child: Semantics(
        label: 'Close',
        button: true,
        child: FaIcon(FontAwesomeIcons.xmark, size: 16, color: Palette.resolve(context, Palette.gray400)),
      ),
    ),
  );
}

class _BugForm extends StatefulWidget {
  const _BugForm();

  @override
  State<_BugForm> createState() => _BugFormState();
}

class _BugFormState extends State<_BugForm> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;
  FeedbackType _type = FeedbackType.bug;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final user = context.read<AppState>().user;
    if (user == null || _title.text.trim().isEmpty || _desc.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await Db.submitBug(type: _type, title: _title.text.trim(), desc: _desc.text.trim(), email: user.email ?? '', uid: user.uid);
    } catch (_) {
      if (mounted) {
        setState(() => _busy = false);
        showToast(context, "Couldn't send your report. Please try again.", error: true);
      }
      return;
    }
    if (!mounted) return;
    // Close the form, then confirm in the middle of the screen
    final overlay = Overlay.of(context, rootOverlay: true);
    Navigator.pop(context);
    showCenterNotice(
      overlay,
      title: _type == FeedbackType.feature ? 'Feature request submitted' : 'Bug report submitted',
      message: 'Thanks for helping us improve StemUp.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final feature = _type == FeedbackType.feature;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Heading(feature ? 'Request a Feature' : 'Report a Bug', size: 16),
                  const SizedBox(height: 2),
                  Muted(
                    feature ? 'Tell us what would make StemUp better.' : 'Help us improve by describing what went wrong.',
                    size: 12,
                    color: Palette.gray400,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            const _CloseButton(),
          ],
        ),
        const SizedBox(height: 16),
        // What they're sending
        Row(
          children: [
            for (final t in FeedbackType.values) ...[
              if (t != FeedbackType.values.first) const SizedBox(width: 8),
              Expanded(
                child: _TypeChoice(type: t, selected: _type == t, onTap: () => setState(() => _type = t)),
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        AppTextField(controller: _title, placeholder: 'Title', autofocus: true),
        const SizedBox(height: 10),
        AppTextField(
          controller: _desc,
          placeholder: feature ? 'Describe the feature and how it would help...' : 'Describe the bug...',
          maxLines: 4,
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: AppButton(label: 'Submit', style: AppButtonStyle.blue, size: AppButtonSize.sm, loading: _busy, onPressed: _submit),
        ),
      ],
    );
  }
}

/// One of the Bug / Feature cards at the top of the form.
class _TypeChoice extends StatelessWidget {
  const _TypeChoice({required this.type, required this.selected, required this.onTap});

  final FeedbackType type;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final look = _look(context, type);
    final fg = selected ? look.fg : Palette.secondary(context);
    return Semantics(
      selected: selected,
      button: true,
      label: look.label,
      child: Pressable(
        onPressed: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? look.bg : Palette.fill(context),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? look.fg : Palette.separator(context), width: 2),
          ),
          child: Column(
            children: [
              Icon(look.icon, size: 16, color: fg),
              const SizedBox(height: 4),
              Text(
                look.label,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: fg),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BugList extends StatefulWidget {
  const _BugList();

  @override
  State<_BugList> createState() => _BugListState();
}

class _BugListState extends State<_BugList> {
  late final Stream<List<Bug>> _stream = Db.bugsStream();

  /// null for all
  FeedbackType? _filter;

  @override
  Widget build(BuildContext context) => StreamBuilder<List<Bug>>(
    stream: _stream,
    builder: (context, snap) {
      final all = snap.data ?? const <Bug>[];
      final bugs = _filter == null ? all : all.where((b) => b.type == _filter).toList();
      int count(FeedbackType? t) => t == null ? all.length : all.where((b) => b.type == t).length;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: Heading('Bugs & Features', size: 16)),
              Muted('${all.length} total', size: 12, color: Palette.gray400),
              const SizedBox(width: 12),
              const _CloseButton(),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final f in <FeedbackType?>[null, ...FeedbackType.values]) ...[
                if (f != null) const SizedBox(width: 6),
                Expanded(
                  child: Pressable(
                    onPressed: () => setState(() => _filter = f),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      decoration: BoxDecoration(
                        color: _filter == f ? Palette.label(context) : Palette.fill(context),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${switch (f) {
                          null => 'All',
                          FeedbackType.bug => 'Bugs',
                          FeedbackType.feature => 'Features',
                        }} (${count(f)})',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: _filter == f ? Palette.card(context) : Palette.secondary(context),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          if (!snap.hasData)
            const EmptyState('Loading...')
          else if (bugs.isEmpty)
            EmptyState(switch (_filter) {
              FeedbackType.feature => 'No feature requests.',
              FeedbackType.bug => 'No bug reports.',
              null => 'Nothing here yet.',
            })
          else
            for (final b in bugs)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  color: Palette.gray50,
                  radius: 12,
                  shadow: false,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _TypeChip(b.type),
                      const SizedBox(height: 6),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              b.bugTitle,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Palette.label(context)),
                            ),
                          ),
                          LinkText('Dismiss', size: 12, bold: true, color: Palette.red500, onPressed: () => Db.dismissBug(b.id)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(b.bugDesc, style: TextStyle(fontSize: 14, color: Palette.resolve(context, const Color(0xFF4B5563)))),
                      const SizedBox(height: 6),
                      Muted(
                        b.createdAt == null ? b.userEmail : '${b.userEmail} · ${DateFormat('MMM d', 'en_US').format(b.createdAt!)}',
                        size: 12,
                        color: Palette.gray400,
                      ),
                    ],
                  ),
                ),
              ),
        ],
      );
    },
  );
}

/// "Bug" or "Feature request" above each report in the admin list.
class _TypeChip extends StatelessWidget {
  const _TypeChip(this.type);

  final FeedbackType type;

  @override
  Widget build(BuildContext context) {
    final look = _look(context, type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: look.bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(look.icon, size: 9, color: look.fg),
          const SizedBox(width: 4),
          Text(
            type == FeedbackType.feature ? 'Feature request' : 'Bug',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: look.fg),
          ),
        ],
      ),
    );
  }
}
