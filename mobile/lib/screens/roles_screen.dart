// pages/RolesSelectorPage.tsx + components/RoleJoinButton.tsx.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/glass_tab_bar.dart' show PingDot;
import '../widgets/page_scaffold.dart';

class RolesScreen extends StatefulWidget {
  const RolesScreen({super.key});

  @override
  State<RolesScreen> createState() => _RolesScreenState();
}

class _RolesScreenState extends State<RolesScreen> {
  final _newRole = TextEditingController();
  bool _creating = false;

  @override
  void dispose() {
    _newRole.dispose();
    super.dispose();
  }

  Future<void> _createRole(AppState app) async {
    final name = _newRole.text.trim();
    if (name.isEmpty) return;
    setState(() => _creating = true);
    try {
      await Db.createRole(name, app.admins);
      _newRole.clear();
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final uid = app.user!.uid;
    final roles = app.roles.where((r) => !r.isGlobal).toList();
    final todo = app.incompletePerRole;
    final attention = app.adminAttentionPerRole;

    return PageScaffold(
      title: 'Available Roles',
      subtitle: 'Select a role to join and start earning points.',
      spacing: 12,
      children: [
        if (roles.isEmpty)
          const EmptyState('No roles available at the moment.')
        else
          for (var i = 0; i < roles.length; i++)
            FadeSlideIn(
              key: ValueKey(roles[i].id),
              delay: stagger(i),
              dx: -30,
              offset: 0,
              child: _RoleRow(
                role: roles[i],
                uid: uid,
                isAdmin: app.isAdmin,
                isCurrent: app.userData?.currentRole == roles[i].id,
                todoCount: !app.isAdmin && (app.userData?.roles.any((r) => r.id == roles[i].id) ?? false) ? (todo[roles[i].id] ?? 0) : 0,
                needsAttention: app.isAdmin && (attention[roles[i].id] ?? 0) > 0,
              ),
            ),
        if (app.isAdmin)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.only(top: 24),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Palette.resolve(context, Palette.gray100))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Heading('Create a Role', size: 16),
                const SizedBox(height: 12),
                AppTextField(controller: _newRole, placeholder: 'Role name', maxLength: 32, onSubmitted: (_) => _createRole(app)),
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: AppButton(label: 'Create', size: AppButtonSize.sm, loading: _creating, onPressed: () => _createRole(app)),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _RoleRow extends StatelessWidget {
  const _RoleRow({
    required this.role,
    required this.uid,
    required this.isAdmin,
    required this.isCurrent,
    required this.todoCount,
    required this.needsAttention,
  });

  final Role role;
  final String uid;
  final bool isAdmin;
  final bool isCurrent;
  final int todoCount;
  final bool needsAttention;

  @override
  Widget build(BuildContext context) {
    final isMember = role.members.contains(uid);
    final requested = role.pendingRequests.contains(uid);
    void enter() => context.push('/roles/${role.id}');

    // RoleJoinButton.tsx
    final Widget action;
    if (isMember) {
      action = LinkText('Enter', bold: true, onPressed: enter);
    } else if (isAdmin) {
      action = LinkText('Join', onPressed: () => Db.joinAsAdmin(role, uid));
    } else if (requested) {
      action = Text('Requested', style: TextStyle(color: Palette.label(context)));
    } else {
      action = LinkText('Request to join', onPressed: () => Db.requestToJoin(role.id, uid));
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Pressable(
          scale: .98,
          onPressed: isMember ? enter : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: BoxDecoration(
              color: isCurrent ? Palette.resolve(context, Palette.blue50) : Palette.card(context),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isCurrent ? const Color(0xFF60A5FA) : Palette.separator(context)),
            ),
            child: Row(
              children: [
                // Takes all the leftover width, so the action always sits flush right
                Expanded(
                  child: Row(
                    children: [
                      if (isCurrent) ...[Icon(FontAwesomeIcons.star.data, size: 13, color: Palette.blue500), const SizedBox(width: 8)],
                      Flexible(
                        child: Text(
                          role.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                        ),
                      ),
                      if (needsAttention) ...[const SizedBox(width: 8), const PingDot(size: 10)],
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                action,
              ],
            ),
          ),
        ),
        if (todoCount > 0) Positioned(top: -8, right: -8, child: CountBadge(todoCount)),
      ],
    );
  }
}
