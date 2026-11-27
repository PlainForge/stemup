// Podium + ranked rows shared by the home screen (global leaderboard) and the
// role screen — the same markup Dash.tsx and RolePage.tsx each render.
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';

import '../models/models.dart';
import '../theme/palette.dart';
import 'buttons.dart';
import 'common.dart';
import 'profile_sheet.dart';

/// Only people who've earned a point or finished a task can take a top-3 spot.
bool hasEarned(UserData u) => u.points > 0 || u.taskCompleted > 0;

/// Splits a ranking (already sorted, best first) into the top-3 podium and everyone
/// else. Anyone who hasn't earned anything yet starts from 4th, so the podium can
/// have empty spots. `rest[i]` is ranked `i + 4`.
({List<UserData> podium, List<UserData> rest}) splitLeaderboard(List<UserData> ranked) {
  final podium = ranked.where(hasEarned).take(3).toList();
  final onPodium = {for (final u in podium) u.uid};
  return (podium: podium, rest: ranked.where((u) => !onPodium.contains(u.uid)).toList());
}

/// 1-3 on the podium, 4+ after it, or null if they aren't on the board.
int? rankOf(({List<UserData> podium, List<UserData> rest}) board, String uid) {
  final p = board.podium.indexWhere((u) => u.uid == uid);
  if (p >= 0) return p + 1;
  final r = board.rest.indexWhere((u) => u.uid == uid);
  return r >= 0 ? r + 4 : null;
}

class _Slot {
  const _Slot(this.rank, this.bar, this.avatar, this.text, this.top, this.fill, this.border, this.meFill, this.meBorder);

  final int rank;
  final double bar, avatar, text, top;
  final Color fill, border, meFill, meBorder;
}

// podiumConfig from the web, in display order 2nd, 1st, 3rd
const _slots = [
  _Slot(2, 64, 96, 14, 32, Color(0xFFF3F4F6), Color(0xFFE5E7EB), Color(0xFFE5E7EB), Color(0xFF9CA3AF)),
  _Slot(1, 96, 136, 16, 0, Color(0xFFFEF9C3), Color(0xFFFDE047), Color(0xFFFEF08A), Color(0xFFFACC15)),
  _Slot(3, 40, 56, 12, 56, Color(0xFFFFF7ED), Color(0xFFFED7AA), Color(0xFFFED7AA), Color(0xFFFB923C)),
];

class Podium extends StatelessWidget {
  const Podium({super.key, required this.ranked, required this.meUid, this.roleId});

  /// The podium, best first (see [splitLeaderboard]). Missing places show empty.
  final List<UserData> ranked;
  final String meUid;

  /// When set, tapping a user opens their card in this role's context.
  final String? roleId;

  @override
  Widget build(BuildContext context) {
    final top = ranked.take(3).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final colWidth = (constraints.maxWidth - 16) / 3;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(
                  child: FadeSlideIn(
                    delay: Duration(milliseconds: 50 * i),
                    offset: 20,
                    child: _column(context, _slots[i], _slots[i].rank - 1 < top.length ? top[_slots[i].rank - 1] : null, colWidth),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _column(BuildContext context, _Slot cfg, UserData? u, double colWidth) {
    final avatar = math.min(cfg.avatar, colWidth);
    final isMe = u?.uid == meUid;
    final ghost = u == null;
    final fill = ghost ? Palette.fill(context) : (isMe ? cfg.meFill : cfg.fill);
    final border = ghost ? Palette.separator(context) : (isMe ? cfg.meBorder : cfg.border);

    final column = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(height: cfg.top),
        Opacity(opacity: ghost ? 0 : 1, child: MedalIcon(cfg.rank - 1, size: 18)),
        const SizedBox(height: 4),
        if (ghost)
          Container(
            width: avatar,
            height: avatar,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Palette.resolve(context, Palette.gray100),
              border: Border.all(color: Palette.resolve(context, Palette.gray300), width: 2),
            ),
          )
        else ...[
          Avatar(u.photoURL, name: u.name, size: avatar),
          const SizedBox(height: 4),
          Text(
            u.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: cfg.text, fontWeight: FontWeight.w600, color: Palette.label(context)),
          ),
        ],
        if (ghost) ...[
          const SizedBox(height: 4),
          Text(
            '—',
            style: TextStyle(fontSize: cfg.text, fontWeight: FontWeight.w600, color: Palette.resolve(context, Palette.gray300)),
          ),
        ],
        const SizedBox(height: 4),
        ghost
            ? Text(
                '— pts',
                style: TextStyle(fontSize: cfg.text, color: Palette.resolve(context, Palette.gray200)),
              )
            : StatText(u.points, 'pts', size: cfg.text),
        const SizedBox(height: 4),
        Container(
          height: cfg.bar,
          width: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: fill,
            border: Border.all(color: border, width: 2),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
          ),
          child: Text(
            '${cfg.rank}',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 14,
              color: ghost ? Palette.resolve(context, Palette.gray300) : const Color(0xFF6B7280),
            ),
          ),
        ),
      ],
    );
    // Tapping anywhere on a filled spot opens their profile, same as tapping the name
    return ghost
        ? column
        : Pressable(
            scale: .97,
            onPressed: () => showProfileSheet(context, u, roleId: roleId),
            child: column,
          );
  }
}

/// A 4th-place-and-below row.
class RankRow extends StatelessWidget {
  const RankRow({super.key, required this.rank, required this.user, required this.isMe, this.roleId});

  final int rank;
  final UserData user;
  final bool isMe;
  final String? roleId;

  @override
  Widget build(BuildContext context) => Pressable(
    scale: .98,
    // The whole row opens their profile, same as tapping the name
    onPressed: () => showProfileSheet(context, user, roleId: roleId),
    child: _row(context),
  );

  Widget _row(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: isMe ? Palette.resolve(context, Palette.blue50) : Palette.card(context),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: isMe ? const Color(0xFFBFDBFE) : Palette.resolve(context, Palette.gray100)),
    ),
    child: Row(
      children: [
        SizedBox(
          width: 24,
          child: Text(
            '$rank',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Palette.tertiary(context)),
          ),
        ),
        const SizedBox(width: 12),
        // ProfileButton.tsx: avatar + name
        Expanded(
          child: Builder(
            builder: (context) => Row(
              children: [
                Avatar(user.photoURL, name: user.name, size: Avatar.xxs),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    user.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w500, color: Palette.label(context)),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        StatText(user.points, 'pts'),
      ],
    ),
  );
}

/// Podium + rows for a full ranking, or an empty state.
class Leaderboard extends StatelessWidget {
  const Leaderboard({super.key, required this.ranked, required this.meUid, this.roleId, this.emptyText = 'No participants yet.'});

  final List<UserData> ranked;
  final String meUid;
  final String? roleId;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    if (ranked.isEmpty) return EmptyState(emptyText);
    final board = splitLeaderboard(ranked);
    return Column(
      children: [
        Podium(ranked: board.podium, meUid: meUid, roleId: roleId),
        for (var i = 0; i < board.rest.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: FadeSlideIn(
              delay: stagger(i, 30),
              offset: 8,
              child: RankRow(rank: i + 4, user: board.rest[i], isMe: board.rest[i].uid == meUid, roleId: roleId),
            ),
          ),
      ],
    );
  }
}
