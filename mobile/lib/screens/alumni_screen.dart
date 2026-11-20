// Port of pages/AlumniPage.tsx (admins only).
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

class AlumniScreen extends StatelessWidget {
  const AlumniScreen({super.key});

  @override
  Widget build(BuildContext context) {
    if (!context.watch<AppState>().isAdmin) return const LoadingView();
    return StreamBuilder<List<AlumniBatch>>(
      stream: Db.alumniStream(),
      builder: (context, snap) {
        final batches = snap.data;
        return PageScaffold(
          title: 'Alumni',
          subtitle: 'Archived rosters from previous semesters.',
          spacing: 12,
          children: [
            if (batches == null)
              const EmptyState('Loading...')
            else if (batches.isEmpty)
              const EmptyState('No archives yet. Archives are created from the Semester Reset tool in Settings.')
            else
              for (var i = 0; i < batches.length; i++)
                FadeSlideIn(
                  key: ValueKey(batches[i].id),
                  delay: stagger(i),
                  dx: -20,
                  offset: 0,
                  child: Pressable(
                    scale: .97,
                    onPressed: () => context.push('/alumni/${batches[i].id}'),
                    child: AppCard(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      shadow: false,
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(shape: BoxShape.circle, color: Palette.resolve(context, Palette.gray100)),
                            child: Icon(FontAwesomeIcons.userGraduate.data, color: Palette.tertiary(context), size: 16),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  batches[i].name,
                                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: Palette.label(context)),
                                ),
                                Muted(
                                  '${batches[i].createdAt == null ? '' : '${DateFormat('MMMM y', 'en_US').format(batches[i].createdAt!)} · '}'
                                  '${batches[i].memberCount} member${batches[i].memberCount == 1 ? '' : 's'}',
                                  size: 12,
                                  color: Palette.gray400,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }
}
