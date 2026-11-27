// pages/TasksPage.tsx: every task the signed-in person has been given, across
// the roles they're in (not the ones they run), to do and completed, with search
// and filters for the role, who gave it, when, and when it's due.
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
import '../widgets/page_scaffold.dart';
import '../widgets/role_icons.dart';
import '../widgets/select_field.dart';
import '../widgets/sliding_tabs.dart';
import 'task_widgets.dart';

enum _View { todo, completed, all }

enum _Due { any, week, overdue, none }

enum _Sort { newest, oldest, due, az, za }

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  final _search = TextEditingController();
  final List<StreamSubscription> _subs = [];
  List<Task>? _tasks;
  Set<String> _submitted = const {};
  Map<String, String> _assigners = const {};
  String _assignerKey = '';

  _View _view = _View.todo;
  String _role = '';
  String _by = '';
  (int, int)? _month;
  _Due _due = _Due.any;
  _Sort _sort = _Sort.newest;

  @override
  void initState() {
    super.initState();
    final uid = context.read<AppState>().user!.uid;
    _subs
      ..add(
        Db.userTasksStream(uid).listen((t) {
          if (mounted) setState(() => _tasks = t);
        }, onError: (_) => setState(() => _tasks = const [])),
      )
      ..add(
        Db.userSubmittedStream(uid).listen((s) {
          if (mounted) setState(() => _submitted = {for (final x in s.where((x) => !x.complete)) x.id});
        }, onError: (_) {}),
      );
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _search.dispose();
    super.dispose();
  }

  /// Names of the people who gave the tasks, looked up once per new set of people.
  void _loadAssigners(List<Task> tasks) {
    final ids = {
      for (final t in tasks)
        if (t.assignedBy.isNotEmpty) t.assignedBy,
    }.toList()..sort();
    final key = ids.join(',');
    if (key == _assignerKey) return;
    _assignerKey = key;
    Db.getUsers(ids).then((users) {
      if (mounted && key == _assignerKey) setState(() => _assigners = {for (final u in users) u.uid: u.name});
    });
  }

  bool get _filtersOn => _role.isNotEmpty || _by.isNotEmpty || _month != null || _due != _Due.any || _search.text.trim().isNotEmpty;

  void _clearFilters() => setState(() {
    _role = '';
    _by = '';
    _month = null;
    _due = _Due.any;
    _search.clear();
  });

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final me = app.user!.uid;
    if (app.isAdmin) {
      return const PageScaffold(
        title: 'Your Tasks',
        children: [EmptyState("Admins run roles rather than take part, so they aren't given tasks.")],
      );
    }

    // Roles they take part in (not the ones they run, where they aren't given tasks)
    final myRoles = app.roles.where((r) => !r.isGlobal && r.members.contains(me) && !r.instructors.contains(me)).toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    final roleById = {for (final r in myRoles) r.id: r};
    final mine = (_tasks ?? const <Task>[]).where((t) => roleById.containsKey(t.roleId)).toList();
    _loadAssigners(mine);

    final todo = mine.where((t) => !t.complete).length;
    final q = _search.text.trim().toLowerCase();
    final now = DateTime.now();
    final shown =
        mine.where((t) {
          if (_view == _View.todo && t.complete) return false;
          if (_view == _View.completed && !t.complete) return false;
          if (_role.isNotEmpty && t.roleId != _role) return false;
          if (_by.isNotEmpty && (_by == '-' ? t.assignedBy.isNotEmpty : t.assignedBy != _by)) return false;
          if (_month != null && (t.createdOn == null || t.createdOn!.year != _month!.$1 || t.createdOn!.month != _month!.$2)) return false;
          final due = t.dueDate;
          switch (_due) {
            case _Due.any:
              break;
            case _Due.none:
              if (due != null) return false;
            case _Due.overdue:
              if (due == null || t.complete || !due.isBefore(now)) return false;
            case _Due.week:
              if (due == null || t.complete || due.isBefore(now) || due.difference(now).inDays >= 7) return false;
          }
          return q.isEmpty ||
              t.title.toLowerCase().contains(q) ||
              t.description.toLowerCase().contains(q) ||
              (roleById[t.roleId]?.name.toLowerCase().contains(q) ?? false);
        }).toList()..sort(
          (a, b) => switch (_sort) {
            _Sort.az => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
            _Sort.za => b.title.toLowerCase().compareTo(a.title.toLowerCase()),
            _Sort.due => (a.dueDate ?? DateTime(9999)).compareTo(b.dueDate ?? DateTime(9999)),
            _Sort.oldest => (a.createdOn ?? DateTime(0)).compareTo(b.createdOn ?? DateTime(0)),
            _Sort.newest => (b.createdOn ?? DateTime(0)).compareTo(a.createdOn ?? DateTime(0)),
          },
        );

    final months = monthOptions();
    final assigners = _assigners.entries.toList()..sort((a, b) => a.value.toLowerCase().compareTo(b.value.toLowerCase()));

    return PageScaffold(
      title: 'Your Tasks',
      subtitle: "Everything you've been given, across all your roles.",
      spacing: 12,
      children: [
        SlidingTabs<_View>(
          tabs: [
            SlidingTab(_View.todo, 'To Do', count: todo, countColor: Palette.blue600),
            SlidingTab(_View.completed, 'Completed', count: mine.length - todo, countColor: Palette.green500),
            SlidingTab(_View.all, 'All', count: mine.length, countColor: Palette.gray400),
          ],
          selected: _view,
          onChanged: (v) => setState(() => _view = v),
        ),
        AppTextField(controller: _search, placeholder: 'Search tasks or roles...', onChanged: (_) => setState(() {})),
        Row(
          children: [
            Expanded(
              child: SelectField<String>(
                title: 'Role',
                value: _role,
                options: [
                  (value: '', label: 'All roles', icon: FontAwesomeIcons.layerGroup.data),
                  for (final r in myRoles) (value: r.id, label: r.name, icon: roleLook(r.icon, r.iconColor).icon.icon),
                ],
                onChanged: (v) => setState(() => _role = v),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SelectField<String>(
                title: 'Given by',
                value: _by,
                options: [
                  (value: '', label: 'Anyone', icon: FontAwesomeIcons.users.data),
                  for (final a in assigners) (value: a.key, label: a.value, icon: FontAwesomeIcons.user.data),
                  if (mine.any((t) => t.assignedBy.isEmpty)) (value: '-', label: 'Not recorded', icon: FontAwesomeIcons.user.data),
                ],
                onChanged: (v) => setState(() => _by = v),
              ),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: SelectField<(int, int)?>(
                title: 'Month given',
                value: _month,
                options: [
                  for (final (i, m) in months.indexed)
                    (
                      value: m.$1,
                      label: i == 0 ? 'Any month' : m.$2,
                      icon: i == 0 ? FontAwesomeIcons.calendarDays.data : FontAwesomeIcons.calendar.data,
                    ),
                ],
                onChanged: (m) => setState(() => _month = m),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SelectField<_Due>(
                title: 'Due',
                value: _due,
                options: [
                  (value: _Due.any, label: 'Any due date', icon: FontAwesomeIcons.calendarDays.data),
                  (value: _Due.week, label: 'Next 7 days', icon: FontAwesomeIcons.clock.data),
                  (value: _Due.overdue, label: 'Overdue', icon: FontAwesomeIcons.triangleExclamation.data),
                  (value: _Due.none, label: 'No due date', icon: FontAwesomeIcons.calendarXmark.data),
                ],
                onChanged: (d) => setState(() => _due = d),
              ),
            ),
          ],
        ),
        Row(
          children: [
            Expanded(
              child: Row(
                children: [
                  Muted('${shown.length} task${shown.length == 1 ? '' : 's'}', size: 12, color: Palette.gray400),
                  if (_filtersOn) ...[
                    const SizedBox(width: 8),
                    LinkText('Clear filters', size: 12, bold: true, color: Palette.navActive, onPressed: _clearFilters),
                  ],
                ],
              ),
            ),
            SizedBox(
              width: 160,
              child: SelectField<_Sort>(
                title: 'Sort',
                value: _sort,
                options: [
                  (value: _Sort.newest, label: 'Newest first', icon: FontAwesomeIcons.arrowDownWideShort.data),
                  (value: _Sort.oldest, label: 'Oldest first', icon: FontAwesomeIcons.arrowUpWideShort.data),
                  (value: _Sort.due, label: 'Due soonest', icon: FontAwesomeIcons.clock.data),
                  (value: _Sort.az, label: 'Title A–Z', icon: FontAwesomeIcons.arrowDownAZ.data),
                  (value: _Sort.za, label: 'Title Z–A', icon: FontAwesomeIcons.arrowDownZA.data),
                ],
                onChanged: (s) => setState(() => _sort = s),
              ),
            ),
          ],
        ),
        if (_tasks == null)
          const Muted('Loading tasks...', color: Palette.gray400)
        else if (shown.isEmpty)
          EmptyState(
            mine.isEmpty
                ? "You haven't been given any tasks yet."
                : _filtersOn
                ? 'No tasks match these filters.'
                : _view == _View.todo
                ? "You're all caught up!"
                : 'Nothing here yet.',
          )
        else
          for (var i = 0; i < shown.length; i++)
            FadeSlideIn(
              key: ValueKey(shown[i].id),
              delay: stagger(i),
              offset: 10,
              child: MemberTaskCard(
                task: shown[i],
                submitted: _submitted.contains(shown[i].id),
                header: _roleHeader(context, roleById[shown[i].roleId], shown[i]),
              ),
            ),
      ],
    );
  }

  Widget _roleHeader(BuildContext context, Role? role, Task t) => Row(
    children: [
      Flexible(
        child: Pressable(
          scale: .97,
          onPressed: () => context.go('/roles/${t.roleId}'),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (role != null) RoleIconBadge.of(role, size: 28),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  role?.name ?? 'Role',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Palette.secondary(context)),
                ),
              ),
              const SizedBox(width: 4),
              Icon(CupertinoIcons.chevron_right, size: 12, color: Palette.tertiary(context)),
            ],
          ),
        ),
      ),
      const SizedBox(width: 8),
      if (t.assignedBy.isNotEmpty)
        Muted('From ${_assigners[t.assignedBy] ?? '...'}', size: 12, color: Palette.gray400)
      else if (t.createdOn != null)
        Muted(DateFormat('MMM d', 'en_US').format(t.createdOn!), size: 12, color: Palette.gray400),
    ],
  );
}
