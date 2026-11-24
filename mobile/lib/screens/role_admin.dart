// components/RoleAdmin.tsx: join requests, task assignment, the full task list
// with review actions, member stats, instructors, rewards and role config.
// Shown as the role page's Instructor tab for the role's instructors, and on
// the admin role screen (/admin/roles/:id) for admins.
import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
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
  final _filters = TaskFilters();
  _TaskFilter _taskFilter = _TaskFilter.all;

  Role get role => widget.role;

  @override
  void initState() {
    super.initState();
    _subs.addAll([
      Db.roleTasksStream(role.id).listen((t) => setState(() => _tasks = t)),
      Db.roleSubmittedStream(role.id).listen((s) => setState(() => _submitted = s)),
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

  SubmittedTask? _pendingFor(String taskId) {
    for (final s in _submitted) {
      if (s.id == taskId && !s.complete) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SlidingTabs<_AdminTab>(
          tabs: [
            SlidingTab(_AdminTab.requests, 'Requests', count: role.pendingRequests.length),
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
              _AdminTab.requests => _requestsTab(context),
              _AdminTab.creation => _AssignTaskForm(role: role, members: _nonAdmins(app)),
              _AdminTab.tasks => _tasksTab(context, app),
              _AdminTab.members => _membersTab(context, app),
              _AdminTab.instructors => _InstructorsTab(role: role),
              _AdminTab.rewards => _RewardsForm(role: role),
              _AdminTab.config => _ConfigTab(role: role),
            },
          ),
        ),
      ],
    );
  }

  /// `bg-white border border-gray-100 rounded-2xl px-4 py-3` row that slides in from the left.
  Widget _personRow(int i, UserData u, {required Widget info, required List<Widget> actions}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: FadeSlideIn(
      key: ValueKey(u.uid),
      delay: stagger(i),
      dx: -10,
      offset: 0,
      child: AppCard(
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
  );

  // ── Requests ──

  Widget _requestsTab(BuildContext context) {
    final list = _requesters.where((u) => role.pendingRequests.contains(u.uid)).toList();
    if (list.isEmpty) return const EmptyState('No pending requests.');
    return Column(
      children: [
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
    if (list.isEmpty) return const EmptyState('No members in this role.');
    return Column(
      children: [
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
            actions: [
              AppButton(
                label: 'Edit',
                size: AppButtonSize.xsm,
                style: AppButtonStyle.blue,
                onPressed: () => showModalCard<void>(
                  context,
                  builder: (_) => _EditMemberCard(member: list[i], roleId: role.id),
                ),
              ),
              AppButton(
                label: 'Kick',
                size: AppButtonSize.xsm,
                style: AppButtonStyle.red,
                onPressed: () async {
                  final ok = await confirmDialog(
                    context,
                    title: 'Kick Member',
                    message: 'Remove ${list[i].name} from this role?',
                    confirmLabel: 'Kick',
                    destructive: true,
                  );
                  if (ok) await Db.kickUserFromRole(role.id, list[i].uid);
                },
              ),
            ],
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
    final uid = await pickOption<String>(context, title: 'Select a member', options: [for (final m in widget.members) (m.uid, m.name)]);
    if (uid != null && !_selected.contains(uid)) setState(() => _selected.add(uid));
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
                PickerRow(
                  value: _due == null ? 'mm/dd/yyyy' : dayLabel.format(_due!),
                  placeholder: _due == null,
                  onTap: () async {
                    final d = await pickDate(context, initial: _due, allowClear: true);
                    if (d != null) setState(() => _due = d == clearSentinel ? null : d);
                  },
                ),
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
                      child: PickerRow(
                        value: _due == null ? 'mm/dd/yyyy' : dayLabel.format(_due!),
                        placeholder: _due == null,
                        onTap: () async {
                          final d = await pickDate(context, initial: _due, allowClear: true);
                          if (d != null) setState(() => _due = d == clearSentinel ? null : d);
                        },
                      ),
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
                    final uid = await pickOption<String>(
                      context,
                      title: 'Reassign to…',
                      options: [for (final m in widget.members.where((m) => m.uid != t.assignedTo)) (m.uid, m.name)],
                      selected: _reassignTo,
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

class _EditMemberCard extends StatefulWidget {
  const _EditMemberCard({required this.member, required this.roleId});

  final UserData member;
  final String roleId;

  @override
  State<_EditMemberCard> createState() => _EditMemberCardState();
}

class _EditMemberCardState extends State<_EditMemberCard> {
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
    await Db.setMemberRoleStats(widget.member.uid, widget.roleId, points: _read(_points), tasks: _read(_tasks), alsoGlobal: alsoGlobal);
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
    final isAdmin = context.watch<AppState>().isAdmin;
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
        AppButton(label: isAdmin ? 'Save to Role Only' : 'Save', size: AppButtonSize.full, onPressed: () => _save(false)),
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
  const _RewardsForm({required this.role});

  final Role role;

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
    await Db.setRewardsTitle(widget.role.id, _title.text);
    if (mounted) showToast(context, _title.text.trim().isEmpty ? 'Title reset to the current month' : 'Title updated');
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _Section(
        title: 'Rewards title',
        children: [
          const Muted('The heading on the Rewards tab. Leave it empty to show the current month.'),
          AppTextField(
            controller: _title,
            placeholder: '${DateFormat('MMMM', 'en_US').format(DateTime.now())} Rewards',
            maxLength: 48,
            onSubmitted: (_) => _saveTitle(),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: AppButton(label: 'Save Title', size: AppButtonSize.sm, onPressed: _saveTitle),
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
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.resolve(context, const Color(0xFF4B5563))),
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

  Future<void> _remove(AppState app, String uid, String name) async {
    final self = uid == app.user!.uid;
    final ok = await confirmDialog(
      context,
      title: self ? 'Leave as Instructor?' : 'Remove Instructor?',
      message: self
          ? "You'll stay a member of this role but won't be able to run it any more."
          : "$name will stay a member of this role but won't be able to run it any more.",
      confirmLabel: 'Remove',
      destructive: true,
    );
    if (ok) await Db.removeRoleInstructor(widget.role.id, uid);
  }

  Future<void> _add(List<UserData> addable) async {
    final uid = await pickOption<String>(context, title: 'Give access to', options: [for (final p in addable) (p.uid, p.name)]);
    if (uid == null) return;
    await Db.addRoleInstructor(widget.role, uid);
    if (mounted) showToast(context, 'Instructor added');
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    _sync(app);
    final role = widget.role;
    final byId = {for (final p in _people) p.uid: p};
    final addable =
        _people.where((p) => app.instructors.contains(p.uid) && !role.instructors.contains(p.uid) && !app.admins.contains(p.uid)).toList()
          ..sort((a, b) => a.name.compareTo(b.name));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Running this role',
          children: [
            const Muted(
              'Instructors here can give and review tasks, edit points, accept members and request resets. Admins can always run every role.',
            ),
            if (role.instructors.isEmpty) const Muted('No instructors yet.', color: Palette.gray400),
            for (final uid in role.instructors)
              Container(
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
                            '${byId[uid]?.name ?? 'Loading...'}${uid == app.user!.uid ? ' (you)' : ''}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Palette.label(context)),
                          ),
                          Muted(
                            '${role.createdBy == uid ? 'Created this role' : 'Instructor'}'
                            '${app.instructors.contains(uid) ? '' : ' · No longer an Instructor'}',
                            size: 12,
                            color: Palette.gray400,
                          ),
                        ],
                      ),
                    ),
                    if (app.isAdmin || uid == app.user!.uid || role.createdBy != uid)
                      AppButton(
                        label: 'Remove',
                        size: AppButtonSize.xsm,
                        style: AppButtonStyle.red,
                        onPressed: () => _remove(app, uid, byId[uid]?.name ?? 'This instructor'),
                      ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Add an instructor',
          children: [
            if (addable.isEmpty)
              const Muted(
                'Every instructor already has access. Admins can make more people Instructors from the Admin page.',
                color: Palette.gray400,
              )
            else
              PickerRow(value: 'Select an instructor', placeholder: true, onTap: () => _add(addable)),
          ],
        ),
      ],
    );
  }
}

class _ConfigTab extends StatefulWidget {
  const _ConfigTab({required this.role});

  final Role role;

  @override
  State<_ConfigTab> createState() => _ConfigTabState();
}

class _ConfigTabState extends State<_ConfigTab> {
  final _name = TextEditingController();
  bool _resetting = false;
  StreamSubscription<List<StemRequest>>? _resetSub;
  StemRequest? _pendingReset;

  @override
  void initState() {
    super.initState();
    // A reset this role is waiting on an admin to approve
    _resetSub = Db.roleRequestsStream(widget.role.id).listen((r) {
      if (mounted) setState(() => _pendingReset = r.where((x) => x.type == RequestType.resetRole).firstOrNull);
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _name.dispose();
    _resetSub?.cancel();
    super.dispose();
  }

  Future<void> _rename() async {
    final n = _name.text.trim();
    if (n.isEmpty) return;
    await Db.renameRole(widget.role.id, n);
    _name.clear();
    if (mounted) showToast(context, 'Role name updated successfully');
  }

  // Admins reset straight away; instructors send the reset to an admin to approve
  Future<void> _reset() async {
    final app = context.read<AppState>();
    final isAdmin = app.isAdmin;
    final saveName = await promptText(
      context,
      title: isAdmin ? 'Reset Role' : 'Request Reset',
      message: isAdmin
          ? "Every member's points and tasks completed in this role are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes."
          : "Name this save. An admin will review the reset; once approved, every member's points and tasks completed are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes.",
      placeholder: 'e.g. ${DateFormat('MMMM y', 'en_US').format(DateTime.now())}',
      confirmLabel: isAdmin ? 'Reset' : 'Send Request',
      destructive: isAdmin,
    );
    if (saveName == null || !mounted) return;
    if (saveName.trim().isEmpty) {
      await alertDialog(context, title: 'Name needed', message: 'Please enter a name for the saved data.');
      return;
    }
    setState(() => _resetting = true);
    try {
      if (isAdmin) {
        await Db.resetRole(widget.role.id, saveName.trim());
        if (mounted) showToast(context, 'Role reset. Its data is on the Saved Data tab.');
      } else {
        await Db.requestRoleReset(app.user!.uid, app.userData?.name ?? '', widget.role, saveName);
        if (mounted) showToast(context, 'Reset requested. An admin will review it.');
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
    final isAdmin = context.watch<AppState>().isAdmin;
    final on = widget.role.showInGlobalLeaderboard;
    final pending = _pendingReset;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Section(
          title: 'Rename role',
          children: [
            AppTextField(controller: _name, placeholder: 'New role name', onSubmitted: (_) => _rename()),
            Align(
              alignment: Alignment.centerLeft,
              child: AppButton(label: 'Save Name', size: AppButtonSize.sm, onPressed: _rename),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Global Leaderboard',
          children: [
            const Muted('When enabled, every member of this role can see the global leaderboard on the home page.'),
            Row(
              children: [
                Expanded(
                  child: Text(
                    on ? 'Enabled' : 'Disabled',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: on ? Palette.green600 : Palette.tertiary(context)),
                  ),
                ),
                AppButton(
                  label: on ? 'Disable' : 'Enable',
                  size: AppButtonSize.xsm,
                  style: on ? AppButtonStyle.red : AppButtonStyle.green,
                  onPressed: () => Db.setShowInGlobal(widget.role.id, !on),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Reset role',
          children: [
            Muted(
              "Saves every member's points and tasks completed under a name you choose (shown with the date on the Saved Data tab), "
              "then clears this role's tasks, submissions and prizes and sets everyone back to 0."
              '${isAdmin ? '' : ' An admin has to approve it first.'}',
            ),
            if (pending != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Palette.amber50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Reset requested as "${pending.saveName}". Waiting for an admin.',
                        style: const TextStyle(fontSize: 14, color: Palette.amber700),
                      ),
                    ),
                    if (!isAdmin) ...[
                      const SizedBox(width: 8),
                      AppButton(
                        label: 'Cancel',
                        size: AppButtonSize.xsm,
                        style: AppButtonStyle.cancel,
                        onPressed: () => Db.deleteRequest(pending.id),
                      ),
                    ],
                  ],
                ),
              )
            else
              Align(
                alignment: Alignment.centerLeft,
                child: AppButton(
                  label: isAdmin ? 'Reset Role' : 'Request Reset',
                  size: AppButtonSize.sm,
                  loading: _resetting,
                  onPressed: _reset,
                ),
              ),
          ],
        ),
        if (isAdmin) ...[
          const SizedBox(height: 16),
          _Section(
            title: 'Danger Zone',
            danger: true,
            children: [
              const Muted('Permanently deletes this role and all associated data, including its saved data.'),
              Align(
                alignment: Alignment.centerLeft,
                child: AppButton(label: 'Delete Role', size: AppButtonSize.sm, style: AppButtonStyle.red, onPressed: _delete),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
