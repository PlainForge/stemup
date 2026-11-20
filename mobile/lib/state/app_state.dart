// Port of src/context/MainProvider.tsx: auth state, the signed-in user's live
// profile, the admin list, and app preferences. The router listens to this to
// decide between the splash, auth and main screens.
import 'dart:async';
import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/cupertino.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/db.dart';

enum ThemePref { system, light, dark }

class AppState extends ChangeNotifier {
  /// [authChanges] defaults to Firebase's auth stream; tests pass their own.
  AppState(this._prefs, {Stream<User?>? authChanges}) {
    themePref = ThemePref.values.firstWhere((t) => t.name == _prefs.getString('theme'), orElse: () => ThemePref.system);
    reduceGlass = _prefs.getBool('reduceGlass') ?? false;
    _authSub = (authChanges ?? FirebaseAuth.instance.authStateChanges()).listen(_onAuth);
  }

  final SharedPreferences _prefs;
  StreamSubscription<User?>? _authSub;
  StreamSubscription<UserData?>? _userSub;
  StreamSubscription<List<String>>? _adminSub;
  final List<StreamSubscription> _badgeSubs = [];
  Timer? _verifyTimer;

  User? user;
  UserData? userData;
  List<String> admins = const [];

  /// True until the first auth event (and, when signed in, the first profile
  /// snapshot) arrives. Only drives the launch splash; never flips back.
  bool initializing = true;

  bool get needsVerification => user != null && !user!.emailVerified;
  bool get isAdmin => user != null && admins.contains(user!.uid);

  late ThemePref themePref;

  /// Swap real refraction for a plain blur (cheaper on older phones).
  late bool reduceGlass;

  // ── Badge data (the dot on the Roles tab and the counts on the roles list) ──
  List<Role> roles = const [];
  List<Task> myIncompleteTasks = const [];
  Set<String> mySubmittedIds = const {};
  List<SubmittedTask> pendingSubmissions = const [];
  Set<String> seenTaskIds = {};

  void _onAuth(User? usr) {
    _userSub?.cancel();
    _adminSub?.cancel();
    _verifyTimer?.cancel();
    _cancelBadgeSubs();

    user = usr;
    if (usr == null) {
      userData = null;
      admins = const [];
      initializing = false;
      notifyListeners();
      return;
    }

    if (!usr.emailVerified) {
      userData = null;
      initializing = false;
      // Poll until the link in the verification email is clicked
      _verifyTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
        await FirebaseAuth.instance.currentUser?.reload();
        final refreshed = FirebaseAuth.instance.currentUser;
        if (refreshed != null && refreshed.emailVerified) {
          _verifyTimer?.cancel();
          _onAuth(refreshed);
        }
      });
      notifyListeners();
      return;
    }

    _loadSeenTasks(usr.uid);
    _userSub = Db.userStream(usr.uid).listen(
      (data) {
        userData = data;
        initializing = false;
        notifyListeners();
      },
      onError: (_) {
        initializing = false;
        notifyListeners();
      },
    );
    _adminSub = Db.adminsStream().listen(
      (ids) {
        final wasAdmin = isAdmin;
        admins = ids;
        if (wasAdmin != isAdmin || _badgeSubs.isEmpty) _startBadgeSubs();
        notifyListeners();
      },
      onError: (_) {
        admins = const [];
        notifyListeners();
      },
    );
    notifyListeners();
  }

  void _startBadgeSubs() {
    _cancelBadgeSubs();
    final uid = user?.uid;
    if (uid == null) return;
    _badgeSubs.add(
      Db.rolesStream().listen((r) {
        roles = r;
        notifyListeners();
      }),
    );
    if (isAdmin) {
      _badgeSubs.add(
        Db.allPendingSubmittedStream().listen((s) {
          pendingSubmissions = s;
          notifyListeners();
        }),
      );
    } else {
      _badgeSubs.add(
        Db.userIncompleteTasksStream(uid).listen((t) {
          myIncompleteTasks = t;
          notifyListeners();
        }),
      );
      _badgeSubs.add(
        Db.userSubmittedStream(uid).listen((s) {
          mySubmittedIds = s.where((x) => !x.complete).map((x) => x.id).toSet();
          notifyListeners();
        }),
      );
    }
  }

  void _cancelBadgeSubs() {
    for (final s in _badgeSubs) {
      s.cancel();
    }
    _badgeSubs.clear();
    roles = const [];
    myIncompleteTasks = const [];
    mySubmittedIds = const {};
    pendingSubmissions = const [];
  }

  /// To-do tasks per role (submitted-but-unreviewed tasks don't count).
  Map<String, int> get incompletePerRole {
    final out = <String, int>{};
    for (final t in myIncompleteTasks) {
      if (t.roleId.isNotEmpty && !mySubmittedIds.contains(t.id)) out[t.roleId] = (out[t.roleId] ?? 0) + 1;
    }
    return out;
  }

  /// Pending join requests + submissions awaiting review, per role (admins).
  Map<String, int> get adminAttentionPerRole {
    final out = <String, int>{};
    for (final r in roles) {
      if (r.pendingRequests.isNotEmpty) out[r.id] = r.pendingRequests.length;
    }
    for (final s in pendingSubmissions) {
      out[s.roleId] = (out[s.roleId] ?? 0) + 1;
    }
    return out;
  }

  bool get rolesTabBadge => isAdmin
      ? adminAttentionPerRole.isNotEmpty
      : myIncompleteTasks.any((t) => !seenTaskIds.contains(t.id) && !mySubmittedIds.contains(t.id));

  // ── Seen tasks (same localStorage key the web app uses, per device) ──

  void _loadSeenTasks(String uid) {
    final raw = _prefs.getString('stemup_seen_tasks_$uid');
    seenTaskIds = raw == null ? {} : Set<String>.from(jsonDecode(raw) as List);
  }

  void markTaskSeen(String taskId) {
    final uid = user?.uid;
    if (uid == null || seenTaskIds.contains(taskId)) return;
    seenTaskIds = {...seenTaskIds, taskId};
    _prefs.setString('stemup_seen_tasks_$uid', jsonEncode(seenTaskIds.toList()));
    notifyListeners();
  }

  // ── Preferences ──

  void setThemePref(ThemePref t) {
    themePref = t;
    _prefs.setString('theme', t.name);
    notifyListeners();
  }

  void setReduceGlass(bool v) {
    reduceGlass = v;
    _prefs.setBool('reduceGlass', v);
    notifyListeners();
  }

  Brightness? get brightnessOverride => switch (themePref) {
    ThemePref.system => null,
    ThemePref.light => Brightness.light,
    ThemePref.dark => Brightness.dark,
  };

  @override
  void dispose() {
    _authSub?.cancel();
    _userSub?.cancel();
    _adminSub?.cancel();
    _verifyTimer?.cancel();
    _cancelBadgeSubs();
    super.dispose();
  }
}
