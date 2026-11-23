// Port of pages/AlumniBatchPage.tsx (admins only).
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
import '../widgets/page_scaffold.dart';

class AlumniBatchScreen extends StatefulWidget {
  const AlumniBatchScreen({super.key, required this.batchId});

  final String batchId;

  @override
  State<AlumniBatchScreen> createState() => _AlumniBatchScreenState();
}

class _AlumniBatchScreenState extends State<AlumniBatchScreen> {
  late final Future<(AlumniBatch?, List<AlumniMember>)> _load = Db.loadAlumniBatch(widget.batchId);
  bool _deleting = false;

  Future<void> _delete(AlumniBatch batch) async {
    final router = GoRouter.of(context);
    final ok = await confirmDialog(
      context,
      title: 'Delete Archive',
      message: 'Delete the "${batch.name}" archive? This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    );
    if (!ok) return;
    setState(() => _deleting = true);
    try {
      await Db.deleteAlumniBatch(widget.batchId);
      router.go('/alumni');
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!context.watch<AppState>().isAdmin) return const LoadingView();
    return FutureBuilder(
      future: _load,
      builder: (context, snap) {
        if (!snap.hasData) return const LoadingView();
        final (batch, members) = snap.data!;
        if (batch == null) {
          return PageScaffold(
            children: [
              const EmptyState('This archive no longer exists.'),
              Center(
                child: AppButton(
                  label: 'Back to Alumni',
                  style: AppButtonStyle.gray,
                  size: AppButtonSize.sm,
                  onPressed: () => context.go('/alumni'),
                ),
              ),
            ],
          );
        }
        final created = batch.createdAt == null ? '' : DateFormat('MMMM d, y', 'en_US').format(batch.createdAt!);
        final subtitle = '$created${batch.roleNames.isNotEmpty ? ' · Archived from: ${batch.roleNames.join(', ')}' : ''}';

        return PageScaffold(
          backLabel: 'Back to Alumni',
          backPath: '/alumni',
          title: batch.name,
          subtitle: subtitle.isEmpty ? null : subtitle,
          spacing: 8,
          children: [
            if (members.isEmpty)
              const EmptyState('No members in this archive.')
            else
              for (var i = 0; i < members.length; i++)
                FadeSlideIn(
                  delay: stagger(i, 25),
                  offset: 8,
                  child: AppCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    radius: 12,
                    shadow: false,
                    child: Row(
                      children: [
                        SizedBox(
                          width: 24,
                          child: Text(
                            '${i + 1}',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Palette.tertiary(context)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Avatar(members[i].photoURL, name: members[i].name, size: Avatar.xxs),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            members[i].name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                          ),
                        ),
                        StatText(members[i].points, 'pts'),
                      ],
                    ),
                  ),
                ),
            const SizedBox(height: 8),
            DangerZone(
              text: 'Permanently deletes this archive and all of its saved data.',
              button: AppButton(
                label: _deleting ? 'Deleting...' : 'Delete This Archive',
                style: AppButtonStyle.red,
                size: AppButtonSize.md,
                onPressed: _deleting ? null : () => _delete(batch),
              ),
            ),
          ],
        );
      },
    );
  }
}
