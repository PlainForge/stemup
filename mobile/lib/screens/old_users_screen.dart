// Port of pages/OldUsersPage.tsx (admins only): people not on the global
// leaderboard, whether removed individually or archived by a semester reset.
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';

import '../services/db.dart';
import '../state/app_state.dart';
import '../theme/palette.dart';
import '../widgets/buttons.dart';
import '../widgets/common.dart';
import '../widgets/page_scaffold.dart';

class OldUsersScreen extends StatefulWidget {
  const OldUsersScreen({super.key});

  @override
  State<OldUsersScreen> createState() => _OldUsersScreenState();
}

class _OldUsersScreenState extends State<OldUsersScreen> {
  List<OldUserRow>? _rows;
  String? _restoring;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final app = context.read<AppState>();
    if (!app.isAdmin) return;
    final rows = await Db.loadOldUsers(app.admins);
    if (mounted) setState(() => _rows = rows);
  }

  Future<void> _restore(OldUserRow row) async {
    setState(() => _restoring = row.uid);
    try {
      if (row.isAlumni) {
        await Db.restoreAlumniMemberToGlobal(row.batchId!, row.uid);
      } else {
        await Db.restoreLiveUserToGlobal(row.uid);
      }
      await _load();
    } finally {
      if (mounted) setState(() => _restoring = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = context.watch<AppState>().isAdmin;
    if (!isAdmin) return const LoadingView();
    final rows = _rows;
    return PageScaffold(
      title: 'Old Users',
      subtitle: 'Users not currently in the global leaderboard — removed individually or archived from a semester reset.',
      spacing: 8,
      onRefresh: _load,
      children: [
        if (rows == null)
          const EmptyState('Loading...')
        else if (rows.isEmpty)
          const EmptyState('No old users.')
        else
          for (var i = 0; i < rows.length; i++)
            FadeSlideIn(
              key: ValueKey('${rows[i].batchId}-${rows[i].uid}'),
              delay: stagger(i, 25),
              offset: 8,
              child: AppCard(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                radius: 12,
                shadow: false,
                child: Row(
                  children: [
                    Avatar(rows[i].photoURL, size: Avatar.xxs),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rows[i].name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: FontWeight.w500, color: Palette.label(context)),
                          ),
                          Muted(
                            '${rows[i].points} pts · ${rows[i].taskCompleted} tasks · ${rows[i].isAlumni ? 'Alumni: ${rows[i].batchName}' : 'Removed from Global'}',
                            size: 12,
                            maxLines: 1,
                            color: Palette.gray400,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppButton(
                      label: _restoring == rows[i].uid ? 'Restoring...' : 'Restore',
                      size: AppButtonSize.xsm,
                      style: AppButtonStyle.gray,
                      onPressed: _restoring == rows[i].uid ? null : () => _restore(rows[i]),
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }
}
