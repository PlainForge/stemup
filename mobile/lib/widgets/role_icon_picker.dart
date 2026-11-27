// components/RoleIconPicker.tsx: choosing a role's icon and color from the
// built-in set (nothing can be uploaded). Admins and the role's owner save it
// straight away; its other instructors send the owner a request (or admins,
// when the role has no owner).
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';
import 'dialogs.dart';
import 'role_icons.dart';

class RoleIconPicker extends StatefulWidget {
  const RoleIconPicker({super.key, required this.role});

  final Role role;

  @override
  State<RoleIconPicker> createState() => _RoleIconPickerState();
}

class _RoleIconPickerState extends State<RoleIconPicker> {
  late String _icon = roleLook(widget.role.icon, widget.role.iconColor).icon.key;
  late String _color = roleLook(widget.role.icon, widget.role.iconColor).color.key;
  StreamSubscription<List<StemRequest>>? _sub;
  StemRequest? _pending;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    if (!app.canChangeRole(widget.role)) {
      // An icon change this person already asked for
      _sub = Db.roleRequestsStream(widget.role.id).listen((list) {
        if (!mounted) return;
        setState(() => _pending = list.where((r) => r.type == RequestType.roleIcon && r.uid == app.user!.uid).firstOrNull);
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _save(AppState app, bool canChange, String approver) async {
    setState(() => _saving = true);
    try {
      if (canChange) {
        await Db.setRoleIcon(widget.role.id, _icon, _color);
        if (mounted) showToast(context, 'Icon updated');
      } else {
        await Db.requestRoleChange(RequestType.roleIcon, app.user!.uid, app.userData?.name ?? '', widget.role, {
          'icon': _icon,
          'iconColor': _color,
        });
        if (mounted) showToast(context, 'Sent to $approver');
      }
    } catch (_) {
      if (mounted) showToast(context, "That didn't go through. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final role = widget.role;
    final canChange = app.canChangeRole(role);
    final current = roleLook(role.icon, role.iconColor);
    final changed = _icon != current.icon.key || _color != current.color.key;
    final hex = roleLook(_icon, _color).color.color;
    final approver = role.owner.isNotEmpty ? "the role's owner" : 'an admin';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Preview
        AppCard(
          shadow: false,
          child: Row(
            children: [
              RoleIconBadge(icon: _icon, color: _color, size: 56, solid: true),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionLabel('Preview', size: 11, padding: EdgeInsets.zero),
                    Heading(role.name, size: 18),
                    const Muted('Shown on the Roles screen and at the top of this role.', size: 12),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Colors
        AppCard(
          shadow: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionLabel('Color', padding: EdgeInsets.zero),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final c in roleColors)
                    Pressable(
                      onPressed: () => setState(() => _color = c.key),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: c.color,
                          shape: BoxShape.circle,
                          border: Border.all(color: _color == c.key ? Palette.label(context) : const Color(0x00000000), width: 2.5),
                        ),
                        child: _color == c.key ? const Icon(CupertinoIcons.checkmark_alt, size: 18, color: Color(0xFFFFFFFF)) : null,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Icons, by group
        AppCard(
          shadow: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final g in roleIconGroups) ...[
                SectionLabel(g.title, padding: EdgeInsets.zero),
                const SizedBox(height: 10),
                LayoutBuilder(
                  builder: (context, box) {
                    const gap = 8.0;
                    const perRow = 6;
                    final cell = (box.maxWidth - gap * (perRow - 1)) / perRow;
                    return Wrap(
                      spacing: gap,
                      runSpacing: gap,
                      children: [
                        for (final o in g.icons)
                          Pressable(
                            onPressed: () => setState(() => _icon = o.key),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              width: cell,
                              height: cell,
                              decoration: BoxDecoration(
                                color: _icon == o.key ? hex : Palette.fill(context),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              alignment: Alignment.center,
                              child: Icon(
                                o.icon,
                                size: cell * .4,
                                color: _icon == o.key ? const Color(0xFFFFFFFF) : Palette.secondary(context),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
                if (g != roleIconGroups.last) const SizedBox(height: 18),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Save, or ask the owner
        AppCard(
          shadow: false,
          child: _pending != null
              ? Row(
                  children: [
                    Icon(CupertinoIcons.hourglass, size: 16, color: Palette.resolve(context, const Color(0xFFB45309))),
                    const SizedBox(width: 8),
                    Expanded(child: Muted('Your icon change is waiting for $approver.', size: 13)),
                    LinkText('Withdraw', size: 13, color: Palette.red500, onPressed: () => Db.deleteRequest(_pending!.id)),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!canChange) ...[
                      Muted("Only the role's owner, or an admin, changes its icon. Your choice is sent to $approver to approve.", size: 12),
                      const SizedBox(height: 10),
                    ],
                    AppButton(
                      label: canChange ? 'Save Icon' : 'Send Request',
                      style: AppButtonStyle.blue,
                      size: AppButtonSize.full,
                      loading: _saving,
                      onPressed: changed ? () => _save(app, canChange, approver) : null,
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}
