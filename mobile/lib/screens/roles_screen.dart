// pages/RolesSelectorPage.tsx + components/RoleJoinButton.tsx.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import '../widgets/glass_tab_bar.dart' show PingDot;
import '../widgets/page_scaffold.dart';
import '../widgets/role_icons.dart';

class RolesScreen extends StatefulWidget {
  const RolesScreen({super.key});

  @override
  State<RolesScreen> createState() => _RolesScreenState();
}

class _RolesScreenState extends State<RolesScreen> {
  final _newRole = TextEditingController();
  final _purpose = TextEditingController();
  bool _creating = false;
  StreamSubscription<List<StemRequest>>? _requestsSub;
  List<StemRequest> _myRoleRequests = const [];
  StreamSubscription<List<RoleInvite>>? _invitesSub;
  List<RoleInvite> _invites = const [];
  String? _answering;

  @override
  void initState() {
    super.initState();
    // The instructor's own role requests still waiting for an admin
    _requestsSub = Db.myRequestsStream(context.read<AppState>().user!.uid).listen((r) {
      if (mounted) setState(() => _myRoleRequests = r.where((x) => x.type == RequestType.createRole).toList());
    }, onError: (_) {});
    // Invitations to join a role, from its instructors or an admin
    _invitesSub = Db.myInvitesStream(context.read<AppState>().user!.uid).listen((i) {
      if (mounted) setState(() => _invites = i);
    }, onError: (_) {});
  }

  Future<void> _answer(RoleInvite inv, bool accept) async {
    setState(() => _answering = inv.id);
    try {
      await Db.respondToInvite(inv.roleId, accept: accept);
      if (!mounted) return;
      if (accept) {
        showToast(context, 'You joined ${inv.roleName}');
        context.push('/roles/${inv.roleId}');
      }
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      final message = e.code == 'internal' ? "Couldn't answer the invitation. Please try again." : (e.message ?? 'Something went wrong.');
      showToast(context, message, error: true);
    } catch (_) {
      if (mounted) showToast(context, "Couldn't answer the invitation. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _answering = null);
    }
  }

  Widget _invitesSection(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 12),
    padding: const EdgeInsets.only(top: 24),
    decoration: BoxDecoration(
      border: Border(top: BorderSide(color: Palette.resolve(context, Palette.gray100))),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Heading('Invitations', size: 16),
        const SizedBox(height: 2),
        Muted("You've been invited to join ${_invites.length == 1 ? 'this role' : 'these roles'}."),
        for (final inv in _invites) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Palette.resolve(context, Palette.blue50),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Palette.resolve(context, Palette.navActive).withValues(alpha: .35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(color: Palette.resolve(context, Palette.blue600), borderRadius: BorderRadius.circular(12)),
                      child: Icon(
                        inv.asInstructor ? FontAwesomeIcons.chalkboardUser.data : FontAwesomeIcons.envelopeOpenText.data,
                        size: 16,
                        color: const Color(0xFFFFFFFF),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            inv.roleName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                          ),
                          Muted(
                            '${inv.invitedByName.isEmpty ? 'An instructor' : inv.invitedByName} invited you as ${inv.asInstructor ? 'an instructor' : 'a member'}',
                            size: 13,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: AppButton(
                        label: 'Accept',
                        style: AppButtonStyle.green,
                        size: AppButtonSize.full,
                        loading: _answering == inv.id,
                        onPressed: () => _answer(inv, true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: AppButton(
                        label: 'Decline',
                        style: AppButtonStyle.gray,
                        size: AppButtonSize.full,
                        onPressed: _answering == inv.id ? null : () => _answer(inv, false),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ],
    ),
  );

  @override
  void dispose() {
    _newRole.dispose();
    _purpose.dispose();
    _requestsSub?.cancel();
    _invitesSub?.cancel();
    super.dispose();
  }

  // Admins create roles straight away; instructors send the name and purpose to an admin
  Future<void> _createRole(AppState app) async {
    final name = _newRole.text.trim();
    if (name.isEmpty) return;
    if (!app.isAdmin && _purpose.text.trim().isEmpty) {
      await alertDialog(context, title: 'Purpose needed', message: 'Please describe what this role is for, so an admin can review it.');
      return;
    }
    setState(() => _creating = true);
    try {
      if (app.isAdmin) {
        await Db.createRole(name);
        if (mounted) showToast(context, 'Created "$name"');
      } else {
        await Db.requestRoleCreation(app.user!.uid, app.userData?.name ?? '', name, _purpose.text);
        if (mounted) showToast(context, 'Sent "$name" to an admin for review');
      }
      _newRole.clear();
      _purpose.clear();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't send that. Please try again.", error: true);
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
                todoCount: !app.canManage(roles[i]) && (app.userData?.roles.any((r) => r.id == roles[i].id) ?? false)
                    ? (todo[roles[i].id] ?? 0)
                    : 0,
                needsAttention: (attention[roles[i].id] ?? 0) > 0,
              ),
            ),
        // Invitations, under the list and above creating a role
        if (_invites.isNotEmpty) _invitesSection(context),
        if (app.access != AccessLevel.user)
          Container(
            margin: const EdgeInsets.only(top: 12),
            padding: const EdgeInsets.only(top: 24),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Palette.resolve(context, Palette.gray100))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Heading(app.isAdmin ? 'Create a Role' : 'Request a New Role', size: 16),
                if (!app.isAdmin) ...[
                  const SizedBox(height: 4),
                  const Muted("An admin reviews it first. Once approved, you'll run the new role as its instructor."),
                ],
                const SizedBox(height: 12),
                AppTextField(
                  controller: _newRole,
                  placeholder: 'Role name',
                  maxLength: 32,
                  textInputAction: app.isAdmin ? TextInputAction.done : TextInputAction.next,
                ),
                const SizedBox(height: 12),
                // Admins create roles directly, so only instructors explain what a role is for
                if (!app.isAdmin) ...[
                  AppTextField(controller: _purpose, placeholder: 'What is this role for?', maxLines: 3, maxLength: 500),
                  const SizedBox(height: 12),
                ],
                Align(
                  alignment: Alignment.centerLeft,
                  child: AppButton(
                    label: app.isAdmin ? 'Create' : 'Send Request',
                    size: AppButtonSize.sm,
                    loading: _creating,
                    onPressed: () => _createRole(app),
                  ),
                ),
                if (!app.isAdmin && _myRoleRequests.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const SectionLabel('Waiting for an admin', size: 12, padding: EdgeInsets.only(bottom: 8)),
                  for (final r in _myRoleRequests)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Palette.fill(context),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Palette.separator(context)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              r.roleName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                            ),
                          ),
                          LinkText('Withdraw', size: 13, onPressed: () => Db.deleteRequest(r.id)),
                        ],
                      ),
                    ),
                ],
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
    // Admins and the role's instructors are in every member list but don't take part
    final app = context.watch<AppState>();
    final memberCount = role.members.where((m) => !app.isStaff(role, m)).length;
    final requested = role.pendingRequests.contains(uid);
    void enter() => context.push('/roles/${role.id}');

    final action = _JoinPill(role: role, uid: uid, isMember: isMember, isAdmin: isAdmin, requested: requested, onOpen: enter);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Pressable(
          scale: .98,
          onPressed: isMember ? enter : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: isCurrent ? Palette.resolve(context, Palette.blue50) : Palette.card(context),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: isCurrent ? const Color(0xFF60A5FA) : Palette.separator(context)),
            ),
            child: Row(
              children: [
                // The role's own icon; filled in, with a star, for your current role
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    RoleIconBadge.of(role, solid: isCurrent),
                    if (isCurrent)
                      Positioned(
                        top: -6,
                        right: -6,
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            color: const Color(0xFFFBBF24),
                            shape: BoxShape.circle,
                            border: Border.all(color: Palette.card(context), width: 2),
                          ),
                          child: Icon(FontAwesomeIcons.star.data, size: 8, color: const Color(0xFFFFFFFF)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 14),
                // Takes all the leftover width, so the action always sits flush right
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
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
                      const SizedBox(height: 2),
                      Text(
                        role.purpose.trim().isNotEmpty ? role.purpose.trim() : '$memberCount member${memberCount == 1 ? '' : 's'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13, color: Palette.secondary(context)),
                      ),
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

/// RoleJoinButton.tsx: Open for members, Join for admins, Request to Join for
/// everyone else, and Requested (tap to withdraw) while a request is waiting.
class _JoinPill extends StatefulWidget {
  const _JoinPill({
    required this.role,
    required this.uid,
    required this.isMember,
    required this.isAdmin,
    required this.requested,
    required this.onOpen,
  });

  final Role role;
  final String uid;
  final bool isMember;
  final bool isAdmin;
  final bool requested;
  final VoidCallback onOpen;

  @override
  State<_JoinPill> createState() => _JoinPillState();
}

class _JoinPillState extends State<_JoinPill> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (_) {
      if (mounted) showToast(context, "That didn't go through. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    final ok = await confirmDialog(
      context,
      title: 'Withdraw Request?',
      message: 'Withdraw your request to join ${widget.role.name}?',
      confirmLabel: 'Withdraw',
      destructive: true,
    );
    if (ok) await _run(() => Db.withdrawJoinRequest(widget.role.id, widget.uid));
  }

  Widget _pill(
    BuildContext context, {
    required String label,
    required IconData icon,
    required Color fg,
    required Color bg,
    Color? border,
    bool iconAfter = false,
    VoidCallback? onTap,
  }) {
    final iconWidget = _busy ? CupertinoActivityIndicator(radius: 6, color: fg) : Icon(icon, size: 11, color: fg);
    return Pressable(
      onPressed: _busy ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: border == null ? null : Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!iconAfter) ...[iconWidget, const SizedBox(width: 6)],
            Text(
              label,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg),
            ),
            if (iconAfter) ...[const SizedBox(width: 6), iconWidget],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final blue = Palette.resolve(context, Palette.blue600);
    const white = Color(0xFFFFFFFF);
    if (widget.isMember) {
      return _pill(
        context,
        label: 'Open',
        icon: FontAwesomeIcons.arrowRight.data,
        iconAfter: true,
        fg: Palette.resolve(context, Palette.navActive),
        bg: Palette.resolve(context, Palette.blue50),
        onTap: widget.onOpen,
      );
    }
    if (widget.isAdmin) {
      return _pill(
        context,
        label: _busy ? 'Joining...' : 'Join',
        icon: FontAwesomeIcons.plus.data,
        fg: white,
        bg: blue,
        onTap: () => _run(() => Db.joinAsAdmin(widget.role, widget.uid)),
      );
    }
    if (widget.requested) {
      const amber = Color(0xFFD97706);
      return _pill(
        context,
        label: 'Requested',
        icon: CupertinoIcons.hourglass,
        fg: Palette.resolve(context, amber),
        bg: amber.withValues(alpha: Palette.isDark(context) ? .18 : .1),
        border: amber.withValues(alpha: .35),
        onTap: _withdraw,
      );
    }
    return _pill(
      context,
      label: _busy ? 'Sending...' : 'Request to Join',
      icon: FontAwesomeIcons.paperPlane.data,
      fg: white,
      bg: blue,
      onTap: () => _run(() => Db.requestToJoin(widget.role.id, widget.uid)),
    );
  }
}
