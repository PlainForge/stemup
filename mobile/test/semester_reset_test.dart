import 'package:flutter_test/flutter_test.dart';
import 'package:stemup/models/models.dart';
import 'package:stemup/services/db.dart';

Map<String, dynamic> user(String id, List<String> roleIds, {String currentRole = ''}) => {
  'id': id,
  'name': id,
  'currentRole': currentRole,
  'points': 50,
  'taskCompleted': 5,
  'roles': [for (final r in roleIds) UserRoleData(id: r, name: r, points: 10, taskCompleted: 1).toMap()],
};

void main() {
  test('archives users whose only non-global roles are removed', () {
    final plan = classifySemesterReset(
      [
        user('a', [globalRoleId, 'r1']),
      ],
      {'r1'},
      [],
    );
    expect(plan.archive, ['a']);
    expect(plan.update, isEmpty);
  });

  test('keeps users with a surviving role, strips removed roles and zeroes stats', () {
    final plan = classifySemesterReset(
      [
        user('b', [globalRoleId, 'r1', 'r2'], currentRole: 'r1'),
      ],
      {'r1'},
      [],
    );
    expect(plan.archive, isEmpty);
    final u = plan.update.single;
    expect(u.roles.map((r) => r.id), [globalRoleId, 'r2']);
    expect(u.roles.every((r) => r.points == 0 && r.taskCompleted == 0), isTrue);
    expect(u.clearCurrentRole, isTrue);
  });

  test('global-only users are kept, and admins are never touched', () {
    final plan = classifySemesterReset(
      [
        user('c', [globalRoleId]),
        user('admin', ['r1']),
      ],
      {'r1'},
      ['admin'],
    );
    expect(plan.archive, isEmpty);
    expect(plan.update.map((u) => u.id), ['c']);
  });
}
