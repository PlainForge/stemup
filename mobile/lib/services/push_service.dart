// Push notifications on this phone. The Cloud Functions in
// functions/src/notifications.ts decide what to send; this file only asks iOS
// for permission, stores this phone's token under the signed-in user, and
// opens the right page when a notification is tapped.
import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../state/app_state.dart';
import 'db.dart';

class PushService {
  PushService._();

  static FirebaseMessaging get _fm => FirebaseMessaging.instance;

  /// Who this phone is registered for, and with which token.
  static String? _uid;
  static String? _token;
  static StreamSubscription<String>? _refreshSub;

  /// Shows notifications while the app is open, and handles taps on them.
  static Future<void> init(GoRouter router, AppState app) async {
    await _fm.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(router, app, m));
    final initial = await _fm.getInitialMessage();
    if (initial != null) _open(router, app, initial);
  }

  /// Asks iOS to allow notifications. True if they're allowed.
  static Future<bool> requestPermission() async {
    final s = await _fm.requestPermission(alert: true, badge: true, sound: true);
    return _allowed(s.authorizationStatus);
  }

  static bool _allowed(AuthorizationStatus s) => s == AuthorizationStatus.authorized || s == AuthorizationStatus.provisional;

  /// Stores this phone's token for [uid], if iOS allows notifications.
  static Future<void> register(String uid) async {
    try {
      if (!_allowed((await _fm.getNotificationSettings()).authorizationStatus)) return;
      // The APNs token arrives shortly after launch; FCM can't make a token without it
      for (var i = 0; i < 10 && await _fm.getAPNSToken() == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 500));
      }
      final token = await _fm.getToken();
      if (token == null) return;
      if (_uid != null && _uid != uid && _token != null) await Db.removeDevice(_uid!, _token!).catchError((_) {});
      _uid = uid;
      _token = token;
      await Db.saveDevice(uid, token);
      _refreshSub ??= _fm.onTokenRefresh.listen((t) async {
        final owner = _uid;
        if (owner == null) return;
        if (_token != null && _token != t) await Db.removeDevice(owner, _token!).catchError((_) {});
        _token = t;
        await Db.saveDevice(owner, t).catchError((_) {});
      });
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }

  /// Stops this phone getting the current user's notifications (push switched
  /// off, or signing out). Must run while still signed in.
  static Future<void> unregister() async {
    final uid = _uid;
    final token = _token;
    _uid = null;
    _token = null;
    if (uid != null && token != null) await Db.removeDevice(uid, token).catchError((_) {});
  }

  static void _open(GoRouter router, AppState app, RemoteMessage m) {
    final path = m.data['path'];
    if (path is! String || !path.startsWith('/')) return;
    if (app.userData != null) {
      router.go(path);
      return;
    }
    // Opened from a cold start: wait until the user's profile has loaded
    late final VoidCallback listener;
    listener = () {
      if (app.userData == null) return;
      app.removeListener(listener);
      Future<void>.delayed(const Duration(milliseconds: 300), () => router.go(path));
    };
    app.addListener(listener);
  }
}
