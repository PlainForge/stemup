// Firestore reads and writes, ported from firebaseService.ts and from the
// inline calls in RolePage, RoleAdmin, RolesSelectorPage, RoleJoinButton,
// TaskDoneButton, Dash, ProfilePage and BugReport. Collection paths and field
// names match the web app exactly, since both clients share one database.
import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../models/models.dart';

final _db = FirebaseFirestore.instance;

DocumentReference<Map<String, dynamic>> _user(String uid) => _db.doc('users/$uid');
DocumentReference<Map<String, dynamic>> _role(String id) => _db.doc('roles/$id');
DocumentReference<Map<String, dynamic>> _task(String id) => _db.doc('tasks/$id');
DocumentReference<Map<String, dynamic>> _submitted(String id) => _db.doc('tasksSubmitted/$id');
DocumentReference<Map<String, dynamic>> _reward(String id) => _db.doc('rewards/$id');
CollectionReference<Map<String, dynamic>> get _tasks => _db.collection('tasks');
CollectionReference<Map<String, dynamic>> get _submittedCol => _db.collection('tasksSubmitted');

Timestamp _inDays(int days) => Timestamp.fromDate(DateTime.now().add(Duration(days: days)));

/// Due dates are stored as 23:59:59 local time on the chosen day, and tasks
/// auto-delete a week after they fall due.
({Timestamp due, Timestamp deleteAt}) _dueFields(DateTime day) {
  final due = DateTime(day.year, day.month, day.day, 23, 59, 59);
  return (due: Timestamp.fromDate(due), deleteAt: Timestamp.fromDate(due.add(const Duration(days: 7))));
}

class Db {
  Db._();

  // ── Streams ────────────────────────────────────────────────────────────

  static Stream<UserData?> userStream(String uid) => _user(uid).snapshots().map((s) => s.exists ? UserData.fromDoc(s) : null);

  static Stream<List<String>> adminsStream() => _db
      .doc('admins/all-perms')
      .snapshots()
      .map((s) => s.exists ? List<String>.from((s.data()?['ids'] as List?)?.whereType<String>() ?? const []) : <String>[]);

  static Stream<List<String>> instructorsStream() => _db
      .doc('admins/instructors')
      .snapshots()
      .map((s) => s.exists ? List<String>.from((s.data()?['ids'] as List?)?.whereType<String>() ?? const []) : <String>[]);

  static Stream<List<StemRequest>> _requests(Query<Map<String, dynamic>> q) => q.snapshots().map((s) {
    final list = s.docs.map(StemRequest.fromDoc).where((r) => r.type != null).toList();
    list.sort((a, b) => (a.createdAt ?? DateTime(0)).compareTo(b.createdAt ?? DateTime(0)));
    return list;
  });

  /// Everything waiting for an admin.
  static Stream<List<StemRequest>> requestsStream() => _requests(_db.collection('requests'));

  /// The signed-in user's own open requests.
  static Stream<List<StemRequest>> myRequestsStream(String uid) => _requests(_db.collection('requests').where('uid', isEqualTo: uid));

  /// Open requests about one role (a reset waiting for approval).
  static Stream<List<StemRequest>> roleRequestsStream(String roleId) =>
      _requests(_db.collection('requests').where('roleId', isEqualTo: roleId));

  /// Every profile (the Admin page's Users tab).
  static Stream<List<UserData>> allUsersStream() => _db.collection('users').snapshots().map((s) => s.docs.map(UserData.fromDoc).toList());

  static Stream<Role?> roleStream(String id) => _role(id).snapshots().map((s) => s.exists ? Role.fromDoc(s) : null);

  static Stream<List<Role>> rolesStream() => _db.collection('roles').snapshots().map((s) => s.docs.map(Role.fromDoc).toList());

  static Stream<List<Role>> globalViewerRolesStream() =>
      _db.collection('roles').where('showInGlobalLeaderboard', isEqualTo: true).snapshots().map((s) => s.docs.map(Role.fromDoc).toList());

  static Stream<Rewards> rewardsStream(String roleId) => _reward(roleId).snapshots().map(Rewards.fromDoc);

  static Stream<List<Task>> userRoleTasksStream(String roleId, String uid) => _tasks
      .where('roleId', isEqualTo: roleId)
      .where('assignedTo', isEqualTo: uid)
      .snapshots()
      .map((s) => s.docs.map(Task.fromDoc).toList());

  static Stream<List<Task>> roleTasksStream(String roleId) =>
      _tasks.where('roleId', isEqualTo: roleId).snapshots().map((s) => s.docs.map(Task.fromDoc).toList());

  static Stream<List<Task>> userIncompleteTasksStream(String uid) => _tasks
      .where('assignedTo', isEqualTo: uid)
      .where('complete', isEqualTo: false)
      .snapshots()
      .map((s) => s.docs.map(Task.fromDoc).toList());

  static Stream<List<SubmittedTask>> roleSubmittedStream(String roleId) =>
      _submittedCol.where('roleId', isEqualTo: roleId).snapshots().map((s) => s.docs.map(SubmittedTask.fromDoc).toList());

  static Stream<List<SubmittedTask>> userSubmittedStream(String uid) =>
      _submittedCol.where('assignedTo', isEqualTo: uid).snapshots().map((s) => s.docs.map(SubmittedTask.fromDoc).toList());

  static Stream<List<SubmittedTask>> allPendingSubmittedStream() =>
      _submittedCol.where('complete', isEqualTo: false).snapshots().map((s) => s.docs.map(SubmittedTask.fromDoc).toList());

  static Stream<List<LeaderboardSnapshot>> snapshotsStream(String roleId) =>
      _db.collection('leaderboardSnapshots').where('roleId', isEqualTo: roleId).snapshots().map((s) {
        // Sorted client-side so this doesn't need a composite index on roleId+createdAt
        final list = s.docs.map(LeaderboardSnapshot.fromDoc).toList();
        list.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
        return list;
      });

  static Stream<List<AlumniBatch>> alumniStream() => _db.collection('alumni').snapshots().map((s) {
    final list = s.docs.map(AlumniBatch.fromDoc).toList();
    list.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
    return list;
  });

  static Stream<List<Bug>> bugsStream() => _db.collection('bugs').snapshots().map((s) => s.docs.map(Bug.fromDoc).toList());

  /// Live profiles for a set of uids — one listener per user, as the web app does.
  static Stream<List<UserData>> usersStream(List<String> uids) {
    if (uids.isEmpty) return Stream.value(const []);
    final latest = <String, UserData>{};
    final controller = StreamController<List<UserData>>();
    final subs = <StreamSubscription>[];
    controller.onListen = () {
      for (final uid in uids) {
        subs.add(
          _user(uid).snapshots().listen((s) {
            if (s.exists) {
              latest[uid] = UserData.fromDoc(s);
            } else {
              latest.remove(uid);
            }
            controller.add(latest.values.toList());
          }),
        );
      }
    };
    controller.onCancel = () async {
      for (final s in subs) {
        await s.cancel();
      }
    };
    return controller.stream;
  }

  static Future<List<UserData>> getUsers(Iterable<String> uids) async {
    final snaps = await Future.wait(uids.map((uid) => _user(uid).get()));
    return snaps.where((s) => s.exists).map(UserData.fromDoc).toList();
  }

  static Future<List<Role>> getRoles() async => (await _db.collection('roles').get()).docs.map(Role.fromDoc).toList();

  static Future<Rewards> getRewards(String roleId) async => Rewards.fromDoc(await _reward(roleId).get());

  static Future<List<String>> _admins() async =>
      List<String>.from(((await _db.doc('admins/all-perms').get()).data()?['ids'] as List?)?.whereType<String>() ?? const []);

  // ── Roles (member side) ────────────────────────────────────────────────

  static Future<void> setCurrentRole(String uid, String roleId) => _user(uid).update({'currentRole': roleId});

  static Future<void> requestToJoin(String roleId, String uid) => _role(roleId).update({
    'pendingRequests': FieldValue.arrayUnion([uid]),
  });

  /// Admins can join any role directly, no approval needed.
  static Future<void> joinAsAdmin(Role role, String uid) async {
    await _role(role.id).set({
      'members': FieldValue.arrayUnion([uid]),
    }, SetOptions(merge: true));
    await _user(uid).update({
      'roles': FieldValue.arrayUnion([UserRoleData(id: role.id, name: role.name).toMap()]),
    });
  }

  /// Adds the role to a user's roles list if it isn't there yet.
  static Future<void> _addRoleToUser(String uid, String roleId, String roleName) async {
    final snap = await _user(uid).get();
    if (!snap.exists || UserData.fromDoc(snap).roleData(roleId) != null) return;
    await _user(uid).update({
      'roles': FieldValue.arrayUnion([UserRoleData(id: roleId, name: roleName).toMap()]),
    });
  }

  /// Creates a role. Every admin joins it; [ownerUid] (the instructor who asked
  /// for it) joins too and becomes its first instructor.
  static Future<String> createRole(String name, {String purpose = '', String? ownerUid}) async {
    final admins = await _admins();
    final members = {...admins, ?ownerUid}.toList();
    final ref = await _db.collection('roles').add({
      'name': name,
      'purpose': purpose,
      'members': members,
      'instructors': ownerUid != null && !admins.contains(ownerUid) ? [ownerUid] : <String>[],
      'createdBy': ownerUid ?? '',
      'pendingRequests': [],
      'createdAt': DateTime.now(),
    });
    await _reward(ref.id).set({'first': noReward, 'second': noReward, 'third': noReward});
    await Future.wait(members.map((uid) => _addRoleToUser(uid, ref.id, name)));
    return ref.id;
  }

  // ── Requests & instructor access ───────────────────────────────────────

  static Future<void> _addRequest(Map<String, dynamic> data) => _db.collection('requests').add({...data, 'createdAt': Timestamp.now()});

  static Future<void> requestInstructor(String uid, String userName, String reason) =>
      _addRequest({'type': 'instructor', 'uid': uid, 'userName': userName, 'reason': reason.trim()});

  static Future<void> requestRoleCreation(String uid, String userName, String roleName, String purpose) =>
      _addRequest({'type': 'createRole', 'uid': uid, 'userName': userName, 'roleName': roleName.trim(), 'purpose': purpose.trim()});

  static Future<void> requestRoleReset(String uid, String userName, Role role, String saveName) => _addRequest({
    'type': 'resetRole',
    'uid': uid,
    'userName': userName,
    'roleId': role.id,
    'roleName': role.name,
    'saveName': saveName.trim(),
  });

  /// Withdraws or declines a request.
  static Future<void> deleteRequest(String id) => _db.doc('requests/$id').delete();

  /// Carries out the request, then removes it.
  static Future<void> approveRequest(StemRequest r) async {
    switch (r.type) {
      case RequestType.instructor:
        await grantInstructor(r.uid);
      case RequestType.createRole:
        await createRole(r.roleName.isEmpty ? 'Untitled Role' : r.roleName, purpose: r.purpose, ownerUid: r.uid);
      case RequestType.resetRole:
        // The role may have been deleted since the request was made
        if (r.roleId.isNotEmpty && (await _role(r.roleId).get()).exists) {
          await resetRole(r.roleId, r.saveName.isEmpty ? 'Saved Data' : r.saveName);
        }
      case null:
        break;
    }
    await deleteRequest(r.id);
  }

  static Future<void> grantInstructor(String uid) async {
    await _db.doc('admins/instructors').set({
      'ids': FieldValue.arrayUnion([uid]),
    }, SetOptions(merge: true));
    // Any instructor request they had open is now settled
    final open = await _db.collection('requests').where('uid', isEqualTo: uid).where('type', isEqualTo: 'instructor').get();
    await Future.wait(open.docs.map((d) => d.reference.delete()));
  }

  /// Takes Instructor access away. They stay a member of their roles, but no longer run them.
  static Future<void> revokeInstructor(String uid) async {
    await _db.doc('admins/instructors').set({
      'ids': FieldValue.arrayRemove([uid]),
    }, SetOptions(merge: true));
    final led = await _db.collection('roles').where('instructors', arrayContains: uid).get();
    await Future.wait(
      led.docs.map(
        (d) => d.reference.update({
          'instructors': FieldValue.arrayRemove([uid]),
        }),
      ),
    );
  }

  /// Gives another instructor access to run this role (and makes them a member).
  static Future<void> addRoleInstructor(Role role, String uid) async {
    await _role(role.id).update({
      'instructors': FieldValue.arrayUnion([uid]),
      'members': FieldValue.arrayUnion([uid]),
      'pendingRequests': FieldValue.arrayRemove([uid]),
    });
    await _addRoleToUser(uid, role.id, role.name);
  }

  /// Stops an instructor running this role; they stay a member.
  static Future<void> removeRoleInstructor(String roleId, String uid) => _role(roleId).update({
    'instructors': FieldValue.arrayRemove([uid]),
  });

  static Future<void> setRewardsTitle(String roleId, String title) => _role(roleId).update({'rewardsTitle': title.trim()});

  static Future<void> setShowGlobalLeaderboard(String uid, bool value) => _user(uid).update({'showGlobalLeaderboard': value});

  // ── Tasks (member side) ────────────────────────────────────────────────

  static Future<void> setTaskStatus(String taskId, TaskStatus? status) =>
      _task(taskId).update({'status': status == null ? '' : status.label});

  static Future<void> requestExtension(String taskId) => _task(taskId).update({'extensionRequested': true});

  static Future<void> submitTask(Task task) async {
    await _submitted(task.id).set({
      'assignedTo': task.assignedTo,
      'assignedName': task.assignedName,
      'description': task.description,
      'points': task.points,
      'roleId': task.roleId,
      'submission': Timestamp.now(),
      'complete': false,
      'title': task.title,
    });
    // An overdue task that's just been submitted shouldn't disappear while it's awaiting review
    if (task.deleteAt != null) {
      await _task(task.id).update({'deleteAt': FieldValue.delete()});
    }
  }

  // ── Role admin ─────────────────────────────────────────────────────────

  static Future<void> assignTask({
    required Role role,
    required List<UserData> members,
    required String title,
    required String description,
    required int points,
    DateTime? dueDay,
  }) async {
    final due = dueDay == null ? null : _dueFields(dueDay);
    for (final m in members) {
      await _tasks.add({
        'assignedTo': m.uid,
        'assignedName': m.name,
        'description': description,
        'points': points,
        'roleId': role.id,
        'createdOn': Timestamp.now(),
        'complete': false,
        'title': title,
        if (due != null) 'dueDate': due.due,
        if (due != null) 'deleteAt': due.deleteAt,
      });
    }
  }

  static Future<void> renameRole(String roleId, String name) => _role(roleId).update({'name': name});

  static Future<void> acceptRequest(Role role, String uid) async {
    if (!(await _user(uid).get()).exists) return;
    await _role(role.id).update({
      'pendingRequests': FieldValue.arrayRemove([uid]),
    });
    await _role(role.id).set({
      'members': FieldValue.arrayUnion([uid]),
    }, SetOptions(merge: true));
    await _user(uid).update({
      'roles': FieldValue.arrayUnion([UserRoleData(id: role.id, name: role.name).toMap()]),
    });
  }

  static Future<void> declineRequest(String roleId, String uid) => _role(roleId).update({
    'pendingRequests': FieldValue.arrayRemove([uid]),
  });

  static Future<void> approveSubmission(SubmittedTask s) async {
    await _task(s.id).update({'complete': true, 'deleteAt': _inDays(365)});
    await _submitted(s.id).update({'complete': true});

    final snap = await _user(s.assignedTo).get();
    if (!snap.exists) return;
    final u = UserData.fromDoc(snap);
    final roles = u.roles
        .map((r) => r.id == s.roleId ? r.copyWith(points: r.points + s.points, taskCompleted: r.taskCompleted + 1) : r)
        .map((r) => r.toMap())
        .toList();
    await _user(s.assignedTo).update({'roles': roles, 'points': u.points + s.points, 'taskCompleted': u.taskCompleted + 1});
  }

  /// Declining sends the task back; the third decline closes it for good.
  static Future<void> declineSubmission(SubmittedTask s) async {
    final count = ((await _task(s.id).get()).data()?['declineCount'] as num?)?.toInt() ?? 0;
    final newCount = count + 1;
    if (newCount >= 3) {
      await _task(s.id).update({'complete': true, 'declineCount': newCount, 'deleteAt': _inDays(365), 'extensionRequested': false});
    } else {
      await _task(s.id).update({'declineCount': newCount});
    }
    await _submitted(s.id).delete();
  }

  /// Extensions give three more days at 60% of the original points.
  static Future<void> acceptExtension(Task task) => _task(
    task.id,
  ).update({'dueDate': _inDays(3), 'deleteAt': _inDays(10), 'extensionRequested': false, 'points': (task.points * 0.6).round()});

  static Future<void> declineExtension(String taskId) => _task(taskId).update({'extensionDeclined': true, 'extensionRequested': false});

  static Future<void> removeTask(String taskId) => Future.wait([_task(taskId).delete(), _submitted(taskId).delete()]);

  /// Edits an unfinished task, and any pending submission so approval awards the new points.
  static Future<void> editTask(
    Task task, {
    required String title,
    required String description,
    required int points,
    DateTime? dueDay,
    required bool hasPendingSubmission,
  }) async {
    final fields = {'title': title, 'description': description, 'points': points};
    if (dueDay != null) {
      final due = _dueFields(dueDay);
      await _task(task.id).update({...fields, 'dueDate': due.due, 'deleteAt': due.deleteAt});
    } else {
      await _task(task.id).update({...fields, 'dueDate': FieldValue.delete(), 'deleteAt': FieldValue.delete()});
    }
    if (hasPendingSubmission) await _submitted(task.id).update(fields);
  }

  /// Hands an unfinished, not-yet-submitted task to another member, clearing progress state.
  static Future<void> reassignTask(String taskId, UserData to) => _task(taskId).update({
    'assignedTo': to.uid,
    'assignedName': to.name,
    'status': FieldValue.delete(),
    'extensionRequested': FieldValue.delete(),
    'extensionDeclined': FieldValue.delete(),
  });

  static Future<void> setRewards(String roleId, String first, String second, String third) =>
      _reward(roleId).update({'first': first, 'second': second, 'third': third});

  static Future<void> setShowInGlobal(String roleId, bool value) => _role(roleId).update({'showInGlobalLeaderboard': value});

  /// Updates a member's stats for one role; with [alsoGlobal], the same delta
  /// is applied to their global totals.
  static Future<void> setMemberRoleStats(
    String uid,
    String roleId, {
    required int points,
    required int tasks,
    required bool alsoGlobal,
  }) async {
    final snap = await _user(uid).get();
    if (!snap.exists) return;
    final u = UserData.fromDoc(snap);
    final current = u.roleData(roleId);
    final roles = u.roles.map((r) => r.id == roleId ? r.copyWith(points: points, taskCompleted: tasks) : r).map((r) => r.toMap()).toList();
    await _user(uid).update({
      'roles': roles,
      if (alsoGlobal) 'points': (u.points + points - (current?.points ?? 0)).clamp(0, 1 << 31),
      if (alsoGlobal) 'taskCompleted': (u.taskCompleted + tasks - (current?.taskCompleted ?? 0)).clamp(0, 1 << 31),
    });
  }

  static Future<void> setGlobalStats(String uid, {required int points, required int tasks}) =>
      _user(uid).update({'points': points, 'taskCompleted': tasks});

  /// Saves the role's leaderboard under [saveName] (the Saved Data tab), then
  /// clears its tasks, submissions and prizes and zeroes every member's points
  /// and task count for it. Global totals are untouched.
  static Future<void> resetRole(String roleId, String saveName) async {
    final roleSnap = await _role(roleId).get();
    if (!roleSnap.exists) return;
    final role = Role.fromDoc(roleSnap);
    final admins = await _admins();
    final members = await getUsers(role.members);
    final ranked = members.where((u) => !admins.contains(u.uid) && !role.instructors.contains(u.uid)).map((u) => u.withRoleStats(roleId)).toList()
      ..sort((a, b) => b.points.compareTo(a.points));

    await _db.collection('leaderboardSnapshots').add({
      'roleId': roleId,
      'name': saveName,
      'month': DateFormat('MMMM y', 'en_US').format(DateTime.now()),
      'createdAt': Timestamp.now(),
      'entries': [
        for (var i = 0; i < ranked.length; i++)
          {
            'uid': ranked[i].uid,
            'name': ranked[i].name,
            'photoURL': ranked[i].photoURL,
            'points': ranked[i].points,
            'taskCompleted': ranked[i].taskCompleted,
            'rank': i + 1,
          },
      ],
    });

    final writes = <Future<void>>[];
    final results = await Future.wait([
      _tasks.where('roleId', isEqualTo: roleId).get(),
      _submittedCol.where('roleId', isEqualTo: roleId).get(),
    ]);
    for (final snap in results) {
      for (final d in snap.docs) {
        writes.add(d.reference.delete());
      }
    }
    writes.add(_reward(roleId).set({'first': noReward, 'second': noReward, 'third': noReward}, SetOptions(merge: true)));
    for (final u in members) {
      if (u.roleData(roleId) == null) continue;
      final roles = u.roles.map((r) => r.id == roleId ? r.copyWith(points: 0, taskCompleted: 0) : r).map((r) => r.toMap()).toList();
      writes.add(_user(u.uid).update({'roles': roles}));
    }
    await Future.wait(writes);
  }

  /// Deletes a role with its tasks, submissions, prizes, saved data and open requests.
  static Future<void> deleteRole(String roleId) async {
    final roleSnap = await _role(roleId).get();
    final memberIds = roleSnap.exists ? Role.fromDoc(roleSnap).members : const <String>[];
    final writes = <Future<void>>[];
    for (final u in await getUsers(memberIds)) {
      writes.add(
        _user(u.uid).update({
          'roles': u.roles.where((r) => r.id != roleId).map((r) => r.toMap()).toList(),
          if (u.currentRole == roleId) 'currentRole': '',
        }),
      );
    }
    final results = await Future.wait([
      _tasks.where('roleId', isEqualTo: roleId).get(),
      _submittedCol.where('roleId', isEqualTo: roleId).get(),
      _db.collection('leaderboardSnapshots').where('roleId', isEqualTo: roleId).get(),
      _db.collection('requests').where('roleId', isEqualTo: roleId).get(),
    ]);
    for (final snap in results) {
      for (final d in snap.docs) {
        writes.add(d.reference.delete());
      }
    }
    await Future.wait(writes);
    await _reward(roleId).delete().catchError((_) {});
    await _role(roleId).delete();
  }

  static Future<void> kickUserFromRole(String roleId, String uid) async {
    // Admins always stay in every role
    if ((await _admins()).contains(uid)) return;

    final batch = _db.batch();
    batch.update(_role(roleId), {
      'members': FieldValue.arrayRemove([uid]),
      'instructors': FieldValue.arrayRemove([uid]),
    });

    final snap = await _user(uid).get();
    if (snap.exists) {
      final u = UserData.fromDoc(snap);
      await _user(uid).update({
        'roles': u.roles.where((r) => r.id != roleId).map((r) => r.toMap()).toList(),
        if (u.currentRole == roleId) 'currentRole': '',
      });
    }

    final results = await Future.wait([
      _tasks.where('roleId', isEqualTo: roleId).where('assignedTo', isEqualTo: uid).get(),
      // The web version filters on a nonexistent "userId" field, so it never finds these
      _submittedCol.where('roleId', isEqualTo: roleId).where('assignedTo', isEqualTo: uid).get(),
    ]);
    for (final s in results) {
      for (final d in s.docs) {
        batch.delete(d.reference);
      }
    }
    await batch.commit();
  }

  // ── Global leaderboard / old users ─────────────────────────────────────

  /// Removes a live user from global. Admins and anyone who can see the global
  /// leaderboard always stay in it; returns false for them.
  static Future<bool> removeFromGlobalRole(String uid) async {
    final admins = await _admins();
    final viewers = await _db.collection('roles').where('showInGlobalLeaderboard', isEqualTo: true).get();
    final isProtected = admins.contains(uid) || viewers.docs.any((d) => Role.fromDoc(d).members.contains(uid));
    if (isProtected) return false;

    final snap = await _user(uid).get();
    final roles = UserData.fromMap(uid, snap.data() ?? {}).roles.where((r) => r.id != globalRoleId).map((r) => r.toMap()).toList();
    await Future.wait([
      _role(globalRoleId).update({
        'members': FieldValue.arrayRemove([uid]),
      }),
      _user(uid).update({'roles': roles}),
    ]);
    return true;
  }

  static Future<void> restoreLiveUserToGlobal(String uid) => Future.wait([
    _role(globalRoleId).update({
      'members': FieldValue.arrayUnion([uid]),
    }),
    _user(uid).update({
      'roles': FieldValue.arrayUnion([const UserRoleData(id: globalRoleId, name: 'global').toMap()]),
    }),
  ]);

  static Future<void> restoreAlumniMemberToGlobal(String batchId, String uid) async {
    final memberRef = _db.doc('alumni/$batchId/members/$uid');
    final snap = await memberRef.get();
    if (!snap.exists) return;
    final d = snap.data()!;
    await Future.wait([
      _user(uid).set({
        'name': d['name'] ?? 'Unknown User',
        'email': d['email'] ?? '',
        'photoURL': d['photoURL'] ?? defaultAvatar,
        'points': d['points'] ?? 0,
        'taskCompleted': d['taskCompleted'] ?? 0,
        'roles': [const UserRoleData(id: globalRoleId, name: 'global').toMap()],
        'currentRole': '',
        'createdAt': Timestamp.now(),
      }),
      _role(globalRoleId).update({
        'members': FieldValue.arrayUnion([uid]),
      }),
      memberRef.delete(),
      _db.doc('alumni/$batchId').update({'memberCount': FieldValue.increment(-1)}),
    ]);
  }

  static Future<List<OldUserRow>> loadOldUsers(List<String> admins) async {
    final results = await Future.wait([
      _db.collection('users').get(),
      _db.collection('alumni').get(),
      _db.collectionGroup('members').get(),
    ]);
    final batchNames = {for (final d in results[1].docs) d.id: AlumniBatch.fromDoc(d).name};

    final live = results[0].docs
        .map(UserData.fromDoc)
        .where((u) => !u.isInGlobal && !admins.contains(u.uid))
        .map((u) => OldUserRow(uid: u.uid, name: u.name, photoURL: u.photoURL, points: u.points, taskCompleted: u.taskCompleted));

    final alumni = results[2].docs.where((d) => d.reference.parent.parent != null).map((d) {
      final m = AlumniMember.fromDoc(d);
      final batchId = d.reference.parent.parent!.id;
      return OldUserRow(
        uid: d.id,
        name: m.name,
        photoURL: m.photoURL,
        points: m.points,
        taskCompleted: m.taskCompleted,
        batchId: batchId,
        batchName: batchNames[batchId] ?? 'Untitled Archive',
      );
    });

    return [...live, ...alumni]..sort((a, b) => a.name.compareTo(b.name));
  }

  // ── Alumni / semester reset ────────────────────────────────────────────

  static Future<(AlumniBatch?, List<AlumniMember>)> loadAlumniBatch(String batchId) async {
    final results = await Future.wait([_db.doc('alumni/$batchId').get(), _db.collection('alumni/$batchId/members').get()]);
    final batchSnap = results[0] as DocumentSnapshot<Map<String, dynamic>>;
    if (!batchSnap.exists) return (null, <AlumniMember>[]);
    final members = (results[1] as QuerySnapshot<Map<String, dynamic>>).docs.map(AlumniMember.fromDoc).toList()
      ..sort((a, b) => b.points.compareTo(a.points));
    return (AlumniBatch.fromDoc(batchSnap), members);
  }

  static Future<void> deleteAlumniBatch(String batchId) async {
    final members = await _db.collection('alumni/$batchId/members').get();
    await Future.wait([...members.docs.map((m) => m.reference.delete()), _db.doc('alumni/$batchId').delete()]);
  }

  static Future<({List<Map<String, dynamic>> raw, List<String> admins})> _resetInputs() async {
    final admins = await _admins();
    final users = await _db.collection('users').get();
    return (raw: users.docs.map((d) => {'id': d.id, ...d.data()}).toList(), admins: admins);
  }

  static Future<({List<String> roleNames, int usersToArchive, int usersToUpdate})> previewSemesterReset(List<String> removeRoleIds) async {
    final inputs = await _resetInputs();
    final plan = classifySemesterReset(inputs.raw, removeRoleIds.toSet(), inputs.admins);
    final names = await Future.wait(
      removeRoleIds.map((id) async {
        final s = await _role(id).get();
        return s.exists ? Role.fromDoc(s).name : id;
      }),
    );
    return (roleNames: names, usersToArchive: plan.archive.length, usersToUpdate: plan.update.length);
  }

  /// See executeSemesterReset in firebaseService.ts for the full contract.
  static Future<({int archivedUsers, int updatedUsers, int deletedRoles, String batchId, String batchName})> executeSemesterReset(
    List<String> removeRoleIds,
    String batchName,
  ) async {
    final inputs = await _resetInputs();
    final removeSet = removeRoleIds.toSet();
    final plan = classifySemesterReset(inputs.raw, removeSet, inputs.admins);
    final byId = {for (final u in inputs.raw) u['id'] as String: u};

    final writes = <Future<void>>[];
    final batchRef = _db.collection('alumni').doc();

    for (final u in plan.update) {
      writes.add(
        _user(u.id).update({
          'roles': u.roles.map((r) => r.toMap()).toList(),
          'points': 0,
          'taskCompleted': 0,
          if (u.clearCurrentRole) 'currentRole': '',
        }),
      );
    }

    for (final uid in plan.archive) {
      final snap = byId[uid] ?? const {};
      final data = UserData.fromMap(uid, snap);
      writes.add(
        _db.doc('alumni/${batchRef.id}/members/$uid').set({
          'uid': uid,
          'name': snap['name'] ?? 'Unknown User',
          'email': snap['email'] ?? '',
          'photoURL': snap['photoURL'] ?? defaultAvatar,
          'points': data.points,
          'taskCompleted': data.taskCompleted,
        }),
      );
      for (final r in data.roles.where((r) => !removeSet.contains(r.id))) {
        writes.add(
          _role(r.id).update({
            'members': FieldValue.arrayRemove([uid]),
          }),
        );
      }
      final results = await Future.wait([
        _tasks.where('assignedTo', isEqualTo: uid).get(),
        _submittedCol.where('assignedTo', isEqualTo: uid).get(),
      ]);
      for (final s in results) {
        for (final d in s.docs) {
          writes.add(d.reference.delete());
        }
      }
      writes.add(_user(uid).delete());
    }

    final roleNames = <String>[];
    for (final roleId in removeRoleIds) {
      final results = await Future.wait([
        _tasks.where('roleId', isEqualTo: roleId).get(),
        _submittedCol.where('roleId', isEqualTo: roleId).get(),
      ]);
      for (final s in results) {
        for (final d in s.docs) {
          writes.add(d.reference.delete());
        }
      }
      final roleSnap = await _role(roleId).get();
      if (roleSnap.exists) roleNames.add(Role.fromDoc(roleSnap).name);
      if ((await _reward(roleId).get()).exists) writes.add(_reward(roleId).delete());
      writes.add(_role(roleId).delete());
    }

    writes.add(batchRef.set({'name': batchName, 'createdAt': Timestamp.now(), 'roleNames': roleNames, 'memberCount': plan.archive.length}));

    await Future.wait(writes);
    return (
      archivedUsers: plan.archive.length,
      updatedUsers: plan.update.length,
      deletedRoles: removeRoleIds.length,
      batchId: batchRef.id,
      batchName: batchName,
    );
  }

  // ── Bugs ───────────────────────────────────────────────────────────────

  static Future<void> submitBug({required String title, required String desc, required String email, required String uid}) =>
      _db.collection('bugs').add({'bugTitle': title, 'bugDesc': desc, 'userEmail': email, 'userId': uid, 'createdAt': Timestamp.now()});

  static Future<void> dismissBug(String id) => _db.doc('bugs/$id').delete();
}

class OldUserRow {
  final String uid;
  final String name;
  final String photoURL;
  final int points;
  final int taskCompleted;

  /// Set for users archived in an Alumni batch; null for live users removed from global.
  final String? batchId;
  final String? batchName;

  const OldUserRow({
    required this.uid,
    required this.name,
    required this.photoURL,
    required this.points,
    required this.taskCompleted,
    this.batchId,
    this.batchName,
  });

  bool get isAlumni => batchId != null;
}

class ResetUpdate {
  final String id;
  final List<UserRoleData> roles;
  final bool clearCurrentRole;
  const ResetUpdate(this.id, this.roles, this.clearCurrentRole);
}

/// A user is archived only if every non-global role they belong to is being
/// removed; admins are never touched. Everyone else keeps their account with the
/// removed roles stripped and all points/tasks (per-role and global) zeroed.
({List<String> archive, List<ResetUpdate> update}) classifySemesterReset(
  List<Map<String, dynamic>> users,
  Set<String> removeRoleIds,
  List<String> admins,
) {
  final archive = <String>[];
  final update = <ResetUpdate>[];
  for (final raw in users) {
    final id = raw['id'] as String;
    if (admins.contains(id)) continue;
    final u = UserData.fromMap(id, raw);
    final nonGlobal = u.roles.where((r) => r.id != globalRoleId).toList();
    final remaining = nonGlobal.where((r) => !removeRoleIds.contains(r.id));
    if (nonGlobal.isNotEmpty && remaining.isEmpty) {
      archive.add(id);
      continue;
    }
    final surviving = u.roles.where((r) => !removeRoleIds.contains(r.id)).map((r) => r.copyWith(points: 0, taskCompleted: 0)).toList();
    update.add(ResetUpdate(id, surviving, u.currentRole.isNotEmpty && removeRoleIds.contains(u.currentRole)));
  }
  return (archive: archive, update: update);
}
