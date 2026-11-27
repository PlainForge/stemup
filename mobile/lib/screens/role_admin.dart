// components/RoleAdmin.tsx: join requests, task assignment, the full task list
// with review actions, member stats, instructors, rewards and role config.
// Shown as the role page's Instructor tab for the role's instructors, and on
// the admin role screen (/admin/roles/:id) for admins.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/motion.dart';
import '../widgets/page_scaffold.dart' show BackPill;
import '../widgets/role_icon_picker.dart';
import '../widgets/role_icons.dart';
import '../widgets/date_field.dart';
import '../widgets/dialogs.dart';
import '../widgets/instructor_card.dart';
import '../widgets/sliding_tabs.dart';
import 'task_widgets.dart';

enum _AdminTab { requests, creation, tasks, members, instructors, rewards, config }

enum _TaskFilter { all, submitted, pending, done }

class RoleAdminView extends StatefulWidget {
  const RoleAdminView({super.key, required this.role, required this.members});

  final Role role;

  /// Members with this role's stats as points/taskCompleted.
  final List<UserData> members;

  @override
  State<RoleAdminView> createState() => _RoleAdminViewState();
}

class _RoleAdminViewState extends State<RoleAdminView> {
  final _subs = <StreamSubscription>[];
  StreamSubscription<List<UserData>>? _requestersSub;
  String _requestersKey = '';

  _AdminTab _tab = _AdminTab.requests;
  List<Task> _tasks = const [];
  List<SubmittedTask> _submitted = const [];
  List<UserData> _requesters = const [];

  /// Changes this role's instructors asked its owner for (a reset, a rename, ...).
  List<StemRequest> _roleRequests = const [];
  String? _busyRequest;
  final _filters = TaskFilters();
  _TaskFilter _taskFilter = _TaskFilter.all;

  Role get role => widget.role;

  @override
  void initState() {
    super.initState();
    _subs.addAll([
      Db.roleTasksStream(role.id).listen((t) => setState(() => _tasks = t)),
      Db.roleSubmittedStream(role.id).listen((s) => setState(() => _submitted = s)),
      Db.roleRequestsStream(
        role.id,
      ).listen((r) => setState(() => _roleRequests = r.where((x) => x.type?.isRoleChange == true).toList()), onError: (_) {}),
    ]);
    _syncRequesters();
  }

  @override
  void didUpdateWidget(RoleAdminView old) {
    super.didUpdateWidget(old);
    _syncRequesters();
  }

  void _syncRequesters() {
    final key = role.pendingRequests.join(',');
    if (key == _requestersKey) return;
    _requestersKey = key;
    _requestersSub?.cancel();
    _requestersSub = Db.usersStream(role.pendingRequests).listen((u) {
      if (mounted) setState(() => _requesters = u);
    });
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _requestersSub?.cancel();
    _filters.search.dispose();
    super.dispose();
  }

  /// Members who take part: admins and the role's instructors aren't given tasks or ranked.
  List<UserData> _nonAdmins(AppState app) => widget.members.where((m) => !app.isStaff(role, m.uid)).toList();

  /// Who approves the other instructors' change requests: the owner, or admins when there's none.
  String get _approver {
    final o = role.owner;
    if (o.isEmpty) return 'an admin';
    final n = widget.members.where((m) => m.uid == o).firstOrNull?.name ?? '';
    return n.isEmpty ? "the role's owner" : n;
  }

  Future<void> _approveRoleRequest(StemRequest r) async {
    if (r.type == RequestType.resetRole || r.type == RequestType.kickMember) {
      final reset = r.type == RequestType.resetRole;
      final ok = await confirmDialog(
        context,
        title: reset ? 'Approve Reset' : 'Approve Kick',
        message: reset
            ? 'Reset ${role.name}? Its leaderboard is saved as "${r.saveName}", then all tasks, prizes and members\' points in it are cleared.'
            : 'Remove ${r.targetName.isEmpty ? 'this member' : r.targetName} from ${role.name}? Their tasks in this role are deleted.',
        confirmLabel: reset ? 'Reset' : 'Kick',
        destructive: true,
      );
      if (!ok) return;
    }
    await _runRequest(r, () => Db.approveRequest(r), "Couldn't approve the request. Please try again.");
  }

  Future<void> _runRequest(StemRequest r, Future<void> Function() action, String failMessage) async {
    setState(() => _busyRequest = r.id);
    try {
      await action();
    } catch (_) {
      if (mounted) showToast(context, failMessage, error: true);
    } finally {
      if (mounted) setState(() => _busyRequest = null);
    }
  }

  SubmittedTask? _pendingFor(String taskId) {
    for (final s in _submitted) {
      if (s.id == taskId && !s.complete) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final me = app.user?.uid;
    // Requests the signed-in person can approve, and the ones they sent
    final toReview = app.canChangeRole(role) ? _roleRequests.where((r) => r.uid != me).toList() : <StemRequest>[];
    final mine = _roleRequests.where((r) => r.uid == me).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SlidingTabs<_AdminTab>(
          tabs: [
            SlidingTab(_AdminTab.requests, 'Requests', count: role.pendingRequests.length + toReview.length),
            const SlidingTab(_AdminTab.creation, 'Assign Task'),
            SlidingTab(_AdminTab.tasks, 'Tasks', count: _submitted.where((s) => !s.complete).length),
            const SlidingTab(_AdminTab.members, 'Members'),
            const SlidingTab(_AdminTab.instructors, 'Instructors'),
            const SlidingTab(_AdminTab.rewards, 'Rewards'),
            const SlidingTab(_AdminTab.config, 'Config'),
          ],
          selected: _tab,
          onChanged: (t) => setState(() => _tab = t),
        ),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          transitionBuilder: (child, a) => FadeTransition(
            opacity: a,
            child: SlideTransition(
              position: Tween(begin: const Offset(0, .02), end: Offset.zero).animate(a),
              child: child,
            ),
          ),
          layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [...previous, ?current]),
          child: KeyedSubtree(
            key: ValueKey(_tab),
            child: switch (_tab) {
              _AdminTab.requests => _requestsTab(context, toReview, mine),
              _AdminTab.creation => _AssignTaskForm(role: role, members: _nonAdmins(app)),
              _AdminTab.tasks => _tasksTab(context, app),
              _AdminTab.members => _membersTab(context, app),
              _AdminTab.instructors => _InstructorsTab(role: role),
              _AdminTab.rewards => _RewardsForm(role: role, approver: _approver),
              _AdminTab.config => _ConfigTab(role: role, approver: _approver, roleRequests: _roleRequests),
            },
          ),
        ),
      ],
    );
  }

  /// `bg-white border border-gray-100 rounded-2xl px-4 py-3` row that slides in from the left.
  Widget _personRow(int i, UserData u, {required Widget info, required List<Widget> actions, VoidCallback? onPressed}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: FadeSlideIn(
      key: ValueKey(u.uid),
      delay: stagger(i),
      dx: -10,
      offset: 0,
      child: _maybePressable(
        onPressed,
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shadow: false,
          child: Row(
            children: [
              Avatar(u.photoURL, name: u.name, size: Avatar.xs),
              const SizedBox(width: 12),
              Expanded(child: info),
              for (var j = 0; j < actions.length; j++) ...[if (j > 0) const SizedBox(width: 8), actions[j]],
            ],
          ),
        ),
      ),
    ),
  );

  Widget _maybePressable(VoidCallback? onPressed, Widget child) =>
      onPressed == null ? child : Pressable(scale: .98, onPressed: onPressed, child: child);

  // ── Requests ──

  Widget _requestsTab(BuildContext context, List<StemRequest> toReview, List<StemRequest> mine) {
    final list = _requesters.where((u) => role.pendingRequests.contains(u.uid)).toList();
    final changes = [...toReview, ...mine];
    if (list.isEmpty && changes.isEmpty) return const EmptyState('No pending requests.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Changes the role's other instructors asked for, for the owner (or an admin) to approve
        if (changes.isNotEmpty) ...[
          const SectionLabel('Instructor requests'),
          for (final r in changes) _roleRequestCard(context, r, mine: mine.contains(r)),
          const SizedBox(height: 4),
          const SectionLabel('Join requests'),
          if (list.isEmpty) const Muted('No pending join requests.', color: Palette.gray400),
        ],
        for (var i = 0; i < list.length; i++)
          _personRow(
            i,
            list[i],
            info: Text(
              list[i].name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
            ),
            actions: [
              AppButton(
                label: 'Accept',
                size: AppButtonSize.xsm,
                style: AppButtonStyle.green,
                onPressed: () => Db.acceptRequest(role, list[i].uid),
              ),
              AppButton(
                label: 'Decline',
                size: AppButtonSize.xsm,
                style: AppButtonStyle.red,
                onPressed: () => Db.declineRequest(role.id, list[i].uid),
              ),
            ],
          ),
      ],
    );
  }

  Widget _roleRequestCard(BuildContext context, StemRequest r, {required bool mine}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: FadeSlideIn(
      key: ValueKey(r.id),
      dx: -10,
      offset: 0,
      child: AppCard(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shadow: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              r.describe(mine: mine),
              style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
            ),
            if (r.type == RequestType.roleIcon) RoleIconChange(role: widget.role, request: r),
            if (r.createdAt != null) Muted(DateFormat('MMM d', 'en_US').format(r.createdAt!), size: 12, color: Palette.gray400),
            const SizedBox(height: 10),
            if (mine)
              Row(
                children: [
                  Expanded(
                    child: Text('Waiting for $_approver', style: const TextStyle(fontSize: 12, color: Palette.amber700)),
                  ),
                  AppButton(
                    label: 'Withdraw',
                    size: AppButtonSize.xsm,
                    style: AppButtonStyle.cancel,
                    onPressed: () => Db.deleteRequest(r.id),
                  ),
                ],
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  AppButton(
                    label: 'Approve',
                    size: AppButtonSize.xsm,
                    style: AppButtonStyle.green,
                    loading: _busyRequest == r.id,
                    onPressed: () => _approveRoleRequest(r),
                  ),
                  AppButton(
                    label: 'Decline',
                    size: AppButtonSize.xsm,
                    style: AppButtonStyle.red,
                    onPressed: _busyRequest == r.id
                        ? null
                        : () => _runRequest(r, () => Db.declineAccessRequest(r.id), "Couldn't decline the request."),
                  ),
                ],
              ),
          ],
        ),
      ),
    ),
  );

  // ── Tasks ──

  Widget _tasksTab(BuildContext context, AppState app) {
    final q = _filters.query;
    bool matches(String title, String name) => q.isEmpty || title.toLowerCase().contains(q) || name.toLowerCase().contains(q);

    final Widget list;
    if (_taskFilter == _TaskFilter.submitted) {
      final items = _filters.sorted(
        _submitted.where((s) => !s.complete && _filters.matchesMonth(s.submission) && matches(s.title, s.assignedName)),
        (s) => s.title,
        (s) => s.submission,
      );
      list = items.isEmpty
          ? const EmptyState('No pending submissions.')
          : Column(children: [for (final s in items) _cardWrap(s.id, _SubmissionCard(s: s))]);
    } else {
      final items = _filters.sorted(
        _tasks.where((t) {
          final pending = _pendingFor(t.id) != null;
          final ok = switch (_taskFilter) {
            _TaskFilter.all => true,
            _TaskFilter.done => t.complete,
            _TaskFilter.pending => !t.complete && !pending,
            _TaskFilter.submitted => !t.complete,
          };
          return ok && _filters.matchesMonth(t.createdOn) && matches(t.title, t.assignedName);
        }),
        (t) => t.title,
        (t) => t.createdOn,
      );
      list = items.isEmpty
          ? const EmptyState('No tasks to show.')
          : Column(
              children: [
                for (final t in items) _cardWrap(t.id, _AdminTaskCard(task: t, submission: _pendingFor(t.id), members: _nonAdmins(app))),
              ],
            );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TaskFilterBar(
          filters: _filters,
          onChanged: () => setState(() {}),
          searchHint: 'Search by title or assignee...',
          extra: ChipGroup<_TaskFilter>(
            options: const [
              (_TaskFilter.all, 'All'),
              (_TaskFilter.submitted, 'Submitted'),
              (_TaskFilter.pending, 'Pending'),
              (_TaskFilter.done, 'Done'),
            ],
            selected: _taskFilter,
            onChanged: (f) => setState(() => _taskFilter = f),
          ),
        ),
        const SizedBox(height: 12),
        list,
      ],
    );
  }

  Widget _cardWrap(String id, Widget child) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: FadeSlideIn(key: ValueKey(id), offset: 0, child: child),
  );

  // ── Members ──

  Widget _membersTab(BuildContext context, AppState app) {
    final list = _nonAdmins(app);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InviteSection(role: widget.role, asInstructor: false),
        const SizedBox(height: 16),
        if (list.isEmpty) const EmptyState('No members in this role.'),
        for (var i = 0; i < list.length; i++)
          _personRow(
            i,
            list[i],
            info: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  list[i].name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                ),
                Muted('${list[i].points} pts · ${list[i].taskCompleted} tasks', size: 12, color: Palette.gray400),
              ],
            ),
            actions: [Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300))],
            onPressed: () => context.push('${GoRouterState.of(context).uri.path}/members/${list[i].uid}'),
          ),
      ],
    );
  }
}

/// A white card with a caption, e.g. "ASSIGN TO" / "TASK DETAILS".
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.trailing, this.danger = false});

  final String title;
  final List<Widget> children;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) => AppCard(
    shadow: false,
    borderColor: null,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: SectionLabel(title, padding: EdgeInsets.zero, color: danger ? Palette.red400 : null),
            ),
            ?trailing,
          ],
        ),
        for (final c in children) ...[const SizedBox(height: 12), c],
      ],
    ),
  );
}

// ── Assign task ─────────────────────────────────────────────────────────

class _AssignTaskForm extends StatefulWidget {
  const _AssignTaskForm({required this.role, required this.members});

  final Role role;
  final List<UserData> members;

  @override
  State<_AssignTaskForm> createState() => _AssignTaskFormState();
}

class _AssignTaskFormState extends State<_AssignTaskForm> {
  final _selected = <String>[];
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _pts = TextEditingController();
  DateTime? _due;
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _pts.dispose();
    super.dispose();
  }

  Future<void> _addMember() async {
    final uid = await pickPerson(
      context,
      title: 'Select a member',
      emptyText: 'No members in this role yet.',
      chosen: _selected.toSet(),
      people: [for (final m in widget.members) (uid: m.uid, name: m.name, photoURL: m.photoURL, hint: '${m.points} pts')],
    );
    if (uid == null) return;
    setState(() => _selected.contains(uid) ? _selected.remove(uid) : _selected.add(uid));
  }

  Future<void> _assign() async {
    final pts = int.tryParse(_pts.text.trim());
    if (_title.text.trim().isEmpty || pts == null || pts < 0) return;
    if (_selected.isEmpty) {
      setState(() => _error = 'Please select at least one member.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await Db.assignTask(
        role: widget.role,
        members: widget.members.where((m) => _selected.contains(m.uid)).toList(),
        title: _title.text.trim(),
        description: _desc.text.trim(),
        points: pts,
        dueDay: _due,
        assignedBy: context.read<AppState>().user?.uid,
      );
      _title.clear();
      _desc.clear();
      _pts.clear();
      setState(() {
        _selected.clear();
        _due = null;
      });
      if (mounted) showToast(context, 'Task(s) created successfully');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final byId = {for (final m in widget.members) m.uid: m};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Assign to',
          trailing: LinkText(
            'Select all',
            size: 14,
            onPressed: () => setState(
              () => _selected
                ..clear()
                ..addAll(widget.members.map((m) => m.uid)),
            ),
          ),
          children: [
            PickerRow(value: 'Select a member', placeholder: true, onTap: _addMember),
            if (_selected.isNotEmpty) ...[
              Row(
                children: [
                  const Expanded(child: SectionLabel('Selected', size: 12, padding: EdgeInsets.zero)),
                  LinkText('Clear all', size: 14, onPressed: () => setState(_selected.clear)),
                ],
              ),
              for (final uid in _selected)
                if (byId[uid] != null)
                  FadeSlideIn(
                    key: ValueKey(uid),
                    offset: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Palette.fill(context),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Palette.separator(context)),
                      ),
                      child: Row(
                        children: [
                          Avatar(byId[uid]!.photoURL, name: byId[uid]!.name, size: Avatar.xxs),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              byId[uid]!.name,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                            ),
                          ),
                          LinkText('Remove', size: 14, onPressed: () => setState(() => _selected.remove(uid))),
                        ],
                      ),
                    ),
                  ),
            ],
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Task details',
          children: [
            AppTextField(controller: _title, placeholder: 'Title', textInputAction: TextInputAction.next),
            AppTextField(controller: _desc, placeholder: 'Description (optional)'),
            AppTextField(controller: _pts, placeholder: 'Points', keyboardType: TextInputType.number),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Muted('Due Date (optional)', size: 12, color: Palette.gray400),
                const SizedBox(height: 4),
                DateField(value: _due, onChanged: (d) => setState(() => _due = d)),
              ],
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(
                label: 'Assign Task',
                size: AppButtonSize.sm,
                style: AppButtonStyle.green,
                loading: _busy,
                onPressed: _assign,
              ),
            ),
            if (_error.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: Palette.red400, borderRadius: BorderRadius.circular(12)),
                child: Text(
                  _error,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Color(0xFFFFFFFF)),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// ── Task cards ──────────────────────────────────────────────────────────

class _SubmissionCard extends StatelessWidget {
  const _SubmissionCard({required this.s});

  final SubmittedTask s;

  @override
  Widget build(BuildContext context) => TaskCardFrame(
    borderColor: Palette.yellow200,
    children: [
      TaskTitleRow(title: s.title, points: s.points, truncate: false),
      Muted(s.description.isEmpty ? 'No description' : s.description),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              children: [
                const TextSpan(text: 'By '),
                TextSpan(
                  text: s.assignedName,
                  style: TextStyle(fontWeight: FontWeight.w700, color: Palette.resolve(context, const Color(0xFF4B5563))),
                ),
              ],
            ),
            style: TextStyle(fontSize: 12, color: Palette.tertiary(context)),
          ),
          Muted(s.submission == null ? 'N/A' : dateTimeLabel.format(s.submission!), size: 12, color: Palette.gray400),
        ],
      ),
      _ReviewButtons(s: s),
    ],
  );
}

class _ReviewButtons extends StatelessWidget {
  const _ReviewButtons({required this.s});

  final SubmittedTask s;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: AppButton(label: 'Approve', style: AppButtonStyle.green, size: AppButtonSize.full, onPressed: () => Db.approveSubmission(s)),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: AppButton(label: 'Decline', style: AppButtonStyle.red, size: AppButtonSize.full, onPressed: () => Db.declineSubmission(s)),
      ),
    ],
  );
}

enum _CardMode { view, edit, reassign }

class _AdminTaskCard extends StatefulWidget {
  const _AdminTaskCard({required this.task, required this.submission, required this.members});

  final Task task;
  final SubmittedTask? submission;
  final List<UserData> members;

  @override
  State<_AdminTaskCard> createState() => _AdminTaskCardState();
}

class _AdminTaskCardState extends State<_AdminTaskCard> {
  _CardMode _mode = _CardMode.view;
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _pts = TextEditingController();
  DateTime? _due;
  String? _reassignTo;

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    _pts.dispose();
    super.dispose();
  }

  void _startEdit() => setState(() {
    final t = widget.task;
    _title.text = t.title;
    _desc.text = t.description;
    _pts.text = '${t.points}';
    _due = t.dueDate;
    _mode = _CardMode.edit;
  });

  Future<void> _saveEdit() async {
    final title = _title.text.trim();
    final pts = int.tryParse(_pts.text.trim());
    if (title.isEmpty || pts == null || pts < 0 || widget.task.complete || widget.submission != null) return;
    await Db.editTask(widget.task, title: title, description: _desc.text.trim(), points: pts, dueDay: _due, hasPendingSubmission: false);
    if (mounted) setState(() => _mode = _CardMode.view);
  }

  Future<void> _reassign() async {
    final target = widget.members.where((m) => m.uid == _reassignTo).firstOrNull;
    if (target == null) return;
    await Db.reassignTask(widget.task.id, target);
    if (mounted) setState(() => _mode = _CardMode.view);
  }

  Future<void> _remove() async {
    final t = widget.task;
    final ok = await confirmDialog(
      context,
      title: 'Remove Task',
      message: 'Remove "${t.title}" assigned to ${t.assignedName}?${t.complete ? ' Points already awarded stay with the member.' : ''}',
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (ok) await Db.removeTask(t.id);
  }

  Widget _row(List<Widget> buttons) => Row(
    children: [
      for (var i = 0; i < buttons.length; i++) ...[if (i > 0) const SizedBox(width: 8), Expanded(child: buttons[i])],
    ],
  );

  @override
  Widget build(BuildContext context) {
    final t = widget.task;
    final sub = widget.submission;
    final overdue = t.isOverdue;
    final daysLeft = t.daysUntilDeletion;
    final divider = Container(height: 1, color: Palette.resolve(context, Palette.gray100));

    return TaskCardFrame(
      borderColor: t.complete
          ? const Color(0xFF86EFAC)
          : overdue
          ? const Color(0xFFFCA5A5)
          : sub != null
          ? Palette.yellow200
          : null,
      children: [
        TaskTitleRow(title: t.title, points: t.points, truncate: false),
        Muted(t.description.isEmpty ? 'No description' : t.description),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 6,
          children: [
            Muted(t.assignedName, size: 12, color: Palette.gray400),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                if (overdue && sub == null) const Tag('Overdue', color: Palette.red600),
                if (t.extensionRequested) const Tag('Extension Requested', color: Palette.yellow700),
                if (t.extensionDeclined) const Tag('Extension Declined', color: Color(0xFF6B7280)),
                if (t.declineCount > 0) Tag('Declined ${t.declineCount}×${t.declineCount == 3 ? ' · Closed' : ''}', color: Palette.red600),
                if (t.status != null && !t.complete && sub == null)
                  Tag(t.status!.label, color: t.status == TaskStatus.inProgress ? Palette.blue700 : Palette.orange700),
                Tag(
                  t.complete
                      ? 'Done'
                      : sub != null
                      ? 'Submitted'
                      : 'Pending',
                  color: t.complete
                      ? Palette.green700
                      : sub != null
                      ? Palette.yellow700
                      : const Color(0xFF6B7280),
                ),
              ],
            ),
          ],
        ),
        if (t.dueDate != null && !t.complete)
          Muted(
            'Due: ${dayLabel.format(t.dueDate!)}'
            '${overdue && sub == null && daysLeft != null ? ' · ${daysLeft > 0 ? 'Deletes in ${daysLeft}d' : 'Deleting soon'}' : ''}',
            size: 12,
            color: overdue && sub == null ? Palette.red400 : Palette.gray400,
          ),
        if (sub?.submission != null)
          Muted('Submitted: ${dateTimeLabel.format(sub!.submission!)}', size: 12, color: const Color(0xFFCA8A04)),
        if (t.createdOn != null) Muted(dateTimeLabel.format(t.createdOn!), size: 12, color: Palette.gray300),
        if (t.extensionRequested)
          _row([
            AppButton(
              label: 'Accept Extension',
              style: AppButtonStyle.green,
              size: AppButtonSize.full,
              onPressed: () => Db.acceptExtension(t),
            ),
            AppButton(
              label: 'Decline Extension',
              style: AppButtonStyle.red,
              size: AppButtonSize.full,
              onPressed: () => Db.declineExtension(t.id),
            ),
          ]),
        if (sub != null) _ReviewButtons(s: sub),
        divider,
        AnimatedSize(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: switch (_mode) {
            _CardMode.edit => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppTextField(controller: _title, placeholder: 'Title'),
                const SizedBox(height: 8),
                AppTextField(controller: _desc, placeholder: 'Description (optional)', maxLines: 2),
                const SizedBox(height: 8),
                Row(
                  children: [
                    SizedBox(
                      width: 90,
                      child: AppTextField(controller: _pts, placeholder: '0', keyboardType: TextInputType.number),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: DateField(value: _due, onChanged: (d) => setState(() => _due = d)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _row([
                  AppButton(label: 'Save', style: AppButtonStyle.blue, size: AppButtonSize.full, onPressed: _saveEdit),
                  AppButton(
                    label: 'Cancel',
                    style: AppButtonStyle.cancel,
                    size: AppButtonSize.full,
                    onPressed: () => setState(() => _mode = _CardMode.view),
                  ),
                ]),
              ],
            ),
            _CardMode.reassign => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PickerRow(
                  value: widget.members.where((m) => m.uid == _reassignTo).firstOrNull?.name ?? 'Reassign to…',
                  placeholder: _reassignTo == null,
                  onTap: () async {
                    final uid = await pickPerson(
                      context,
                      title: 'Reassign to…',
                      emptyText: 'No one else in this role.',
                      chosen: {?_reassignTo},
                      people: [
                        for (final m in widget.members.where((m) => m.uid != t.assignedTo))
                          (uid: m.uid, name: m.name, photoURL: m.photoURL, hint: null),
                      ],
                    );
                    if (uid != null) setState(() => _reassignTo = uid);
                  },
                ),
                const SizedBox(height: 8),
                _row([
                  AppButton(
                    label: 'Reassign',
                    style: AppButtonStyle.blue,
                    size: AppButtonSize.full,
                    onPressed: _reassignTo == null ? null : _reassign,
                  ),
                  AppButton(
                    label: 'Cancel',
                    style: AppButtonStyle.cancel,
                    size: AppButtonSize.full,
                    onPressed: () => setState(() {
                      _mode = _CardMode.view;
                      _reassignTo = null;
                    }),
                  ),
                ]),
              ],
            ),
            _CardMode.view => _row([
              if (!t.complete && sub == null)
                AppButton(label: 'Edit', style: AppButtonStyle.blue, size: AppButtonSize.full, onPressed: _startEdit),
              if (!t.complete && sub == null)
                AppButton(
                  label: 'Reassign',
                  style: AppButtonStyle.gray,
                  size: AppButtonSize.full,
                  onPressed: () => setState(() {
                    _mode = _CardMode.reassign;
                    _reassignTo = null;
                  }),
                ),
              AppButton(label: 'Remove', style: AppButtonStyle.red, size: AppButtonSize.full, onPressed: _remove),
            ]),
          },
        ),
      ],
    );
  }
}

// ── Members ─────────────────────────────────────────────────────────────

/// Edits a member's stats in one role (opened from their member page).
class EditMemberCard extends StatefulWidget {
  const EditMemberCard({super.key, required this.member, required this.role});

  final UserData member;
  final Role role;

  @override
  State<EditMemberCard> createState() => EditMemberCardState();
}

class EditMemberCardState extends State<EditMemberCard> {
  late final _points = TextEditingController(text: '${widget.member.points}');
  late final _tasks = TextEditingController(text: '${widget.member.taskCompleted}');
  UserData? _global;

  @override
  void initState() {
    super.initState();
    // [member] carries role stats; load the global totals for the impact preview
    Db.getUsers([widget.member.uid]).then((u) {
      if (mounted && u.isNotEmpty) setState(() => _global = u.first);
    });
    _points.addListener(() => setState(() {}));
    _tasks.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _points.dispose();
    _tasks.dispose();
    super.dispose();
  }

  int _read(TextEditingController c) => (int.tryParse(c.text.trim()) ?? 0).clamp(0, 1 << 31);

  Future<void> _save(bool alsoGlobal) async {
    final app = context.read<AppState>();
    final role = widget.role;
    // Instructors who don't own the role ask the owner (or an admin, when it has none)
    if (!app.canChangeRole(role)) {
      try {
        await Db.requestRoleChange(RequestType.editStats, app.user!.uid, app.userData?.name ?? '', role, {
          'targetUid': widget.member.uid,
          'targetName': widget.member.name,
          'points': _read(_points),
          'taskCompleted': _read(_tasks),
        });
        if (!mounted) return;
        Navigator.pop(context);
        showToast(context, 'Sent to ${role.owner.isEmpty ? 'an admin' : "the role's owner"} to approve.');
      } catch (_) {
        if (mounted) showToast(context, "Couldn't send the request. Please try again.", error: true);
      }
      return;
    }
    await Db.setMemberRoleStats(widget.member.uid, role.id, points: _read(_points), tasks: _read(_tasks), alsoGlobal: alsoGlobal);
    if (mounted) Navigator.pop(context);
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

  @override
  Widget build(BuildContext context) {
    final m = widget.member;
    final dp = _read(_points) - m.points;
    final dt = _read(_tasks) - m.taskCompleted;
    // Only admins change global totals; instructors edit this role's stats only
    final app = context.watch<AppState>();
    final isAdmin = app.isAdmin;
    final canChange = app.canChangeRole(widget.role);
    final g = isAdmin ? _global : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Avatar(m.photoURL, name: m.name, size: Avatar.xs),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    m.name,
                    style: TextStyle(fontWeight: FontWeight.w600, color: Palette.label(context)),
                  ),
                  Muted(
                    g == null ? 'Role stats' : 'Role stats · Global: ${g.points} pts, ${g.taskCompleted} tasks',
                    size: 12,
                    color: Palette.gray400,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Row(children: [_field('Points', _points), const SizedBox(width: 16), _field('Tasks Completed', _tasks)]),
        if ((dp != 0 || dt != 0) && g != null) ...[
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Palette.amber50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFDE68A)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Global impact if saved with global:',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.amber700),
                ),
                Text(
                  'Points: ${g.points} to ${(g.points + dp).clamp(0, 1 << 31)} · Tasks: ${g.taskCompleted} to ${(g.taskCompleted + dt).clamp(0, 1 << 31)}',
                  style: const TextStyle(fontSize: 12, color: Palette.amber700),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        AppButton(
          label: isAdmin
              ? 'Save to Role Only'
              : canChange
              ? 'Save'
              : 'Send Request',
          size: AppButtonSize.full,
          onPressed: () => _save(false),
        ),
        if (isAdmin) ...[
          const SizedBox(height: 8),
          AppButton(label: 'Save to Role + Global', style: AppButtonStyle.gray, size: AppButtonSize.full, onPressed: () => _save(true)),
        ],
        const SizedBox(height: 4),
        Center(
          child: LinkText('Cancel', size: 12, color: Palette.gray400, onPressed: () => Navigator.pop(context)),
        ),
      ],
    );
  }
}

// ── Rewards & config ────────────────────────────────────────────────────

class _RewardsForm extends StatefulWidget {
  const _RewardsForm({required this.role, required this.approver});

  final Role role;

  /// Who approves the title when this person can't change it directly.
  final String approver;

  @override
  State<_RewardsForm> createState() => _RewardsFormState();
}

class _RewardsFormState extends State<_RewardsForm> {
  final _fields = List.generate(3, (_) => TextEditingController());
  late final _title = TextEditingController(text: widget.role.rewardsTitle);

  @override
  void dispose() {
    for (final f in _fields) {
      f.dispose();
    }
    _title.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_fields.any((f) => f.text.trim().isEmpty)) return;
    await Db.setRewards(widget.role.id, _fields[0].text.trim(), _fields[1].text.trim(), _fields[2].text.trim());
    for (final f in _fields) {
      f.clear();
    }
    if (mounted) showToast(context, 'Rewards updated successfully');
  }

  Future<void> _saveTitle() async {
    final app = context.read<AppState>();
    if (app.canChangeRole(widget.role)) {
      await Db.setRewardsTitle(widget.role.id, _title.text);
      if (mounted) showToast(context, _title.text.trim().isEmpty ? 'Title reset to the current month' : 'Title updated');
      return;
    }
    try {
      await Db.requestRoleChange(RequestType.rewardsTitle, app.user!.uid, app.userData?.name ?? '', widget.role, {
        'title': _title.text.trim(),
      });
      _title.text = widget.role.rewardsTitle;
      if (mounted) showToast(context, 'Title change requested. ${_cap(widget.approver)} will review it.');
    } catch (_) {
      if (mounted) showToast(context, "Couldn't send the request. Please try again.", error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canChange = context.watch<AppState>().canChangeRole(widget.role);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Rewards title',
          children: [
            Muted(
              'The heading on the Rewards tab. Leave it empty to show the current month.'
              '${canChange ? '' : ' ${_cap(widget.approver)} has to approve a new title.'}',
            ),
            AppTextField(
              controller: _title,
              placeholder: '${DateFormat('MMMM', 'en_US').format(DateTime.now())} Rewards',
              maxLength: 48,
              onSubmitted: (_) => _saveTitle(),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(label: canChange ? 'Save Title' : 'Request Title Change', size: AppButtonSize.sm, onPressed: _saveTitle),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Set rewards',
          children: [
            for (var i = 0; i < 3; i++)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      MedalIcon(i, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        ['1st Place', '2nd Place', '3rd Place'][i],
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Palette.resolve(context, const Color(0xFF4B5563)),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  AppTextField(controller: _fields[i], placeholder: 'Reward description'),
                ],
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(label: 'Save Rewards', size: AppButtonSize.sm, onPressed: _save),
            ),
          ],
        ),
      ],
    );
  }
}

String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

/// Amber "waiting for approval" box (`bg-amber-50 border-amber-200`), with an optional action.
class PendingNotice extends StatelessWidget {
  const PendingNotice(this.text, {super.key, this.actionLabel, this.onAction});

  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: Palette.amber50,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFDE68A)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(text, style: const TextStyle(fontSize: 14, color: Palette.amber700)),
        ),
        if (actionLabel != null && onAction != null) ...[
          const SizedBox(width: 8),
          AppButton(label: actionLabel!, size: AppButtonSize.xsm, style: AppButtonStyle.cancel, onPressed: onAction),
        ],
      ],
    ),
  );
}

// ── Instructors ─────────────────────────────────────────────────────────

class _InstructorsTab extends StatefulWidget {
  const _InstructorsTab({required this.role});

  final Role role;

  @override
  State<_InstructorsTab> createState() => _InstructorsTabState();
}

class _InstructorsTabState extends State<_InstructorsTab> {
  StreamSubscription<List<UserData>>? _sub;
  String _key = '';
  List<UserData> _people = const [];

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  /// Profiles for the role's instructors and everyone who could be added.
  void _sync(AppState app) {
    final uids = {...widget.role.instructors, ...app.instructors}.toList()..sort();
    final key = uids.join(',');
    if (key == _key) return;
    _key = key;
    _sub?.cancel();
    _sub = Db.usersStream(uids).listen((u) {
      if (mounted) setState(() => _people = u);
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    _sync(app);
    final role = widget.role;
    final byId = {for (final p in _people) p.uid: p};
    // Any Instructor who doesn't run this role yet, whether or not they're in it
    final invitable = _people
        .where((p) => app.instructors.contains(p.uid) && !role.instructors.contains(p.uid) && !app.admins.contains(p.uid))
        .toList();
    final me = app.user!.uid;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Running this role',
          children: [
            const Muted(
              "Instructors here can give, edit and review tasks, accept members and set prizes. The role's owner can also rename or reset it, "
              "edit members' stats, kick members and change the rewards title; other instructors send the owner a request for those. "
              'Admins can always run every role.',
            ),
            Muted(
              app.isAdmin
                  ? (role.owner.isNotEmpty
                        ? 'Open an instructor to make them the owner or take them off this role.'
                        : "This role has no owner, so its instructors' change requests come to admins. Open an instructor to make them the owner.")
                  : role.owner == me
                  ? 'Open an instructor to hand the role on to them or take them off it.'
                  : "Only the role's owner, or an admin, can remove other instructors. To step down yourself, ask an admin. Open anyone to see their stats.",
              size: 12,
              color: Palette.gray400,
            ),
            if (role.instructors.isEmpty) const Muted('No instructors yet.', color: Palette.gray400),
            for (final uid in role.instructors)
              Pressable(
                scale: .98,
                onPressed: () => showInstructorCard(context, uid, role: role),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Palette.fill(context),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Palette.separator(context)),
                  ),
                  child: Row(
                    children: [
                      Avatar(byId[uid]?.photoURL ?? '', name: byId[uid]?.name ?? '', size: Avatar.xxs),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${byId[uid]?.name ?? 'Loading...'}${uid == me ? ' (you)' : ''}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                            ),
                            Muted(
                              '${role.owner == uid ? 'Owner' : 'Instructor'}'
                              '${app.instructors.contains(uid) ? '' : ' · No longer an Instructor'}',
                              size: 12,
                              color: role.owner == uid ? const Color(0xFF9333EA) : Palette.gray400,
                            ),
                          ],
                        ),
                      ),
                      Icon(FontAwesomeIcons.chevronRight.data, size: 14, color: Palette.resolve(context, Palette.gray300)),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        _InviteSection(role: role, asInstructor: true, people: invitable),
      ],
    );
  }
}

/// Invites people to the role (as members, or Instructors as its instructors)
/// and lists the invitations still waiting for a reply.
class _InviteSection extends StatefulWidget {
  const _InviteSection({required this.role, required this.asInstructor, this.people});

  final Role role;
  final bool asInstructor;

  /// Who can be invited; when null, every active user who isn't in the role yet.
  final List<UserData>? people;

  @override
  State<_InviteSection> createState() => _InviteSectionState();
}

class _InviteSectionState extends State<_InviteSection> {
  late final Stream<List<RoleInvite>> _invites = Db.roleInvitesStream(widget.role.id);
  StreamSubscription<List<UserData>>? _usersSub;
  List<UserData> _allUsers = const [];
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    if (widget.people == null) {
      _usersSub = Db.allUsersStream().listen((u) {
        if (mounted) setState(() => _allUsers = u.where((x) => x.isInGlobal).toList());
      }, onError: (_) {});
    }
  }

  @override
  void dispose() {
    _usersSub?.cancel();
    super.dispose();
  }

  Future<void> _invite(AppState app, List<UserData> candidates) async {
    final uid = await pickPerson(
      context,
      title: widget.asInstructor ? 'Invite an instructor' : 'Invite to ${widget.role.name}',
      emptyText: widget.asInstructor
          ? 'Every Instructor already runs this role or has been invited.'
          : 'Everyone is already in this role or invited.',
      people: [for (final p in candidates) (uid: p.uid, name: p.name, photoURL: p.photoURL, hint: null)],
    );
    if (uid == null || !mounted) return;
    final person = candidates.firstWhere((p) => p.uid == uid);
    setState(() => _sending = true);
    try {
      await Db.sendInvite(widget.role, person, asInstructor: widget.asInstructor, from: app.userData!);
      if (mounted) showToast(context, 'Invitation sent to ${person.name}');
    } catch (_) {
      if (mounted) showToast(context, "Couldn't send the invitation. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _withdraw(RoleInvite inv) async {
    final ok = await confirmDialog(
      context,
      title: 'Cancel Invitation?',
      message: 'Withdraw ${inv.userName.isEmpty ? 'their' : "${inv.userName}'s"} invitation to ${widget.role.name}?',
      confirmLabel: 'Withdraw',
      destructive: true,
    );
    if (ok) await Db.cancelInvite(widget.role.id, inv.uid).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final role = widget.role;
    return StreamBuilder<List<RoleInvite>>(
      stream: _invites,
      builder: (context, snap) {
        final all = snap.data ?? const <RoleInvite>[];
        final invited = {for (final i in all) i.uid};
        final mine = all.where((i) => i.asInstructor == widget.asInstructor).toList();
        final candidates =
            (widget.people ?? _allUsers.where((u) => !role.members.contains(u.uid) && !app.admins.contains(u.uid)).toList())
                .where((p) => !invited.contains(p.uid))
                .toList()
              ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
        final photos = {
          for (final p in [...?widget.people, ..._allUsers]) p.uid: p.photoURL,
        };

        return _Section(
          title: widget.asInstructor ? 'Invite an instructor' : 'Invite someone',
          children: [
            Muted(
              widget.asInstructor
                  ? "Any Instructor can be invited to help run this role, whether or not they're in it. They join once they accept."
                  : "They'll find the invitation on their Roles screen and can accept or decline it.",
            ),
            PickerRow(
              value: _sending ? 'Sending...' : (widget.asInstructor ? 'Select an instructor' : 'Select someone to invite'),
              placeholder: true,
              onTap: () {
                if (!_sending) _invite(app, candidates);
              },
            ),
            if (mine.isNotEmpty) ...[
              const SectionLabel('Waiting for a reply', padding: EdgeInsets.zero),
              for (final inv in mine)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Palette.fill(context),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Palette.separator(context)),
                  ),
                  child: Row(
                    children: [
                      Avatar(photos[inv.uid] ?? '', name: inv.userName, size: Avatar.xxs),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              inv.userName.isEmpty ? 'Someone' : inv.userName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                            ),
                            Muted(
                              'Invited by ${inv.invitedBy == app.user!.uid ? 'you' : (inv.invitedByName.isEmpty ? 'an instructor' : inv.invitedByName)}',
                              size: 12,
                              color: Palette.gray400,
                            ),
                          ],
                        ),
                      ),
                      LinkText('Withdraw', size: 13, color: Palette.red500, onPressed: () => _withdraw(inv)),
                    ],
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}

class _ConfigTab extends StatefulWidget {
  const _ConfigTab({required this.role, required this.approver, required this.roleRequests});

  final Role role;

  /// Who approves renames and resets when this person can't make them directly.
  final String approver;

  /// The role's open change requests.
  final List<StemRequest> roleRequests;

  @override
  State<_ConfigTab> createState() => _ConfigTabState();
}

/// The Config tab's categories, each with its own page (like Settings).
enum _ConfigPage { general, icon, privacy, reset, delete }

class _ConfigTabState extends State<_ConfigTab> {
  final _name = TextEditingController();
  bool _resetting = false;

  /// The open category, or null for the list.
  _ConfigPage? _open;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _rename() async {
    final n = _name.text.trim();
    if (n.isEmpty) return;
    final app = context.read<AppState>();
    try {
      if (app.canChangeRole(widget.role)) {
        await Db.renameRole(widget.role.id, n);
        if (mounted) showToast(context, 'Role name updated successfully');
      } else {
        await Db.requestRoleChange(RequestType.renameRole, app.user!.uid, app.userData?.name ?? '', widget.role, {'newName': n});
        if (mounted) showToast(context, 'Rename requested. ${_cap(widget.approver)} will review it.');
      }
      _name.clear();
    } catch (_) {
      if (mounted) showToast(context, "Couldn't save that. Please try again.", error: true);
    }
  }

  // Admins and the role's owner reset straight away; its other instructors ask the owner
  Future<void> _reset() async {
    final app = context.read<AppState>();
    final canChange = app.canChangeRole(widget.role);
    final saveName = await promptText(
      context,
      title: canChange ? 'Reset Role' : 'Request Reset',
      message: canChange
          ? "Every member's points and tasks completed in this role are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes."
          : "Name this save. ${_cap(widget.approver)} will review the reset; once approved, every member's points and tasks completed are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes.",
      placeholder: 'e.g. ${DateFormat('MMMM y', 'en_US').format(DateTime.now())}',
      confirmLabel: canChange ? 'Reset' : 'Send Request',
      destructive: canChange,
    );
    if (saveName == null || !mounted) return;
    if (saveName.trim().isEmpty) {
      await alertDialog(context, title: 'Name needed', message: 'Please enter a name for the saved data.');
      return;
    }
    setState(() => _resetting = true);
    try {
      if (canChange) {
        await Db.resetRole(widget.role.id, saveName.trim());
        if (mounted) showToast(context, 'Role reset. Its data is on the Saved Data tab.');
      } else {
        await Db.requestRoleReset(app.user!.uid, app.userData?.name ?? '', widget.role, saveName);
        if (mounted) showToast(context, 'Reset requested. ${_cap(widget.approver)} will review it.');
      }
    } catch (_) {
      if (mounted) showToast(context, "Couldn't reset the role. Please try again.", error: true);
    } finally {
      if (mounted) setState(() => _resetting = false);
    }
  }

  Future<void> _delete() async {
    final router = GoRouter.of(context);
    final ok = await confirmDialog(
      context,
      title: 'Delete Role',
      message: 'Are you sure you want to delete this role? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    router.go('/admin');
    await Db.deleteRole(widget.role.id);
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final isAdmin = app.isAdmin;
    final canChange = app.canChangeRole(widget.role);
    final me = app.user?.uid;
    final on = widget.role.showInGlobalLeaderboard;
    // Your own reset request, or (for instructors who'd have to ask) one another instructor already sent
    final resets = widget.roleRequests.where((r) => r.type == RequestType.resetRole);
    final pending = resets.where((r) => r.uid == me).firstOrNull ?? (canChange ? null : resets.firstOrNull);
    final role = widget.role;
    final sections = <({_ConfigPage key, String label, String hint, IconData icon, bool danger})>[
      (
        key: _ConfigPage.general,
        label: 'General',
        hint: 'Name and global leaderboard (${on ? 'on' : 'off'})',
        icon: FontAwesomeIcons.pen.data,
        danger: false,
      ),
      (
        key: _ConfigPage.icon,
        label: 'Icon',
        hint: "The icon and color on the Roles screen and this role's page",
        icon: FontAwesomeIcons.palette.data,
        danger: false,
      ),
      // Only the owner and admins decide who can find the role
      if (canChange)
        (
          key: _ConfigPage.privacy,
          label: 'Privacy',
          hint: role.inviteOnly ? 'Invite only: hidden from the Roles screen' : 'Public: anyone can find it and ask to join',
          icon: FontAwesomeIcons.lock.data,
          danger: false,
        ),
      (
        key: _ConfigPage.reset,
        label: 'Reset Role',
        hint: pending != null ? 'Reset waiting for ${widget.approver}' : 'Save the leaderboard and start fresh',
        icon: FontAwesomeIcons.rotate.data,
        danger: false,
      ),
      if (isAdmin)
        (
          key: _ConfigPage.delete,
          label: 'Delete Role',
          hint: 'Permanently delete this role and its data',
          icon: FontAwesomeIcons.trash.data,
          danger: true,
        ),
    ];
    final open = sections.where((x) => x.key == _open).firstOrNull;

    // The list and each page slide between each other: pages come in from the right, the list from the left
    return AnimatedSwitcher(
      duration: motionDuration(context, const Duration(milliseconds: 260)),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (current, previous) => Stack(alignment: Alignment.topCenter, children: [...previous, ?current]),
      transitionBuilder: (child, a) {
        final fromLeft = child.key == const ValueKey('config-list');
        return FadeTransition(
          opacity: a,
          child: SlideTransition(
            position: Tween(begin: Offset(fromLeft ? -.12 : .12, 0), end: Offset.zero).animate(a),
            child: child,
          ),
        );
      },
      child: open == null
          ? Column(
              key: const ValueKey('config-list'),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final sec in sections)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Pressable(
                      scale: .98,
                      onPressed: () => setState(() => _open = sec.key),
                      child: AppCard(
                        shadow: false,
                        borderColor: sec.danger ? const Color(0xFFFECACA) : null,
                        child: Row(
                          children: [
                            if (sec.key == _ConfigPage.icon)
                              RoleIconBadge.of(role)
                            else
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: sec.danger ? Palette.red500.withValues(alpha: .12) : Palette.resolve(context, Palette.blue50),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(
                                  sec.icon,
                                  size: 16,
                                  color: sec.danger ? Palette.red500 : Palette.resolve(context, Palette.navActive),
                                ),
                              ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    sec.label,
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: sec.danger ? Palette.red500 : Palette.label(context),
                                    ),
                                  ),
                                  Muted(sec.hint, size: 13, maxLines: 1),
                                ],
                              ),
                            ),
                            Icon(CupertinoIcons.chevron_right, size: 16, color: Palette.tertiary(context)),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            )
          : Column(
              key: ValueKey(open.key),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                BackPill(label: 'Config', onPressed: () => setState(() => _open = null)),
                const SizedBox(height: 12),
                Text(
                  open.label,
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: open.danger ? Palette.red500 : Palette.label(context)),
                ),
                const SizedBox(height: 12),
                SizedBox(width: double.infinity, child: _page(context, open.key, canChange, on, pending, me)),
              ],
            ),
    );
  }

  Widget _page(BuildContext context, _ConfigPage page, bool canChange, bool on, StemRequest? pending, String? me) => switch (page) {
    _ConfigPage.icon => RoleIconPicker(role: widget.role),
    // The role's name and whether its members see the global leaderboard, on one page
    _ConfigPage.general => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Rename role',
          children: [
            Muted('Currently ${widget.role.name}.${canChange ? '' : ' ${_cap(widget.approver)} has to approve a new name.'}'),
            AppTextField(controller: _name, placeholder: 'New role name', onSubmitted: (_) => _rename()),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(label: canChange ? 'Save Name' : 'Request Rename', size: AppButtonSize.sm, onPressed: _rename),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const SectionLabel('Global Leaderboard', padding: EdgeInsets.fromLTRB(4, 0, 4, 8)),
        AppCard(
          shadow: false,
          child: SwitchRow(
            label: 'Show the global leaderboard',
            hint: 'When on, every member of this role can see the global leaderboard on the Home screen.',
            value: on,
            onChanged: (v) => Db.setShowInGlobal(widget.role.id, v),
          ),
        ),
      ],
    ),
    _ConfigPage.privacy => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          shadow: false,
          child: SwitchRow(
            label: 'Invite only',
            hint:
                "When on, ${widget.role.name} is hidden from the Roles screen for anyone who isn't in it, and nobody can ask to join. "
                'People join only when an instructor or admin invites them from the Members tab.',
            value: widget.role.inviteOnly,
            onChanged: (v) async {
              try {
                await Db.setInviteOnly(widget.role.id, v);
              } catch (_) {
                if (context.mounted) showToast(context, "Couldn't change that. Please try again.", error: true);
              }
            },
          ),
        ),
        if (widget.role.inviteOnly && widget.role.pendingRequests.isNotEmpty) ...[
          const SizedBox(height: 12),
          PendingNotice(
            '${widget.role.pendingRequests.length} join request${widget.role.pendingRequests.length == 1 ? ' is' : 's are'} still waiting from before. '
            'You can still accept or decline ${widget.role.pendingRequests.length == 1 ? 'it' : 'them'} in the Members tab.',
          ),
        ],
      ],
    ),
    _ConfigPage.reset => _Section(
      title: 'Reset role',
      children: [
        Muted(
          "Saves every member's points and tasks completed under a name you choose (shown with the date on the Saved Data tab), "
          "then clears this role's tasks, submissions and prizes and sets everyone back to 0."
          '${canChange ? '' : ' ${_cap(widget.approver)} has to approve it first.'}',
        ),
        if (pending != null)
          PendingNotice(
            '${pending.uid == me ? 'Reset requested' : '${pending.userName.isEmpty ? 'An instructor' : pending.userName} requested a reset'}'
            ' as "${pending.saveName}". Waiting for ${widget.approver}.',
            actionLabel: pending.uid == me ? 'Cancel' : null,
            onAction: () => Db.deleteRequest(pending.id),
          )
        else
          Align(
            alignment: Alignment.centerLeft,
            child: AppButton(
              label: canChange ? 'Reset Role' : 'Request Reset',
              size: AppButtonSize.sm,
              loading: _resetting,
              onPressed: _reset,
            ),
          ),
      ],
    ),
    _ConfigPage.delete => _Section(
      title: 'Danger Zone',
      danger: true,
      children: [
        Muted(
          'Permanently deletes ${widget.role.name} and all of its data, including its tasks, prizes and saved data. This cannot be undone.',
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: AppButton(label: 'Delete Role', size: AppButtonSize.sm, style: AppButtonStyle.red, onPressed: _delete),
        ),
      ],
    ),
  };
}
