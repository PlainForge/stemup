// The icons and colors a role can have (Role.icon / Role.iconColor), picked by
// its instructors and admins from this list only, so nobody can upload one.
// Generated from src/lib/roleIcons.ts: keep the keys the same.
import 'package:flutter/cupertino.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';

import '../models/models.dart';

typedef RoleIconOption = ({String key, String label, IconData icon});
typedef RoleColorOption = ({String key, String label, Color color});

final List<({String title, List<RoleIconOption> icons})> roleIconGroups = [
  (
    title: 'Science & Tech',
    icons: [
      (key: 'robot', label: 'Robot', icon: FontAwesomeIcons.robot.data),
      (key: 'flask', label: 'Flask', icon: FontAwesomeIcons.flask.data),
      (key: 'atom', label: 'Atom', icon: FontAwesomeIcons.atom.data),
      (key: 'microscope', label: 'Microscope', icon: FontAwesomeIcons.microscope.data),
      (key: 'dna', label: 'DNA', icon: FontAwesomeIcons.dna.data),
      (key: 'calculator', label: 'Calculator', icon: FontAwesomeIcons.calculator.data),
      (key: 'laptopCode', label: 'Laptop', icon: FontAwesomeIcons.laptopCode.data),
      (key: 'code', label: 'Code', icon: FontAwesomeIcons.code.data),
      (key: 'microchip', label: 'Microchip', icon: FontAwesomeIcons.microchip.data),
      (key: 'gears', label: 'Gears', icon: FontAwesomeIcons.gears.data),
      (key: 'screwdriverWrench', label: 'Tools', icon: FontAwesomeIcons.screwdriverWrench.data),
      (key: 'hammer', label: 'Hammer', icon: FontAwesomeIcons.hammer.data),
      (key: 'rocket', label: 'Rocket', icon: FontAwesomeIcons.rocket.data),
      (key: 'satellite', label: 'Satellite', icon: FontAwesomeIcons.satellite.data),
      (key: 'bolt', label: 'Bolt', icon: FontAwesomeIcons.bolt.data),
      (key: 'lightbulb', label: 'Idea', icon: FontAwesomeIcons.lightbulb.data),
      (key: 'brain', label: 'Brain', icon: FontAwesomeIcons.brain.data),
      (key: 'chartLine', label: 'Chart', icon: FontAwesomeIcons.chartLine.data),
      (key: 'cubes', label: 'Cubes', icon: FontAwesomeIcons.cubes.data),
      (key: 'shapes', label: 'Shapes', icon: FontAwesomeIcons.shapes.data),
    ],
  ),
  (
    title: 'Arts & Media',
    icons: [
      (key: 'paintbrush', label: 'Paintbrush', icon: FontAwesomeIcons.paintbrush.data),
      (key: 'palette', label: 'Palette', icon: FontAwesomeIcons.palette.data),
      (key: 'pencil', label: 'Pencil', icon: FontAwesomeIcons.pencil.data),
      (key: 'feather', label: 'Feather', icon: FontAwesomeIcons.feather.data),
      (key: 'music', label: 'Music', icon: FontAwesomeIcons.music.data),
      (key: 'guitar', label: 'Guitar', icon: FontAwesomeIcons.guitar.data),
      (key: 'drum', label: 'Drum', icon: FontAwesomeIcons.drum.data),
      (key: 'microphone', label: 'Microphone', icon: FontAwesomeIcons.microphone.data),
      (key: 'camera', label: 'Camera', icon: FontAwesomeIcons.camera.data),
      (key: 'film', label: 'Film', icon: FontAwesomeIcons.film.data),
      (key: 'masksTheater', label: 'Theater', icon: FontAwesomeIcons.masksTheater.data),
      (key: 'newspaper', label: 'Newspaper', icon: FontAwesomeIcons.newspaper.data),
      (key: 'bookOpen', label: 'Book', icon: FontAwesomeIcons.bookOpen.data),
      (key: 'language', label: 'Language', icon: FontAwesomeIcons.language.data),
    ],
  ),
  (
    title: 'Sports & Games',
    icons: [
      (key: 'trophy', label: 'Trophy', icon: FontAwesomeIcons.trophy.data),
      (key: 'medal', label: 'Medal', icon: FontAwesomeIcons.medal.data),
      (key: 'futbol', label: 'Soccer', icon: FontAwesomeIcons.futbol.data),
      (key: 'basketball', label: 'Basketball', icon: FontAwesomeIcons.basketball.data),
      (key: 'baseball', label: 'Baseball', icon: FontAwesomeIcons.baseball.data),
      (key: 'volleyball', label: 'Volleyball', icon: FontAwesomeIcons.volleyball.data),
      (key: 'football', label: 'Football', icon: FontAwesomeIcons.football.data),
      (key: 'personRunning', label: 'Running', icon: FontAwesomeIcons.personRunning.data),
      (key: 'personSwimming', label: 'Swimming', icon: FontAwesomeIcons.personSwimming.data),
      (key: 'bicycle', label: 'Cycling', icon: FontAwesomeIcons.bicycle.data),
      (key: 'dumbbell', label: 'Fitness', icon: FontAwesomeIcons.dumbbell.data),
      (key: 'chessKnight', label: 'Chess', icon: FontAwesomeIcons.chessKnight.data),
      (key: 'puzzlePiece', label: 'Puzzle', icon: FontAwesomeIcons.puzzlePiece.data),
      (key: 'gamepad', label: 'Gaming', icon: FontAwesomeIcons.gamepad.data),
      (key: 'dice', label: 'Dice', icon: FontAwesomeIcons.dice.data),
    ],
  ),
  (
    title: 'Clubs & Community',
    icons: [
      (key: 'users', label: 'Team', icon: FontAwesomeIcons.users.data),
      (key: 'peopleGroup', label: 'Group', icon: FontAwesomeIcons.peopleGroup.data),
      (key: 'comments', label: 'Discussion', icon: FontAwesomeIcons.comments.data),
      (key: 'handHoldingHeart', label: 'Volunteering', icon: FontAwesomeIcons.handHoldingHeart.data),
      (key: 'heart', label: 'Heart', icon: FontAwesomeIcons.heart.data),
      (key: 'graduationCap', label: 'Graduation', icon: FontAwesomeIcons.graduationCap.data),
      (key: 'briefcase', label: 'Business', icon: FontAwesomeIcons.briefcase.data),
      (key: 'scaleBalanced', label: 'Debate', icon: FontAwesomeIcons.scaleBalanced.data),
      (key: 'landmark', label: 'Government', icon: FontAwesomeIcons.landmark.data),
      (key: 'globe', label: 'Globe', icon: FontAwesomeIcons.globe.data),
      (key: 'stethoscope', label: 'Medicine', icon: FontAwesomeIcons.stethoscope.data),
      (key: 'heartPulse', label: 'Health', icon: FontAwesomeIcons.heartPulse.data),
      (key: 'utensils', label: 'Cooking', icon: FontAwesomeIcons.utensils.data),
      (key: 'mugHot', label: 'Café', icon: FontAwesomeIcons.mugHot.data),
      (key: 'flag', label: 'Flag', icon: FontAwesomeIcons.flag.data),
      (key: 'star', label: 'Star', icon: FontAwesomeIcons.star.data),
      (key: 'crown', label: 'Crown', icon: FontAwesomeIcons.crown.data),
    ],
  ),
  (
    title: 'Nature & More',
    icons: [
      (key: 'leaf', label: 'Leaf', icon: FontAwesomeIcons.leaf.data),
      (key: 'seedling', label: 'Seedling', icon: FontAwesomeIcons.seedling.data),
      (key: 'tree', label: 'Tree', icon: FontAwesomeIcons.tree.data),
      (key: 'recycle', label: 'Recycling', icon: FontAwesomeIcons.recycle.data),
      (key: 'earthAmericas', label: 'Earth', icon: FontAwesomeIcons.earthAmericas.data),
      (key: 'mountain', label: 'Mountain', icon: FontAwesomeIcons.mountain.data),
      (key: 'compass', label: 'Compass', icon: FontAwesomeIcons.compass.data),
      (key: 'paw', label: 'Animals', icon: FontAwesomeIcons.paw.data),
      (key: 'sun', label: 'Sun', icon: FontAwesomeIcons.sun.data),
      (key: 'moon', label: 'Moon', icon: FontAwesomeIcons.moon.data),
      (key: 'fire', label: 'Fire', icon: FontAwesomeIcons.fire.data),
    ],
  ),
];

const List<RoleColorOption> roleColors = [
  (key: 'blue', label: 'Blue', color: Color(0xFF2563EB)),
  (key: 'sky', label: 'Sky', color: Color(0xFF0284C7)),
  (key: 'cyan', label: 'Cyan', color: Color(0xFF0891B2)),
  (key: 'teal', label: 'Teal', color: Color(0xFF0D9488)),
  (key: 'emerald', label: 'Emerald', color: Color(0xFF059669)),
  (key: 'green', label: 'Green', color: Color(0xFF16A34A)),
  (key: 'lime', label: 'Lime', color: Color(0xFF65A30D)),
  (key: 'amber', label: 'Amber', color: Color(0xFFD97706)),
  (key: 'orange', label: 'Orange', color: Color(0xFFEA580C)),
  (key: 'red', label: 'Red', color: Color(0xFFDC2626)),
  (key: 'rose', label: 'Rose', color: Color(0xFFE11D48)),
  (key: 'pink', label: 'Pink', color: Color(0xFFDB2777)),
  (key: 'fuchsia', label: 'Fuchsia', color: Color(0xFFC026D3)),
  (key: 'purple', label: 'Purple', color: Color(0xFF9333EA)),
  (key: 'violet', label: 'Violet', color: Color(0xFF7C3AED)),
  (key: 'indigo', label: 'Indigo', color: Color(0xFF4F46E5)),
  (key: 'slate', label: 'Slate', color: Color(0xFF475569)),
];

const defaultRoleIcon = 'users';
const defaultRoleColor = 'blue';

final Map<String, RoleIconOption> _icons = {
  for (final g in roleIconGroups)
    for (final i in g.icons) i.key: i,
};
final Map<String, RoleColorOption> _colors = {for (final c in roleColors) c.key: c};

/// An icon and color, falling back to the defaults for unset or unknown keys.
({RoleIconOption icon, RoleColorOption color}) roleLook(String icon, String color) =>
    (icon: _icons[icon] ?? _icons[defaultRoleIcon]!, color: _colors[color] ?? _colors[defaultRoleColor]!);

/// A role's icon in its color: a soft tinted badge, or a solid one when [solid]
/// (e.g. the role you're currently in).
class RoleIconBadge extends StatelessWidget {
  const RoleIconBadge({super.key, required this.icon, required this.color, this.size = 40, this.solid = false});

  RoleIconBadge.of(Role role, {Key? key, double size = 40, bool solid = false})
    : this(key: key, icon: role.icon, color: role.iconColor, size: size, solid: solid);

  final String icon;
  final String color;
  final double size;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final look = roleLook(icon, color);
    final c = look.color.color;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: size,
      height: size,
      decoration: BoxDecoration(color: solid ? c : c.withValues(alpha: .14), borderRadius: BorderRadius.circular(size * .3)),
      alignment: Alignment.center,
      child: Icon(look.icon.icon, size: size * .42, color: solid ? const Color(0xFFFFFFFF) : c),
    );
  }
}

/// The icon change a roleIcon request asks for: the role's current icon, then the new one.
class RoleIconChange extends StatelessWidget {
  const RoleIconChange({super.key, required this.role, required this.request});

  final Role? role;
  final StemRequest request;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8, bottom: 2),
    child: Row(
      children: [
        RoleIconBadge(icon: role?.icon ?? '', color: role?.iconColor ?? '', size: 32, solid: true),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 8),
          child: Icon(CupertinoIcons.arrow_right, size: 14, color: Color(0xFF9CA3AF)),
        ),
        RoleIconBadge(icon: request.icon, color: request.iconColor, size: 32, solid: true),
      ],
    ),
  );
}
