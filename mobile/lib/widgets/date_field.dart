// components/DatePicker.tsx: a due-date field showing the chosen day, opening
// a calendar sheet with quick picks (Today, Tomorrow, Next week) and Clear.
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../theme/palette.dart';
import 'buttons.dart';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);
bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// The field. [onChanged] gets null when the date is cleared.
class DateField extends StatelessWidget {
  const DateField({super.key, required this.value, required this.onChanged, this.placeholder = 'No due date', this.title = 'Due date'});

  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final String placeholder;

  /// Heading on the calendar sheet.
  final String title;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final blue = Palette.resolve(context, Palette.blue600);
    final label = v == null ? placeholder : DateFormat(v.year == DateTime.now().year ? 'EEE, MMM d' : 'EEE, MMM d, y', 'en_US').format(v);
    return Pressable(
      scale: .98,
      onPressed: () async {
        final picked = await showDateSheet(context, initial: v, title: title);
        if (picked == null) return;
        onChanged(picked.isAtSameMomentAs(_cleared) ? null : picked);
      },
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 7, 6, 7),
        decoration: BoxDecoration(
          color: Palette.fill(context),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Palette.separator(context)),
        ),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: v != null ? blue : Palette.resolve(context, Palette.blue50),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(CupertinoIcons.calendar, size: 16, color: v != null ? const Color(0xFFFFFFFF) : blue),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: v != null ? FontWeight.w500 : FontWeight.w400,
                  color: v != null ? Palette.label(context) : Palette.tertiary(context),
                ),
              ),
            ),
            if (v != null)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onChanged(null),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(CupertinoIcons.xmark_circle_fill, size: 18, color: Palette.tertiary(context)),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.all(6),
                child: Icon(CupertinoIcons.chevron_down, size: 14, color: Palette.tertiary(context)),
              ),
          ],
        ),
      ),
    );
  }
}

final _cleared = DateTime(0);

/// The calendar sheet. Returns the picked day, a sentinel for Clear (handled by
/// [DateField]), or null when dismissed. Days before today can't be picked.
Future<DateTime?> showDateSheet(BuildContext context, {DateTime? initial, String title = 'Due date'}) => showCupertinoModalPopup<DateTime>(
  context: context,
  builder: (ctx) => _DateSheet(initial: initial, title: title),
);

class _DateSheet extends StatefulWidget {
  const _DateSheet({required this.initial, required this.title});

  final DateTime? initial;
  final String title;

  @override
  State<_DateSheet> createState() => _DateSheetState();
}

class _DateSheetState extends State<_DateSheet> {
  final _today = _day(DateTime.now());
  late DateTime _month = DateTime((widget.initial ?? _today).year, (widget.initial ?? _today).month);

  bool _off(DateTime d) => d.isBefore(_today);

  void _pick(DateTime d) {
    if (_off(d)) return;
    Navigator.pop(context, d);
  }

  @override
  Widget build(BuildContext context) {
    final selected = widget.initial == null ? null : _day(widget.initial!);
    final blue = Palette.resolve(context, Palette.blue600);
    final first = DateTime(_month.year, _month.month);
    // Six weeks, starting on the Sunday on or before the 1st
    final start = first.subtract(Duration(days: first.weekday % 7));
    final days = [for (var i = 0; i < 42; i++) DateTime(start.year, start.month, start.day + i)];
    final prevOff = DateTime(_month.year, _month.month, 0).isBefore(_today);
    final quick = [
      ('Today', _today),
      ('Tomorrow', _today.add(const Duration(days: 1))),
      ('Next week', _today.add(const Duration(days: 7))),
    ];

    return Container(
      decoration: BoxDecoration(
        color: Palette.card(context),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 5,
                decoration: BoxDecoration(color: Palette.separator(context), borderRadius: BorderRadius.circular(3)),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.title,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Palette.label(context)),
                  ),
                ),
                if (selected != null)
                  CupertinoButton(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                    onPressed: () => Navigator.pop(context, _cleared),
                    child: const Text('Clear', style: TextStyle(fontSize: 15, color: Palette.red500)),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                for (var i = 0; i < quick.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: Pressable(
                      onPressed: () => _pick(quick[i].$2),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 9),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: selected != null && _sameDay(selected, quick[i].$2) ? blue : Palette.fill(context),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          quick[i].$1,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: selected != null && _sameDay(selected, quick[i].$2)
                                ? const Color(0xFFFFFFFF)
                                : Palette.secondary(context),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                _arrow(
                  context,
                  CupertinoIcons.chevron_left,
                  prevOff ? null : () => setState(() => _month = DateTime(_month.year, _month.month - 1)),
                ),
                Expanded(
                  child: Text(
                    DateFormat('MMMM y', 'en_US').format(_month),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Palette.label(context)),
                  ),
                ),
                _arrow(context, CupertinoIcons.chevron_right, () => setState(() => _month = DateTime(_month.year, _month.month + 1))),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final w in const ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'])
                  Expanded(
                    child: Text(
                      w,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Palette.tertiary(context)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            for (var week = 0; week < 6; week++)
              Row(children: [for (final d in days.sublist(week * 7, week * 7 + 7)) Expanded(child: _dayCell(context, d, selected, blue))]),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _arrow(BuildContext context, IconData icon, VoidCallback? onTap) => CupertinoButton(
    padding: const EdgeInsets.all(8),
    minimumSize: const Size(36, 36),
    onPressed: onTap,
    child: Icon(icon, size: 18, color: onTap == null ? Palette.separator(context) : Palette.secondary(context)),
  );

  Widget _dayCell(BuildContext context, DateTime d, DateTime? selected, Color blue) {
    final off = _off(d);
    final isSelected = selected != null && _sameDay(d, selected);
    final isToday = _sameDay(d, _today);
    final inMonth = d.month == _month.month;
    final color = isSelected
        ? const Color(0xFFFFFFFF)
        : off
        ? Palette.separator(context)
        : isToday
        ? blue
        : inMonth
        ? Palette.label(context)
        : Palette.tertiary(context);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: off ? null : () => _pick(d),
      child: SizedBox(
        height: 42,
        child: Center(
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(color: isSelected ? blue : null, shape: BoxShape.circle),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Text(
                  '${d.day}',
                  style: TextStyle(fontSize: 16, fontWeight: isSelected || isToday ? FontWeight.w600 : FontWeight.w400, color: color),
                ),
                if (isToday && !isSelected)
                  Positioned(
                    bottom: 4,
                    child: Container(
                      width: 4,
                      height: 4,
                      decoration: BoxDecoration(color: blue, shape: BoxShape.circle),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
