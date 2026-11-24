// components/ProfilePage.tsx: another user's card, with admin tools to edit
// their stats, kick them from the current role, or remove them from global.
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';
import 'dialogs.dart';

/// [user] carries the stats to display (role stats on a role page, global
/// elsewhere); [roleId] is set when opened from a role page.
Future<void> showProfileSheet(BuildContext context, UserData user, {String? roleId}) => showModalCard<void>(
  context,
  maxWidth: 320,
  builder: (_) => _ProfileCard(user: user, roleId: roleId),
);

class _ProfileCard extends StatefulWidget {
  const _ProfileCard({required this.user, this.roleId});

  final UserData user;
  final String? roleId;

  @override
  State<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<_ProfileCard> {
  late UserData _user = widget.user;
  bool _editing = false;
  final _points = TextEditingController();
  final _tasks = TextEditingController();
  Set<String>? _globalViewers;

  @override
  void initState() {
    super.initState();
    if (context.read<AppState>().isAdmin) {
      Db.globalViewerRolesStream().first.then((roles) {
        if (mounted) setState(() => _globalViewers = {for (final r in roles) ...r.members});
      });
    }
  }

  @override
  void dispose() {
    _points.dispose();
    _tasks.dispose();
    super.dispose();
  }

  bool get _editingRole => widget.roleId != null && _user.roles.any((r) => r.id == widget.roleId);

  int _read(TextEditingController c) => (int.tryParse(c.text.trim()) ?? 0).clamp(0, 1 << 31);

  Future<void> _saveRole(bool alsoGlobal) async {
    final p = _read(_points), t = _read(_tasks);
    await Db.setMemberRoleStats(_user.uid, widget.roleId!, points: p, tasks: t, alsoGlobal: alsoGlobal);
    setState(() {
      _user = _user.copyWith(points: p, taskCompleted: t);
      _editing = false;
    });
  }

  Future<void> _saveGlobal() async {
    final p = _read(_points), t = _read(_tasks);
    await Db.setGlobalStats(_user.uid, points: p, tasks: t);
    setState(() {
      _user = _user.copyWith(points: p, taskCompleted: t);
      _editing = false;
    });
  }

  Future<void> _kick() async {
    final nav = Navigator.of(context);
    final ok = await confirmDialog(
      context,
      title: 'Kick Member',
      message: 'Remove ${_user.name} from this role?',
      confirmLabel: 'Kick',
      destructive: true,
    );
    if (!ok) return;
    await Db.kickUserFromRole(widget.roleId!, _user.uid);
    nav.pop();
  }

  Future<void> _removeFromGlobal() async {
    final nav = Navigator.of(context);
    final ok = await confirmDialog(
      context,
      title: 'Remove from Global',
      message: 'Remove ${_user.name} from the global leaderboard? They can be restored later from Old Users.',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (!ok) return;
    final removed = await Db.removeFromGlobalRole(_user.uid);
    if (!mounted) return;
    if (!removed) {
      await alertDialog(
        context,
        message: "${_user.name} can't be removed from global (admins and people who can see the global leaderboard always stay in it).",
      );
      return;
    }
    nav.pop();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final targetIsAdmin = app.admins.contains(_user.uid);
    final canRemoveFromGlobal =
        app.isAdmin && _user.isInGlobal && !targetIsAdmin && _globalViewers != null && !_globalViewers!.contains(_user.uid);

    return Column(
      children: [
        Avatar(_user.photoURL, name: _user.name, size: Avatar.md),
        const SizedBox(height: 16),
        Heading(_user.name, size: 20, maxLines: 2),
        const SizedBox(height: 16),
        _editing ? _editView(context) : _infoView(context, app.isAdmin, targetIsAdmin, canRemoveFromGlobal),
      ],
    );
  }

  Widget _statBox(BuildContext context, String label, int value) => Expanded(
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Palette.fill(context), borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          SectionLabel(label, size: 11.5, padding: const EdgeInsets.only(bottom: 2)),
          Text(
            '$value',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Palette.label(context)),
          ),
        ],
      ),
    ),
  );

  Widget _infoView(BuildContext context, bool isAdmin, bool targetIsAdmin, bool canRemoveFromGlobal) {
    final roleNames = _user.roles.where((r) => r.id != globalRoleId).map((r) => r.name).toList();
    return Column(
      children: [
        Row(
          children: [_statBox(context, 'Points', _user.points), const SizedBox(width: 12), _statBox(context, 'Tasks', _user.taskCompleted)],
        ),
        if (roleNames.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Palette.fill(context), borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionLabel('Roles', size: 11.5, padding: EdgeInsets.only(bottom: 8)),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final n in roleNames)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Palette.card(context),
                          borderRadius: BorderRadius.circular(99),
                          border: Border.all(color: Palette.separator(context)),
                        ),
                        child: Text(
                          n,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Palette.label(context)),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            if (isAdmin) ...[
              Expanded(
                child: AppButton(
                  label: 'Edit',
                  style: AppButtonStyle.blue,
                  size: AppButtonSize.full,
                  onPressed: () => setState(() {
                    _points.text = '${_user.points}';
                    _tasks.text = '${_user.taskCompleted}';
                    _editing = true;
                  }),
                ),
              ),
              const SizedBox(width: 8),
            ],
            if (isAdmin && !targetIsAdmin && widget.roleId != null) ...[
              Expanded(
                child: AppButton(label: 'Kick', style: AppButtonStyle.red, size: AppButtonSize.full, onPressed: _kick),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: AppButton(
                label: 'Close',
                style: AppButtonStyle.gray,
                size: AppButtonSize.full,
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
        if (canRemoveFromGlobal) ...[
          const SizedBox(height: 16),
          AppButton(label: 'Remove from Global', style: AppButtonStyle.red, size: AppButtonSize.full, onPressed: _removeFromGlobal),
        ],
      ],
    );
  }

  Widget _field(String label, TextEditingController c) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(label, size: 11.5, padding: const EdgeInsets.only(bottom: 6)),
        AppTextField(controller: c, placeholder: '0', keyboardType: TextInputType.number),
      ],
    ),
  );

  Widget _editView(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Center(
        child: SectionLabel(_editingRole ? 'Edit Role Stats' : 'Edit Global Stats', size: 11.5, padding: const EdgeInsets.only(bottom: 12)),
      ),
      Row(children: [_field('Points', _points), const SizedBox(width: 12), _field('Tasks', _tasks)]),
      const SizedBox(height: 16),
      Row(
        children: [
          if (!_editingRole) ...[
            Expanded(
              child: AppButton(label: 'Save', size: AppButtonSize.full, onPressed: _saveGlobal),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: AppButton(
              label: 'Back',
              style: AppButtonStyle.gray,
              size: AppButtonSize.full,
              onPressed: () => setState(() => _editing = false),
            ),
          ),
        ],
      ),
      if (_editingRole) ...[
        const SizedBox(height: 8),
        AppButton(label: 'Save to Role Only', size: AppButtonSize.full, onPressed: () => _saveRole(false)),
        const SizedBox(height: 8),
        AppButton(label: 'Save to Role + Global', style: AppButtonStyle.blue, size: AppButtonSize.full, onPressed: () => _saveRole(true)),
      ],
    ],
  );
}
