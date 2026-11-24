// Port of components/SemesterResetModal.tsx: pick roles → name the archive →
// review the impact → run it.
import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

Future<void> showSemesterResetSheet(BuildContext context) => showModalCard<void>(context, builder: (_) => const _SemesterReset());

enum _Step { select, name, confirm, done }

class _SemesterReset extends StatefulWidget {
  const _SemesterReset();

  @override
  State<_SemesterReset> createState() => _SemesterResetState();
}

class _SemesterResetState extends State<_SemesterReset> {
  _Step _step = _Step.select;
  List<Role>? _roles;
  final _remove = <String>{};
  final _batchName = TextEditingController();
  bool _confirmed = false;
  bool _busy = false;
  String _error = '';
  ({List<String> roleNames, int usersToArchive, int usersToUpdate})? _preview;
  ({int archivedUsers, int updatedUsers, int deletedRoles, String batchId, String batchName})? _result;

  @override
  void initState() {
    super.initState();
    Db.getRoles()
        .then((r) {
          if (mounted) setState(() => _roles = r.where((x) => !x.isGlobal).toList());
        })
        .catchError((_) {
          if (mounted) setState(() => _error = "Couldn't load roles. Try again.");
        });
  }

  @override
  void dispose() {
    _batchName.dispose();
    super.dispose();
  }

  Future<void> _toConfirm() async {
    setState(() {
      _step = _Step.confirm;
      _busy = true;
      _error = '';
    });
    try {
      final p = await Db.previewSemesterReset(_remove.toList());
      if (mounted) setState(() => _preview = p);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = "Couldn't compute the preview. Try again.";
          _step = _Step.name;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final r = await Db.executeSemesterReset(_remove.toList(), _batchName.text.trim());
      if (mounted) {
        setState(() {
          _result = r;
          _step = _Step.done;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Something went wrong during the reset. Some changes may be partially applied.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _plural(int n, String word) => '$n $word${n == 1 ? '' : 's'}';

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: const Duration(milliseconds: 260),
    transitionBuilder: (child, a) => FadeTransition(
      opacity: a,
      child: SlideTransition(
        position: Tween(begin: const Offset(.08, 0), end: Offset.zero).animate(a),
        child: child,
      ),
    ),
    child: KeyedSubtree(key: ValueKey(_step), child: _body(context)),
  );

  Widget _body(BuildContext context) {
    final error = _error.isEmpty
        ? null
        : Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(_error, style: TextStyle(color: Palette.resolve(context, Palette.red500), fontSize: 13)),
          );
    switch (_step) {
      case _Step.select:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Heading('Semester Reset', size: 18),
            const SizedBox(height: 6),
            const Muted(
              'Choose which roles to remove. Users whose only roles are removed will be archived under Inactive Users and removed '
              'from active rosters; everyone else keeps their account, but their points and completed tasks reset to 0.',
              size: 14,
            ),
            const SizedBox(height: 14),
            if (_roles == null)
              const Padding(padding: EdgeInsets.all(20), child: CupertinoActivityIndicator())
            else if (_roles!.isEmpty)
              const EmptyState('No roles to reset.')
            else
              for (final r in _roles!)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AppCard(
                    padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                r.name,
                                style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                              ),
                              Muted(_plural(r.members.length, 'member'), size: 12.5),
                            ],
                          ),
                        ),
                        Pressable(
                          onPressed: () => setState(() => _remove.contains(r.id) ? _remove.remove(r.id) : _remove.add(r.id)),
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 180),
                            child: _remove.contains(r.id)
                                ? const Tag('Remove', key: ValueKey('r'), color: Palette.red500)
                                : const Tag('Keep', key: ValueKey('k'), color: Palette.green600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ?error,
            const SizedBox(height: 12),
            AppButton(
              label: 'Next',
              style: AppButtonStyle.red,
              size: AppButtonSize.full,
              onPressed: _remove.isEmpty ? null : () => setState(() => _step = _Step.name),
            ),
            const SizedBox(height: 6),
            Center(
              child: LinkText('Cancel', size: 12, color: Palette.gray400, onPressed: () => Navigator.pop(context)),
            ),
          ],
        );
      case _Step.name:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Heading('Name this Archive', size: 18),
            const SizedBox(height: 6),
            const Muted('Archived users will be saved under this name in Admin → Inactive Users, e.g. "Fall 2025".'),
            const SizedBox(height: 14),
            AppTextField(
              controller: _batchName,
              placeholder: 'Archive name',
              maxLength: 64,
              autofocus: true,
              onChanged: (_) => setState(() {}),
            ),
            ?error,
            const SizedBox(height: 14),
            AppButton(
              label: 'Next',
              style: AppButtonStyle.red,
              size: AppButtonSize.full,
              onPressed: _batchName.text.trim().isEmpty ? null : _toConfirm,
            ),
            const SizedBox(height: 6),
            Center(
              child: LinkText('Back', size: 12, color: Palette.gray400, onPressed: () => setState(() => _step = _Step.select)),
            ),
          ],
        );
      case _Step.confirm:
        final p = _preview;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Heading('Confirm Reset', size: 18),
            const SizedBox(height: 6),
            const Muted('This action is permanent and cannot be undone.'),
            const SizedBox(height: 14),
            if (_busy && _result == null && p == null)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Muted('Calculating impact...', center: true, color: Palette.gray400),
              )
            else if (p != null) ...[
              AppCard(
                color: Palette.resolve(context, Palette.red500).withValues(alpha: .1),
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Roles to remove (${p.roleNames.length}):\n${p.roleNames.join(', ')}',
                  style: TextStyle(color: Palette.resolve(context, Palette.red500), fontSize: 14),
                ),
              ),
              const SizedBox(height: 10),
              AppCard(
                padding: const EdgeInsets.all(14),
                child: Text(
                  '${_plural(p.usersToArchive, 'user')} will be archived to "${_batchName.text.trim()}" (name, photo, points and tasks completed saved; their tasks and role data are not) and removed from active rosters.\n\n'
                  '${_plural(p.usersToUpdate, 'user')} will keep their account, lose access to removed roles, and have their points/tasks reset to 0.',
                  style: TextStyle(fontSize: 14, color: Palette.label(context)),
                ),
              ),
              const SizedBox(height: 10),
              AppCard(
                color: Palette.resolve(context, Palette.amber700).withValues(alpha: .12),
                padding: const EdgeInsets.all(14),
                child: Text(
                  "Admins are never archived. Archived users' sign-in accounts aren't removed from Firebase Authentication — Google users get a "
                  'fresh profile automatically next time they sign in; email/password accounts need to be removed manually in the Firebase Console '
                  'if you want to free up that email.',
                  style: TextStyle(fontSize: 12.5, color: Palette.resolve(context, Palette.amber700)),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  CupertinoCheckbox(value: _confirmed, onChanged: (v) => setState(() => _confirmed = v ?? false)),
                  const Expanded(child: Muted('I understand this is permanent.')),
                ],
              ),
            ],
            ?error,
            const SizedBox(height: 12),
            AppButton(
              label: 'Reset Semester',
              style: AppButtonStyle.red,
              size: AppButtonSize.full,
              loading: _busy && p != null,
              onPressed: !_confirmed || _busy || p == null ? null : _run,
            ),
            const SizedBox(height: 6),
            Center(
              child: LinkText('Back', color: Palette.gray400, onPressed: _busy ? null : () => setState(() => _step = _Step.name)),
            ),
          ],
        );
      case _Step.done:
        final r = _result!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: Heading('Reset Complete')),
            const SizedBox(height: 14),
            AppCard(
              padding: const EdgeInsets.all(14),
              child: Text(
                '${_plural(r.deletedRoles, 'role')} deleted\n${_plural(r.archivedUsers, 'user')} archived to "${r.batchName}"\n${_plural(r.updatedUsers, 'user')} kept, roles & points reset',
                style: TextStyle(fontSize: 14, height: 1.5, color: Palette.label(context)),
              ),
            ),
            const SizedBox(height: 16),
            AppButton(
              label: 'View Inactive Users',
              size: AppButtonSize.full,
              onPressed: () {
                final router = GoRouter.of(context);
                Navigator.pop(context);
                router.go('/admin/inactive/${r.batchId}');
              },
            ),
            const SizedBox(height: 6),
            Center(
              child: LinkText('Close', size: 12, color: Palette.gray400, onPressed: () => Navigator.pop(context)),
            ),
          ],
        );
    }
  }
}
