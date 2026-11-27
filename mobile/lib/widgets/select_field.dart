// components/Dropdown.tsx: a field showing the current choice, opening a sheet
// that lists every option with its icon and a check on the current one.
import 'package:flutter/cupertino.dart';

import '../theme/palette.dart';
import 'buttons.dart';

typedef SelectOption<T> = ({T value, String label, IconData icon});

class SelectField<T> extends StatelessWidget {
  const SelectField({super.key, required this.value, required this.options, required this.onChanged, required this.title});

  final T value;
  final List<SelectOption<T>> options;
  final ValueChanged<T> onChanged;

  /// Heading on the sheet, e.g. "Month".
  final String title;

  @override
  Widget build(BuildContext context) {
    final current = options.indexWhere((o) => o.value == value);
    final selected = options[current < 0 ? 0 : current];
    final blue = Palette.resolve(context, Palette.blue600);
    return Pressable(
      scale: .98,
      onPressed: () async {
        // By index, so a null value (e.g. "All months") isn't mistaken for a dismissed sheet
        final i = await showSelectSheet(context, title: title, options: options, selectedIndex: current);
        if (i != null && options[i].value != value) onChanged(options[i].value);
      },
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 7, 10, 7),
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
              decoration: BoxDecoration(color: Palette.resolve(context, Palette.blue50), borderRadius: BorderRadius.circular(8)),
              child: Icon(selected.icon, size: 13, color: blue),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                selected.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: Palette.label(context)),
              ),
            ),
            const SizedBox(width: 6),
            Icon(CupertinoIcons.chevron_down, size: 14, color: Palette.tertiary(context)),
          ],
        ),
      ),
    );
  }
}

/// The option sheet. Returns the picked index, or null when dismissed.
Future<int?> showSelectSheet<T>(
  BuildContext context, {
  required String title,
  required List<SelectOption<T>> options,
  int selectedIndex = -1,
}) => showCupertinoModalPopup<int>(
  context: context,
  builder: (ctx) {
    final blue = Palette.resolve(ctx, Palette.blue600);
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .7),
      decoration: BoxDecoration(
        color: Palette.card(ctx),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 8),
            Center(
              child: Container(
                width: 36,
                height: 5,
                decoration: BoxDecoration(color: Palette.separator(ctx), borderRadius: BorderRadius.circular(3)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
              child: Text(
                title,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Palette.label(ctx)),
              ),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
                itemCount: options.length,
                itemBuilder: (_, i) {
                  final o = options[i];
                  final isSelected = i == selectedIndex;
                  return Pressable(
                    scale: .98,
                    onPressed: () => Navigator.pop(ctx, i),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 2),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
                      decoration: BoxDecoration(
                        color: isSelected ? Palette.resolve(ctx, Palette.blue50) : null,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          SizedBox(width: 24, child: Icon(o.icon, size: 15, color: isSelected ? blue : Palette.tertiary(ctx))),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              o.label,
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                                color: isSelected ? blue : Palette.label(ctx),
                              ),
                            ),
                          ),
                          if (isSelected) Icon(CupertinoIcons.checkmark_alt, size: 18, color: blue),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  },
);
