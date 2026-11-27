// RolePage's Tasks tab + TaskDoneButton.tsx, and the search / month / sort
// filter bar shared with the admin task list.
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
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
import '../widgets/select_field.dart';

enum TaskSort { newest, oldest, az, za }

enum TaskStatusFilter { all, incomplete, complete }

/// Filter state lives in the parent so it survives switching tabs.
class TaskFilters {
  final search = TextEditingController();

  /// (year, month) or null for all months.
  (int, int)? month;
  TaskSort sort = TaskSort.newest;
  TaskStatusFilter status = TaskStatusFilter.all;

  String get query => search.text.trim().toLowerCase();

  bool matchesMonth(DateTime? d) => month == null || (d != null && d.year == month!.$1 && d.month == month!.$2);

  List<T> sorted<T>(Iterable<T> items, String Function(T) title, DateTime? Function(T) date) {
    final list = items.toList();
    list.sort(
      (a, b) => switch (sort) {
        TaskSort.az => title(a).toLowerCase().compareTo(title(b).toLowerCase()),
        TaskSort.za => title(b).toLowerCase().compareTo(title(a).toLowerCase()),
        TaskSort.oldest => (date(a) ?? DateTime(0)).compareTo(date(b) ?? DateTime(0)),
        TaskSort.newest => (date(b) ?? DateTime(0)).compareTo(date(a) ?? DateTime(0)),
      },
    );
    return list;
  }
}

final _monthLabel = DateFormat('MMMM y', 'en_US');
final dayLabel = DateFormat('MMM d, y', 'en_US');
final dateTimeLabel = DateFormat('MMM d, y, h:mm a', 'en_US');

List<((int, int)?, String)> monthOptions() {
  final now = DateTime.now();
  return [
    (null, 'All months'),
    for (var i = 0; i < 13; i++)
      (
        (DateTime(now.year, now.month - i).year, DateTime(now.year, now.month - i).month),
        _monthLabel.format(DateTime(now.year, now.month - i)),
      ),
  ];
}

class TaskFilterBar extends StatelessWidget {
  const TaskFilterBar({super.key, required this.filters, required this.onChanged, required this.searchHint, this.extra});

  final TaskFilters filters;
  final VoidCallback onChanged;
  final String searchHint;

  /// Status chip row (member and admin views differ).
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final months = monthOptions();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(controller: filters.search, placeholder: searchHint, onChanged: (_) => onChanged()),
        const SizedBox(height: 8),
        // Month and sort side by side, like the web filter bar
        Row(
          children: [
            Expanded(
              child: SelectField<(int, int)?>(
                title: 'Month',
                value: filters.month,
                options: [
                  for (final (i, m) in months.indexed)
                    (value: m.$1, label: m.$2, icon: i == 0 ? FontAwesomeIcons.calendarDays.data : FontAwesomeIcons.calendar.data),
                ],
                onChanged: (m) {
                  filters.month = m;
                  onChanged();
                },
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 150,
              child: SelectField<TaskSort>(
                title: 'Sort',
                value: filters.sort,
                options: [
                  (value: TaskSort.newest, label: 'Newest first', icon: FontAwesomeIcons.arrowDownWideShort.data),
                  (value: TaskSort.oldest, label: 'Oldest first', icon: FontAwesomeIcons.arrowUpWideShort.data),
                  (value: TaskSort.az, label: 'Title A–Z', icon: FontAwesomeIcons.arrowDownAZ.data),
                  (value: TaskSort.za, label: 'Title Z–A', icon: FontAwesomeIcons.arrowDownZA.data),
                ],
                onChanged: (s) {
                  filters.sort = s;
                  onChanged();
                },
              ),
            ),
          ],
        ),
        if (extra != null) ...[const SizedBox(height: 8), extra!],
      ],
    );
  }
}

class MemberTasks extends StatelessWidget {
  const MemberTasks({
    super.key,
    required this.tasks,
    required this.loading,
    required this.submittedIds,
    required this.filters,
    required this.onFiltersChanged,
  });

  final List<Task> tasks;
  final bool loading;
  final Set<String> submittedIds;
  final TaskFilters filters;
  final VoidCallback onFiltersChanged;

  @override
  Widget build(BuildContext context) {
    final q = filters.query;
    final visible = filters.sorted(
      tasks.where((t) {
        if (filters.status == TaskStatusFilter.complete && !t.complete) return false;
        if (filters.status == TaskStatusFilter.incomplete && t.complete) return false;
        if (!filters.matchesMonth(t.createdOn)) return false;
        return q.isEmpty || t.title.toLowerCase().contains(q) || t.description.toLowerCase().contains(q);
      }),
      (t) => t.title,
      (t) => t.createdOn,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Heading('Your Tasks'),
        const SizedBox(height: 12),
        TaskFilterBar(
          filters: filters,
          onChanged: onFiltersChanged,
          searchHint: 'Search tasks...',
          extra: ChipGroup<TaskStatusFilter>(
            options: const [
              (TaskStatusFilter.all, 'All'),
              (TaskStatusFilter.incomplete, 'Not Completed'),
              (TaskStatusFilter.complete, 'Completed'),
            ],
            selected: filters.status,
            onChanged: (s) {
              filters.status = s;
              onFiltersChanged();
            },
          ),
        ),
        const SizedBox(height: 12),
        if (loading)
          const Muted('Loading tasks...', color: Palette.gray400)
        else if (visible.isEmpty)
          const EmptyState('No tasks assigned to you yet.')
        else
          for (var i = 0; i < visible.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FadeSlideIn(
                key: ValueKey(visible[i].id),
                delay: stagger(i),
                offset: 10,
                child: MemberTaskCard(task: visible[i], submitted: submittedIds.contains(visible[i].id)),
              ),
            ),
      ],
    );
  }
}

/// `p-4 rounded-2xl border-2 bg-white` task card.
class TaskCardFrame extends StatelessWidget {
  const TaskCardFrame({super.key, required this.borderColor, required this.children});

  final Color? borderColor;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Palette.card(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: borderColor ?? Palette.separator(context), width: 2),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < children.length; i++) ...[if (i > 0) const SizedBox(height: 12), children[i]],
      ],
    ),
  );
}

/// Title + "NEW" + points badge row shared by the member and admin cards.
class TaskTitleRow extends StatelessWidget {
  const TaskTitleRow({super.key, required this.title, required this.points, this.isNew = false, this.truncate = true});

  final String title;
  final int points;
  final bool isNew;
  final bool truncate;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Row(
          children: [
            Flexible(
              child: Text(
                title,
                maxLines: truncate ? 1 : null,
                overflow: truncate ? TextOverflow.ellipsis : null,
                style: TextStyle(fontWeight: FontWeight.w600, height: 1.2, color: Palette.label(context)),
              ),
            ),
            if (isNew) ...[
              const SizedBox(width: 6),
              const Text(
                'NEW',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Palette.red500),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(width: 8),
      Tag('$points pts', color: Palette.blue700),
    ],
  );
}

/// Opens a task's thread (chat_screens.dart): along the bottom of a task card, when
/// its role has task questions on, for the person doing it and whoever gave it.
class TaskThreadButton extends StatelessWidget {
  const TaskThreadButton({super.key, required this.task});

  final Task task;

  static bool shows(AppState app, Task t) => (app.roleById(t.roleId)?.taskThreadsEnabled ?? false) && app.inTaskThread(t);

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final isDoer = task.assignedTo == app.user?.uid;
    final unread = app.threadUnread(task);
    final first = task.assignedName.split(' ').first;
    return Pressable(
      scale: .98,
      onPressed: () => context.push('/thread/${task.id}'),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: Palette.fill(context), borderRadius: BorderRadius.circular(12)),
        child: Row(
          children: [
            Icon(FontAwesomeIcons.comments.data, size: 14, color: Palette.blue500),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                isDoer || first.isEmpty ? 'Questions' : 'Questions from $first',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Palette.label(context)),
              ),
            ),
            if (unread)
              const Tag('NEW', color: Palette.red500)
            else if (task.messageCount > 0)
              Text(
                '${task.messageCount}',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Palette.tertiary(context)),
              ),
            const SizedBox(width: 6),
            Icon(CupertinoIcons.chevron_right, size: 14, color: Palette.tertiary(context)),
          ],
        ),
      ),
    );
  }
}

class MemberTaskCard extends StatefulWidget {
  const MemberTaskCard({super.key, required this.task, required this.submitted, this.header});

  final Task task;
  final bool submitted;

  /// Shown above the title (the Tasks tab puts the task's role here).
  final Widget? header;

  @override
  State<MemberTaskCard> createState() => _MemberTaskCardState();
}

class _MemberTaskCardState extends State<MemberTaskCard> {
  bool _submitting = false;

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await Db.submitTask(widget.task);
      HapticFeedback.mediumImpact();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _small(String text, Color color, {bool bold = true}) => Text(
    text,
    style: TextStyle(fontSize: 12, fontWeight: bold ? FontWeight.w600 : FontWeight.w500, color: color),
  );

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    final t = widget.task;
    final overdue = t.isOverdue;
    final daysLeft = t.daysUntilDeletion;
    final isNew = !t.complete && !widget.submitted && !app.seenTaskIds.contains(t.id);
    const statuses = <TaskStatus?>[null, TaskStatus.inProgress, TaskStatus.almostDone];

    return GestureDetector(
      // The web marks a task seen on hover; on a phone, touching the card does it
      onTap: () => app.markTaskSeen(t.id),
      child: TaskCardFrame(
        borderColor: t.complete ? const Color(0xFF4ADE80) : (overdue ? const Color(0xFFFCA5A5) : null),
        children: [
          ?widget.header,
          TaskTitleRow(title: t.title, points: t.points, isNew: isNew),
          Muted(t.description.isEmpty ? 'No description' : t.description),
          if (overdue)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _small(
                  'Overdue${daysLeft == null ? '' : ' · ${daysLeft > 0 ? 'Expires in $daysLeft day${daysLeft == 1 ? '' : 's'}' : 'Expiring soon'}'}',
                  Palette.red500,
                ),
                if (!t.extensionRequested && !t.extensionDeclined)
                  LinkText('Request Extension', size: 12, bold: true, color: Palette.blue500, onPressed: () => Db.requestExtension(t.id)),
                if (t.extensionRequested) _small('Requested Extension', const Color(0xFFCA8A04), bold: false),
                if (t.extensionDeclined) _small('Extension Declined', Palette.tertiary(context), bold: false),
                if (t.declineCount > 0)
                  _small(
                    'Declined ${t.declineCount} time${t.declineCount == 1 ? '' : 's'}${t.declineCount == 3 ? ' · Task closed' : ''}',
                    Palette.red400,
                    bold: false,
                  ),
              ],
            ),
          if (t.dueDate != null && !t.complete && !overdue) Muted('Due: ${dayLabel.format(t.dueDate!)}', size: 12, color: Palette.gray400),
          if (!t.complete && !overdue && !widget.submitted)
            SelectField<int>(
              title: 'Status',
              value: statuses.indexOf(t.status),
              options: [
                (value: 0, label: 'Not started', icon: FontAwesomeIcons.circle.data),
                (value: 1, label: 'In Progress', icon: FontAwesomeIcons.personRunning.data),
                (value: 2, label: 'Almost Done', icon: FontAwesomeIcons.flagCheckered.data),
              ],
              onChanged: (i) => Db.setTaskStatus(t.id, statuses[i]),
            ),
          if (!overdue) _doneButton(context, t),
          if (TaskThreadButton.shows(app, t)) TaskThreadButton(task: t),
        ],
      ),
    );
  }

  // TaskDoneButton.tsx
  Widget _doneButton(BuildContext context, Task t) {
    Widget box(String text, {Color? fill}) => Container(
      padding: const EdgeInsets.all(8),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fill ?? Palette.separator(context), width: 2),
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Palette.label(context)),
      ),
    );

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: t.complete
          ? KeyedSubtree(
              key: const ValueKey('done'),
              child: box('Completed', fill: Palette.green500),
            )
          : widget.submitted
          ? KeyedSubtree(key: const ValueKey('wait'), child: box('Waiting for approval...'))
          : AppButton(
              key: const ValueKey('btn'),
              label: _submitting ? 'Submitting...' : 'Done',
              size: AppButtonSize.full,
              onPressed: _submitting ? null : _submit,
            ),
    );
  }
}
