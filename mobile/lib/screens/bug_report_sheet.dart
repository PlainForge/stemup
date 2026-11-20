// Port of components/BugReport.tsx: members file reports, admins read and dismiss them.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
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
  bool _submitted = false;

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
    await Db.submitBug(title: _title.text.trim(), desc: _desc.text.trim(), email: user.email ?? '', uid: user.uid);
    if (!mounted) return;
    _title.clear();
    _desc.clear();
    setState(() {
      _busy = false;
      _submitted = true;
    });
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) setState(() => _submitted = false);
    });
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Heading('Report a Bug', size: 16),
                SizedBox(height: 2),
                Muted('Help us improve by describing what went wrong.', size: 12, color: Palette.gray400),
              ],
            ),
          ),
          const SizedBox(width: 12),
          const _CloseButton(),
        ],
      ),
      const SizedBox(height: 16),
      AppTextField(controller: _title, placeholder: 'Title', autofocus: true),
      const SizedBox(height: 10),
      AppTextField(controller: _desc, placeholder: 'Describe the bug...', maxLines: 4),
      const SizedBox(height: 16),
      Align(
        alignment: Alignment.centerLeft,
        child: AppButton(
          label: _submitted ? 'Submitted!' : 'Submit',
          style: AppButtonStyle.blue,
          size: AppButtonSize.sm,
          loading: _busy,
          onPressed: _submit,
        ),
      ),
    ],
  );
}

class _BugList extends StatelessWidget {
  const _BugList();

  @override
  Widget build(BuildContext context) => StreamBuilder<List<Bug>>(
    stream: Db.bugsStream(),
    builder: (context, snap) {
      final bugs = snap.data ?? const [];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: Heading('Bug Reports', size: 16)),
              Muted('${bugs.length} total', size: 12, color: Palette.gray400),
              const SizedBox(width: 12),
              const _CloseButton(),
            ],
          ),
          const SizedBox(height: 14),
          if (!snap.hasData)
            const EmptyState('Loading...')
          else if (bugs.isEmpty)
            const EmptyState('No bug reports.')
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
                      Muted(b.userEmail, size: 12, color: Palette.gray400),
                    ],
                  ),
                ),
              ),
        ],
      );
    },
  );
}
