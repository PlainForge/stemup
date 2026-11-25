// Dart versions of src/myDataTypes.ts, plus the ad-hoc shapes the web pages
// declare inline (snapshots, alumni, bugs). Parsing is defensive because the
// documents are written by the JS client, which doesn't enforce a schema.
import 'package:cloud_firestore/cloud_firestore.dart';

const globalRoleId = 'r3wUbRSCX7cxwBYhtAdg';
const defaultAvatar = 'https://ui-avatars.com/api/?name=User&background=90caf9&color=fff';
const noReward = 'No reward set';

int _int(dynamic v) => v is num ? v.toInt() : 0;
String _str(dynamic v, [String fallback = '']) => v is String ? v : fallback;
List<String> _strList(dynamic v) => v is List ? v.whereType<String>().toList() : const [];
DateTime? _date(dynamic v) => v is Timestamp ? v.toDate() : null;

/// User < Instructor < Admin.
enum AccessLevel { user, instructor, admin }

extension AccessLevelLabel on AccessLevel {
  String get label => switch (this) {
    AccessLevel.user => 'User',
    AccessLevel.instructor => 'Instructor',
    AccessLevel.admin => 'Admin',
  };
}

/// Kinds of notification, each with its own switch in Settings. Names match
/// NotifyType in functions/src/notifications.ts.
enum NotifyType { newTask, taskEdited, taskReviewed, extension, joinRole, accessRequest }

extension NotifyTypeText on NotifyType {
  String get label => switch (this) {
    NotifyType.newTask => 'New tasks',
    NotifyType.taskEdited => 'Task changes',
    NotifyType.taskReviewed => 'Task submissions',
    NotifyType.extension => 'Extension requests',
    NotifyType.joinRole => 'Role join requests',
    NotifyType.accessRequest => 'Instructor and role requests',
  };

  String get hint => switch (this) {
    NotifyType.newTask => 'A task is assigned or handed to you',
    NotifyType.taskEdited => 'An instructor edits one of your tasks',
    NotifyType.taskReviewed => 'A task you submitted is approved or declined',
    NotifyType.extension => 'An extension you asked for is approved or declined',
    NotifyType.joinRole => 'A request to join a role is accepted or declined',
    NotifyType.accessRequest => 'Instructor access, new roles and role resets',
  };
}

/// The profile's `notifications` map. Push and email are off until turned on;
/// each kind is on unless switched off.
class NotificationPrefs {
  final bool push;
  final bool email;
  final Set<NotifyType> off;

  const NotificationPrefs({this.push = false, this.email = false, this.off = const {}});

  factory NotificationPrefs.fromMap(dynamic m) {
    if (m is! Map) return const NotificationPrefs();
    final types = m['types'] is Map ? m['types'] as Map : const {};
    return NotificationPrefs(
      push: m['push'] == true,
      email: m['email'] == true,
      off: {
        for (final t in NotifyType.values)
          if (types[t.name] == false) t,
      },
    );
  }

  bool isOn(NotifyType t) => !off.contains(t);
}

class UserRoleData {
  final String id;
  final String name;
  final int points;
  final int taskCompleted;

  const UserRoleData({required this.id, required this.name, this.points = 0, this.taskCompleted = 0});

  factory UserRoleData.fromMap(Map<String, dynamic> m) =>
      UserRoleData(id: _str(m['id']), name: _str(m['name']), points: _int(m['points']), taskCompleted: _int(m['taskCompleted']));

  Map<String, dynamic> toMap() => {'id': id, 'name': name, 'points': points, 'taskCompleted': taskCompleted};

  UserRoleData copyWith({int? points, int? taskCompleted}) =>
      UserRoleData(id: id, name: name, points: points ?? this.points, taskCompleted: taskCompleted ?? this.taskCompleted);
}

class UserData {
  final String uid;
  final String name;
  final String email;
  final String photoURL;
  final int points;
  final int taskCompleted;
  final List<UserRoleData> roles;
  final String currentRole;

  /// Instructors can hide the global leaderboard on Home; shown when unset.
  final bool showGlobalLeaderboard;

  /// Set by an admin so this person sees the global leaderboard on Home (admins and instructors already do).
  final bool canSeeGlobal;

  /// A new email waiting on its verification link; [email] changes only once it's clicked.
  final String pendingEmail;

  final NotificationPrefs notifications;

  const UserData({
    required this.uid,
    required this.name,
    this.email = '',
    this.photoURL = '',
    this.points = 0,
    this.taskCompleted = 0,
    this.roles = const [],
    this.currentRole = '',
    this.showGlobalLeaderboard = true,
    this.canSeeGlobal = false,
    this.pendingEmail = '',
    this.notifications = const NotificationPrefs(),
  });

  factory UserData.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) => UserData.fromMap(doc.id, doc.data() ?? {});

  factory UserData.fromMap(String uid, Map<String, dynamic> m) => UserData(
    uid: uid,
    name: _str(m['name'], 'Unknown User'),
    email: _str(m['email']),
    photoURL: _str(m['photoURL']),
    points: _int(m['points']),
    taskCompleted: _int(m['taskCompleted']),
    roles: m['roles'] is List
        ? (m['roles'] as List).whereType<Map>().map((r) => UserRoleData.fromMap(Map<String, dynamic>.from(r))).toList()
        : const [],
    currentRole: _str(m['currentRole']),
    showGlobalLeaderboard: m['showGlobalLeaderboard'] != false,
    canSeeGlobal: m['canSeeGlobal'] == true,
    pendingEmail: _str(m['pendingEmail']),
    notifications: NotificationPrefs.fromMap(m['notifications']),
  );

  UserRoleData? roleData(String roleId) {
    for (final r in roles) {
      if (r.id == roleId) return r;
    }
    return null;
  }

  bool get isInGlobal => roles.any((r) => r.id == globalRoleId);

  /// The same user, but with points/taskCompleted swapped for one role's stats —
  /// what the role page's leaderboard and profile card show.
  UserData withRoleStats(String roleId) {
    final r = roleData(roleId);
    return copyWith(points: r?.points ?? 0, taskCompleted: r?.taskCompleted ?? 0);
  }

  UserData copyWith({String? name, String? photoURL, int? points, int? taskCompleted, List<UserRoleData>? roles, String? currentRole}) =>
      UserData(
        uid: uid,
        name: name ?? this.name,
        email: email,
        photoURL: photoURL ?? this.photoURL,
        points: points ?? this.points,
        taskCompleted: taskCompleted ?? this.taskCompleted,
        roles: roles ?? this.roles,
        currentRole: currentRole ?? this.currentRole,
        showGlobalLeaderboard: showGlobalLeaderboard,
        canSeeGlobal: canSeeGlobal,
        pendingEmail: pendingEmail,
        notifications: notifications,
      );
}

class Role {
  final String id;
  final String name;
  final List<String> members;
  final List<String> pendingRequests;
  final bool showInGlobalLeaderboard;

  /// Instructors who run this role (its creator plus anyone they add). They're
  /// members too, but leaderboards leave them out, like admins.
  final List<String> instructors;
  final String createdBy;
  final String purpose;

  /// Heading on the Rewards tab; the current month when empty.
  final String rewardsTitle;

  const Role({
    required this.id,
    required this.name,
    this.members = const [],
    this.pendingRequests = const [],
    this.showInGlobalLeaderboard = false,
    this.instructors = const [],
    this.createdBy = '',
    this.purpose = '',
    this.rewardsTitle = '',
  });

  factory Role.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return Role(
      id: doc.id,
      name: _str(m['name'], 'Untitled Role'),
      members: _strList(m['members']),
      pendingRequests: _strList(m['pendingRequests']),
      showInGlobalLeaderboard: m['showInGlobalLeaderboard'] == true,
      instructors: _strList(m['instructors']),
      createdBy: _str(m['createdBy']),
      purpose: _str(m['purpose']),
      rewardsTitle: _str(m['rewardsTitle']).trim(),
    );
  }

  bool get isGlobal => name.contains('global');
}

enum TaskStatus { inProgress, almostDone }

extension TaskStatusLabel on TaskStatus {
  String get label => this == TaskStatus.inProgress ? 'In Progress' : 'Almost Done';
}

TaskStatus? _status(dynamic v) => switch (v) {
  'In Progress' => TaskStatus.inProgress,
  'Almost Done' => TaskStatus.almostDone,
  _ => null,
};

class Task {
  final String id;
  final String assignedTo;
  final String assignedName;
  final String title;
  final String description;
  final int points;
  final String roleId;
  final bool complete;
  final DateTime? createdOn;
  final TaskStatus? status;
  final DateTime? dueDate;
  final DateTime? deleteAt;
  final bool extensionRequested;
  final bool extensionDeclined;
  final int declineCount;

  const Task({
    required this.id,
    required this.assignedTo,
    required this.assignedName,
    required this.title,
    required this.description,
    required this.points,
    required this.roleId,
    required this.complete,
    this.createdOn,
    this.status,
    this.dueDate,
    this.deleteAt,
    this.extensionRequested = false,
    this.extensionDeclined = false,
    this.declineCount = 0,
  });

  factory Task.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return Task(
      id: doc.id,
      assignedTo: _str(m['assignedTo']),
      assignedName: _str(m['assignedName']),
      title: _str(m['title']),
      description: _str(m['description']),
      points: _int(m['points']),
      roleId: _str(m['roleId']),
      complete: m['complete'] == true,
      createdOn: _date(m['createdOn']),
      status: _status(m['status']),
      dueDate: _date(m['dueDate']),
      deleteAt: _date(m['deleteAt']),
      extensionRequested: m['extensionRequested'] == true,
      extensionDeclined: m['extensionDeclined'] == true,
      declineCount: _int(m['declineCount']),
    );
  }

  bool get isOverdue => !complete && dueDate != null && dueDate!.isBefore(DateTime.now());

  int? get daysUntilDeletion {
    if (deleteAt == null) return null;
    return (deleteAt!.difference(DateTime.now()).inMinutes / (60 * 24)).ceil();
  }
}

class SubmittedTask {
  final String id;
  final String assignedTo;
  final String assignedName;
  final String title;
  final String description;
  final int points;
  final String roleId;
  final bool complete;
  final DateTime? submission;

  const SubmittedTask({
    required this.id,
    required this.assignedTo,
    required this.assignedName,
    required this.title,
    required this.description,
    required this.points,
    required this.roleId,
    required this.complete,
    this.submission,
  });

  factory SubmittedTask.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return SubmittedTask(
      id: doc.id,
      assignedTo: _str(m['assignedTo']),
      assignedName: _str(m['assignedName']),
      title: _str(m['title']),
      description: _str(m['description']),
      points: _int(m['points']),
      roleId: _str(m['roleId']),
      complete: m['complete'] == true,
      submission: _date(m['submission']),
    );
  }
}

class Rewards {
  final List<String> places;
  const Rewards(this.places);

  static const empty = Rewards([noReward, noReward, noReward]);

  factory Rewards.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    if (!doc.exists) return empty;
    final m = doc.data() ?? {};
    String read(String k) {
      final v = _str(m[k]);
      return v.isEmpty ? noReward : v;
    }

    return Rewards([read('first'), read('second'), read('third')]);
  }

  static bool isRealPrize(String? reward) => reward != null && reward.isNotEmpty && reward != noReward && reward != 'not set';
}

class SnapshotEntry {
  final String uid;
  final String name;
  final String photoURL;
  final int points;
  final int taskCompleted;
  final int rank;

  const SnapshotEntry({
    required this.uid,
    required this.name,
    required this.photoURL,
    required this.points,
    required this.taskCompleted,
    required this.rank,
  });

  factory SnapshotEntry.fromMap(Map<String, dynamic> m) => SnapshotEntry(
    uid: _str(m['uid']),
    name: _str(m['name']),
    photoURL: _str(m['photoURL']),
    points: _int(m['points']),
    taskCompleted: _int(m['taskCompleted']),
    rank: _int(m['rank']),
  );
}

/// A role's leaderboard saved when it was reset (the role page's Saved Data tab).
class LeaderboardSnapshot {
  final String id;
  final String roleId;

  /// The name given when resetting; saves from before Saved Data only have [month].
  final String name;
  final String month;
  final DateTime? createdAt;
  final List<SnapshotEntry> entries;

  const LeaderboardSnapshot({
    required this.id,
    required this.roleId,
    this.name = '',
    required this.month,
    required this.createdAt,
    required this.entries,
  });

  String get title => name.isNotEmpty ? name : (month.isNotEmpty ? month : 'Saved Data');

  factory LeaderboardSnapshot.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return LeaderboardSnapshot(
      id: doc.id,
      roleId: _str(m['roleId']),
      name: _str(m['name']),
      month: _str(m['month']),
      createdAt: _date(m['createdAt']),
      entries: m['entries'] is List
          ? (m['entries'] as List).whereType<Map>().map((e) => SnapshotEntry.fromMap(Map<String, dynamic>.from(e))).toList()
          : const [],
    );
  }
}

class AlumniBatch {
  final String id;
  final String name;
  final DateTime? createdAt;
  final List<String> roleNames;
  final int memberCount;

  const AlumniBatch({required this.id, required this.name, this.createdAt, this.roleNames = const [], this.memberCount = 0});

  factory AlumniBatch.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return AlumniBatch(
      id: doc.id,
      name: _str(m['name'], 'Untitled Archive'),
      createdAt: _date(m['createdAt']),
      roleNames: _strList(m['roleNames']),
      memberCount: _int(m['memberCount']),
    );
  }
}

class AlumniMember {
  final String uid;
  final String name;
  final String photoURL;
  final int points;
  final int taskCompleted;

  const AlumniMember({required this.uid, required this.name, required this.photoURL, required this.points, required this.taskCompleted});

  factory AlumniMember.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return AlumniMember(
      uid: _str(m['uid'], doc.id),
      name: _str(m['name'], 'Unknown User'),
      photoURL: _str(m['photoURL']),
      points: _int(m['points']),
      taskCompleted: _int(m['taskCompleted']),
    );
  }
}

class Bug {
  final String id;
  final String bugTitle;
  final String bugDesc;
  final String userEmail;
  final String userId;

  const Bug({required this.id, required this.bugTitle, required this.bugDesc, required this.userEmail, required this.userId});

  factory Bug.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return Bug(
      id: doc.id,
      bugTitle: _str(m['bugTitle']),
      bugDesc: _str(m['bugDesc']),
      userEmail: _str(m['userEmail']),
      userId: _str(m['userId']),
    );
  }
}

enum RequestType { instructor, createRole, resetRole }

/// Something an admin has to approve, from the `requests` collection.
class StemRequest {
  final String id;
  final RequestType? type;
  final String uid;
  final String userName;
  final DateTime? createdAt;

  /// instructor: why they want to be one.
  final String reason;

  /// createRole: the new role's name and purpose. resetRole: the role's name.
  final String roleName;
  final String purpose;

  /// resetRole: which role, and the name to save its data under.
  final String roleId;
  final String saveName;

  const StemRequest({
    required this.id,
    required this.type,
    required this.uid,
    this.userName = '',
    this.createdAt,
    this.reason = '',
    this.roleName = '',
    this.purpose = '',
    this.roleId = '',
    this.saveName = '',
  });

  factory StemRequest.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return StemRequest(
      id: doc.id,
      type: switch (m['type']) {
        'instructor' => RequestType.instructor,
        'createRole' => RequestType.createRole,
        'resetRole' => RequestType.resetRole,
        _ => null,
      },
      uid: _str(m['uid']),
      userName: _str(m['userName']),
      createdAt: _date(m['createdAt']),
      reason: _str(m['reason']),
      roleName: _str(m['roleName']),
      purpose: _str(m['purpose']),
      roleId: _str(m['roleId']),
      saveName: _str(m['saveName']),
    );
  }
}
