// Dart versions of src/myDataTypes.ts, plus the ad-hoc shapes the web pages
// declare inline (snapshots, alumni, bugs). Parsing is defensive because the
// documents are written by the JS client, which doesn't enforce a schema.
import 'package:cloud_firestore/cloud_firestore.dart';

const globalRoleId = 'r3wUbRSCX7cxwBYhtAdg';
const defaultAvatar = 'https://ui-avatars.com/api/?name=User&background=90caf9&color=fff';
const noReward = 'No reward set';

/// Longest chat or thread message (also checked by the Firestore rules).
const maxMessageLength = 2000;

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
/// [roleChat] and [taskThread] come as push notifications only, never email.
enum NotifyType { newTask, taskEdited, taskReviewed, extension, joinRole, accessRequest, invite, roleChat, taskThread }

extension NotifyTypeText on NotifyType {
  String get label => switch (this) {
    NotifyType.newTask => 'New tasks',
    NotifyType.taskEdited => 'Task changes',
    NotifyType.taskReviewed => 'Task submissions',
    NotifyType.extension => 'Extension requests',
    NotifyType.joinRole => 'Role join requests',
    NotifyType.accessRequest => 'Instructor and role requests',
    NotifyType.invite => 'Role invitations',
    NotifyType.roleChat => 'Group chat messages',
    NotifyType.taskThread => 'Task questions',
  };

  String get hint => switch (this) {
    NotifyType.newTask => 'A task is assigned or handed to you',
    NotifyType.taskEdited => 'An instructor edits one of your tasks',
    NotifyType.taskReviewed => 'A task you submitted is approved or declined',
    NotifyType.extension => 'An extension you asked for is approved or declined',
    NotifyType.joinRole => 'A request to join a role is accepted or declined',
    NotifyType.accessRequest => 'Instructor access, new roles and role resets',
    NotifyType.invite => 'Someone invites you to join a role',
    NotifyType.roleChat => "New messages in a role's group chat (never by email)",
    NotifyType.taskThread => 'A new message on one of your tasks (never by email)',
  };
}

/// The profile's `notifications` map. Push and email are off until turned on;
/// each kind is on unless switched off.
class NotificationPrefs {
  final bool push;
  final bool email;
  final Set<NotifyType> off;

  /// Roles (by id) whose notifications are turned off on the role's Notifications tab.
  final Set<String> rolesOff;

  /// Admins only: email them every new bug report and feature request (off unless turned on).
  final bool feedbackEmails;

  const NotificationPrefs({
    this.push = false,
    this.email = false,
    this.off = const {},
    this.rolesOff = const {},
    this.feedbackEmails = false,
  });

  factory NotificationPrefs.fromMap(dynamic m) {
    if (m is! Map) return const NotificationPrefs();
    final types = m['types'] is Map ? m['types'] as Map : const {};
    final roles = m['roles'] is Map ? m['roles'] as Map : const {};
    return NotificationPrefs(
      push: m['push'] == true,
      email: m['email'] == true,
      feedbackEmails: m['feedbackEmails'] == true,
      off: {
        for (final t in NotifyType.values)
          if (types[t.name] == false) t,
      },
      rolesOff: {
        for (final e in roles.entries)
          if (e.value == false && e.key is String) e.key as String,
      },
    );
  }

  bool isOn(NotifyType t) => !off.contains(t);

  /// Notifications about a role are on unless turned off on its Notifications tab.
  bool roleIsOn(String roleId) => !rolesOff.contains(roleId);
}

/// Anyone shown on a leaderboard.
abstract interface class Ranked {
  int get points;
  String get name;
}

/// Leaderboard order: most points first; ties go alphabetically by name, ignoring case.
int byPointsThenName(Ranked a, Ranked b) {
  final byPoints = b.points.compareTo(a.points);
  return byPoints != 0 ? byPoints : a.name.toLowerCase().compareTo(b.name.toLowerCase());
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

class UserData implements Ranked {
  final String uid;
  @override
  final String name;
  final String email;
  final String photoURL;
  @override
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

  /// Roles whose rewards and top 3 they've hidden from Home (each role's Settings tab).
  final List<String> hideOnHome;

  /// Tasks this person has given out as an instructor or admin (counted by a Cloud Function).
  final int tasksGiven;

  /// A short, optional bio (200 words at most), set in Settings > Profile and shown on their card.
  final String aboutMe;

  /// Roles they've hidden from their card and user page (each role's Settings tab).
  /// Admins and the role's instructors still see them.
  final List<String> hideOnProfile;

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
    this.hideOnHome = const [],
    this.tasksGiven = 0,
    this.aboutMe = '',
    this.hideOnProfile = const [],
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
    hideOnHome: m['hideOnHome'] is List ? (m['hideOnHome'] as List).whereType<String>().toList() : const [],
    tasksGiven: _int(m['tasksGiven']),
    aboutMe: _str(m['aboutMe']).trim(),
    hideOnProfile: _strList(m['hideOnProfile']),
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
        hideOnHome: hideOnHome,
        tasksGiven: tasksGiven,
        aboutMe: aboutMe,
        hideOnProfile: hideOnProfile,
      );
}

class Role {
  final String id;
  final String name;
  final List<String> members;
  final List<String> pendingRequests;
  final bool showInGlobalLeaderboard;

  /// Hidden from the Roles screen for anyone not in it: people only join through
  /// an invitation (an owner or admin setting).
  final bool inviteOnly;

  /// Instructors who run this role (its creator plus anyone they add). They're
  /// members too, but leaderboards leave them out, like admins.
  final List<String> instructors;
  final String createdBy;

  /// The instructor who owns this role, set by admins (null when the field is
  /// missing, so older roles fall back to [createdBy]; '' means none). Use [owner].
  final String? ownerField;
  final String purpose;

  /// Heading on the Rewards tab; the current month when empty.
  final String rewardsTitle;

  /// Its icon and color (keys from widgets/role_icons.dart); '' for the defaults.
  final String icon;
  final String iconColor;

  /// A group chat for everyone in the role (off unless its owner or an admin turns it on).
  final bool chatEnabled;

  /// Each task gets a thread between the person doing it and whoever gave it
  /// (off unless its owner or an admin turns it on).
  final bool taskThreadsEnabled;

  const Role({
    required this.id,
    required this.name,
    this.members = const [],
    this.pendingRequests = const [],
    this.showInGlobalLeaderboard = false,
    this.inviteOnly = false,
    this.instructors = const [],
    this.createdBy = '',
    this.ownerField,
    this.purpose = '',
    this.rewardsTitle = '',
    this.icon = '',
    this.iconColor = '',
    this.chatEnabled = false,
    this.taskThreadsEnabled = false,
  });

  factory Role.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return Role(
      id: doc.id,
      name: _str(m['name'], 'Untitled Role'),
      members: _strList(m['members']),
      pendingRequests: _strList(m['pendingRequests']),
      showInGlobalLeaderboard: m['showInGlobalLeaderboard'] == true,
      inviteOnly: m['inviteOnly'] == true,
      instructors: _strList(m['instructors']),
      createdBy: _str(m['createdBy']),
      ownerField: m['owner'] is String ? m['owner'] as String : null,
      purpose: _str(m['purpose']),
      rewardsTitle: _str(m['rewardsTitle']).trim(),
      icon: _str(m['icon']),
      iconColor: _str(m['iconColor']),
      chatEnabled: m['chatEnabled'] == true,
      taskThreadsEnabled: m['taskThreadsEnabled'] == true,
    );
  }

  bool messagingOn(MessagingFeature f) => f == MessagingFeature.chat ? chatEnabled : taskThreadsEnabled;

  bool get isGlobal => name.contains('global');

  /// The role's owner: its other instructors ask them before bigger changes.
  /// '' when it has none (or the owner no longer runs the role).
  String get owner {
    final o = ownerField ?? createdBy;
    return o.isNotEmpty && instructors.contains(o) ? o : '';
  }
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

  /// Who gave it ('' on older tasks, from before this was recorded).
  final String assignedBy;

  /// Its thread (tasks/{id}/messages): how many messages and who wrote the
  /// latest (kept by the notifyOnTaskMessage Cloud Function).
  final int messageCount;
  final String lastMessageBy;

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
    this.assignedBy = '',
    this.messageCount = 0,
    this.lastMessageBy = '',
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
      assignedBy: _str(m['assignedBy']),
      messageCount: _int(m['messageCount']),
      lastMessageBy: _str(m['lastMessageBy']),
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

class AlumniMember implements Ranked {
  final String uid;
  @override
  final String name;
  final String photoURL;
  @override
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

/// What someone sends from Settings > App (the bugs collection's `type`).
enum FeedbackType { bug, feature }

class Bug {
  final String id;

  /// Reports from before feature requests have no type and are bugs.
  final FeedbackType type;
  final String bugTitle;
  final String bugDesc;
  final String userEmail;
  final String userId;

  final DateTime? createdAt;

  const Bug({
    required this.id,
    this.type = FeedbackType.bug,
    this.createdAt,
    required this.bugTitle,
    required this.bugDesc,
    required this.userEmail,
    required this.userId,
  });

  factory Bug.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return Bug(
      id: doc.id,
      type: m['type'] == 'feature' ? FeedbackType.feature : FeedbackType.bug,
      createdAt: m['createdAt'] is Timestamp ? (m['createdAt'] as Timestamp).toDate() : null,
      bugTitle: _str(m['bugTitle']),
      bugDesc: _str(m['bugDesc']),
      userEmail: _str(m['userEmail']),
      userId: _str(m['userId']),
    );
  }
}

enum RequestType { instructor, createRole, resetRole, renameRole, editStats, kickMember, rewardsTitle, roleIcon, roleMessaging }

extension RequestTypeInfo on RequestType {
  /// The value stored in Firestore.
  String get key => name;

  /// Changes a role's instructors ask its owner for (or admins, when it has none).
  bool get isRoleChange => this != RequestType.instructor && this != RequestType.createRole;

  String get label => switch (this) {
    RequestType.instructor => 'Instructor access',
    RequestType.createRole => 'New role',
    RequestType.resetRole => 'Role reset',
    RequestType.renameRole => 'Rename role',
    RequestType.editStats => 'Edit member stats',
    RequestType.kickMember => 'Kick member',
    RequestType.rewardsTitle => 'Rewards title',
    RequestType.roleIcon => 'Role icon',
    RequestType.roleMessaging => 'Role messaging',
  };
}

/// The two kinds of role messaging, each turned on in the role's Config. Names
/// match MessagingFeature in src/myDataTypes.ts.
enum MessagingFeature { chat, taskThreads }

extension MessagingFeatureText on MessagingFeature {
  String get label => this == MessagingFeature.chat ? 'Group chat' : 'Task questions';
}

/// Sending too fast: no more messages until [until] (thrown by Db.sendMessage).
class ChatTimeout implements Exception {
  const ChatTimeout(this.until);

  final DateTime until;
}

/// A message in a role's group chat (roles/{id}/messages) or a task's thread (tasks/{id}/messages).
class ChatMessage {
  final String id;
  final String uid;
  final String name;
  final String photoURL;
  final String text;

  /// Null for a message still on its way to the server.
  final DateTime? createdAt;

  const ChatMessage({required this.id, required this.uid, required this.name, this.photoURL = '', required this.text, this.createdAt});

  factory ChatMessage.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return ChatMessage(
      id: doc.id,
      uid: _str(m['uid']),
      name: _str(m['name'], 'Unknown User'),
      photoURL: _str(m['photoURL']),
      text: _str(m['text']),
      createdAt: _date(m['createdAt']),
    );
  }

  /// When it was sent (now, for one still sending).
  DateTime get at => createdAt ?? DateTime.now();
}

/// Something to approve, from the `requests` collection: by an admin, or by a
/// role's owner for changes to that role.
/// An invitation to join a role (invites/{roleId}_{uid}), sent by its
/// instructors or an admin. The person invited accepts or declines it.
class RoleInvite {
  final String id;
  final String roleId;
  final String roleName;

  /// Who's invited.
  final String uid;
  final String userName;

  /// Joining as one of the role's instructors (Instructors only) rather than a member.
  final bool asInstructor;
  final String invitedBy;
  final String invitedByName;
  final DateTime? createdAt;

  const RoleInvite({
    required this.id,
    required this.roleId,
    required this.roleName,
    required this.uid,
    this.userName = '',
    this.asInstructor = false,
    this.invitedBy = '',
    this.invitedByName = '',
    this.createdAt,
  });

  factory RoleInvite.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return RoleInvite(
      id: doc.id,
      roleId: _str(m['roleId']),
      roleName: _str(m['roleName']),
      uid: _str(m['uid']),
      userName: _str(m['userName']),
      asInstructor: m['as'] == 'instructor',
      invitedBy: _str(m['invitedBy']),
      invitedByName: _str(m['invitedByName']),
      createdAt: _date(m['createdAt']),
    );
  }
}

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

  /// Role changes: which role. resetRole: the name to save its data under.
  final String roleId;
  final String saveName;

  /// renameRole: the new name. rewardsTitle: the new title ('' goes back to the current month).
  final String newName;
  final String title;

  /// editStats and kickMember: the member it's about. editStats: their new stats in the role.
  final String targetUid;
  final String targetName;
  final int points;
  final int taskCompleted;

  /// roleIcon: the icon and color asked for (keys from widgets/role_icons.dart).
  final String icon;
  final String iconColor;

  /// roleMessaging: which kind of messaging, and whether to turn it on or off.
  final MessagingFeature? feature;
  final bool enabled;

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
    this.newName = '',
    this.title = '',
    this.targetUid = '',
    this.targetName = '',
    this.points = 0,
    this.taskCompleted = 0,
    this.icon = '',
    this.iconColor = '',
    this.feature,
    this.enabled = false,
  });

  /// What a role change asks for, e.g. `rename Robotics to "Drones"` (kept in
  /// sync with roleChangeAction in src/lib/roleService.ts).
  String get roleChangeAction {
    final role = roleName.isEmpty ? 'this role' : roleName;
    final who = targetName.isEmpty ? 'a member' : targetName;
    return switch (type) {
      RequestType.resetRole => 'reset $role, saving its data as "$saveName"',
      RequestType.renameRole => 'rename $role to "$newName"',
      RequestType.editStats => "set $who's stats to $points pts and $taskCompleted tasks",
      RequestType.kickMember => 'remove $who from $role',
      RequestType.rewardsTitle =>
        title.isEmpty ? 'set the rewards title back to the current month' : 'change the rewards title to "$title"',
      RequestType.roleIcon => 'change the icon of $role',
      RequestType.roleMessaging =>
        'turn ${enabled ? 'on' : 'off'} ${feature == MessagingFeature.taskThreads ? 'task questions' : 'the group chat'} in $role',
      _ => 'make a change',
    };
  }

  /// The request in a sentence, from the approver's side or the sender's ([mine]).
  String describe({bool mine = false}) =>
      mine ? 'You asked to $roleChangeAction' : '${userName.isEmpty ? 'An instructor' : userName} wants to $roleChangeAction';

  factory StemRequest.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final m = doc.data() ?? {};
    return StemRequest(
      id: doc.id,
      type: RequestType.values.where((t) => t.key == m['type']).firstOrNull,
      uid: _str(m['uid']),
      userName: _str(m['userName']),
      createdAt: _date(m['createdAt']),
      reason: _str(m['reason']),
      roleName: _str(m['roleName']),
      purpose: _str(m['purpose']),
      roleId: _str(m['roleId']),
      saveName: _str(m['saveName']),
      newName: _str(m['newName']),
      title: _str(m['title']),
      targetUid: _str(m['targetUid']),
      targetName: _str(m['targetName']),
      points: _int(m['points']),
      taskCompleted: _int(m['taskCompleted']),
      icon: _str(m['icon']),
      iconColor: _str(m['iconColor']),
      feature: MessagingFeature.values.where((f) => f.name == m['feature']).firstOrNull,
      enabled: m['enabled'] == true,
    );
  }
}
