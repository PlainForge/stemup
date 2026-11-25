// Port of the auth half of src/lib/firebaseService.ts. Google sign-in uses the
// native google_sign_in flow and hands the ID token to Firebase, the same thing
// the Capacitor plugin did.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

import '../firebase_options.dart';
import '../models/models.dart';
import 'push_service.dart';

class AuthService {
  AuthService._();

  static final _auth = FirebaseAuth.instance;
  static final _db = FirebaseFirestore.instance;
  static final _storage = FirebaseStorage.instance;

  /// The native google_sign_in flow only exists on iOS/Android. Web uses
  /// Firebase's popup flow instead (like the React app), and desktop has no
  /// Google sign-in support in FlutterFire at all.
  static bool get _nativeGoogle =>
      !kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android);

  static bool get googleSupported => kIsWeb || _nativeGoogle;

  /// Sign in with Apple uses Firebase's native Apple flow, which only exists on
  /// iOS here. App Store guideline 4.8 requires it wherever Google sign-in is offered.
  static bool get appleSupported => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  static AppleAuthProvider get _appleProvider => AppleAuthProvider()
    ..addScope('email')
    ..addScope('name');

  static Future<void> initGoogle() async {
    if (!_nativeGoogle) return;
    await GoogleSignIn.instance.initialize(
      clientId: defaultTargetPlatform == TargetPlatform.iOS ? DefaultFirebaseOptions.ios.iosClientId : null,
    );
  }

  static Map<String, dynamic> _starterProfile({required String? email, required String? name, required String photoURL}) => {
    'email': email,
    'name': name,
    'roles': [const UserRoleData(id: globalRoleId, name: 'global').toMap()],
    'createdAt': DateTime.now(),
    'points': 0,
    'taskCompleted': 0,
    'photoURL': photoURL,
    'currentRole': '',
  };

  static Future<void> registerWithEmail(String email, String password, String name) async {
    final cred = await _auth.createUserWithEmailAndPassword(email: email, password: password);
    final user = cred.user!;
    // Send the verification email first, so a failed profile write below can
    // never leave a new user without their link (App Review guideline 2.1).
    // A failed send must not stop sign-up: they can use "Resend email" next.
    try {
      await sendVerification(user);
    } catch (e) {
      debugPrint('Verification email not sent during sign-up: $e');
    }
    await _db.doc('users/${user.uid}').set(_starterProfile(email: user.email, name: name, photoURL: defaultAvatar));
    await _db.doc('roles/$globalRoleId').update({
      'members': FieldValue.arrayUnion([user.uid]),
    });
  }

  // ---- Linking Apple / Google / email accounts that share an email ----
  //
  // Firebase keeps one account per email. Signing in with a second provider
  // for an email that already has an account fails with
  // account-exists-with-different-credential. We hold on to that rejected
  // credential and, once the person signs in the way they originally did,
  // attach it to the account so both methods open the same profile.

  static AuthCredential? _pendingCredential;
  static String? _pendingEmail;

  /// The provider the person is being asked to link ('Apple' / 'Google'), if any.
  static String? get pendingLinkProvider => switch (_pendingCredential?.providerId) {
    'apple.com' => 'Apple',
    'google.com' => 'Google',
    _ => null,
  };

  static void _rememberForLinking(FirebaseAuthException e, AuthCredential? fallback) {
    if (e.code != 'account-exists-with-different-credential') return;
    _pendingCredential = e.credential ?? fallback;
    _pendingEmail = e.email?.toLowerCase();
  }

  /// Links any held credential to [user] when the emails match. Never throws:
  /// a failed link must not undo a successful sign-in.
  static Future<void> _linkPending(User user) async {
    final pending = _pendingCredential;
    if (pending == null) return;
    final email = user.email?.toLowerCase();
    if (_pendingEmail != null && email != _pendingEmail) return;
    _pendingCredential = null;
    _pendingEmail = null;
    try {
      await user.linkWithCredential(pending);
    } on FirebaseAuthException catch (e) {
      debugPrint('Account link skipped: ${e.code} ${e.message}');
    }
  }

  static Future<void> loginWithEmail(String email, String password) async {
    final cred = await _auth.signInWithEmailAndPassword(email: email, password: password);
    await _linkPending(cred.user!);
  }

  // ---- Verification / password-reset emails ----
  //
  // Sent from StemUp's Gmail by Cloud Functions (functions/src/authEmails.ts),
  // because Yahoo and school inboxes drop Firebase's built-in noreply emails.
  // If a function is unavailable we fall back to Firebase's own email.

  static final _functions = FirebaseFunctions.instance;

  /// Maps a function error onto the Auth error code the screens already
  /// handle; null means "fall back to Firebase's built-in email".
  static FirebaseAuthException? _emailFunctionError(Object e) {
    if (e is! FirebaseFunctionsException) return null;
    return switch (e.code) {
      'resource-exhausted' => FirebaseAuthException(code: 'too-many-requests', message: e.message),
      'invalid-argument' => FirebaseAuthException(code: 'invalid-email', message: e.message),
      _ => null,
    };
  }

  /// Whether a display name is free of profanity (the checkName function).
  /// Allows it if the check can't run: the cleanProfileName function still
  /// replaces a blocked name when the profile is saved.
  static Future<bool> isNameAllowed(String name) async {
    try {
      final result = await _functions.httpsCallable('checkName').call<Map<String, dynamic>>({'name': name});
      return result.data['ok'] != false;
    } catch (_) {
      return true;
    }
  }

  static const blockedNameMessage = "That name isn't allowed. Please choose a different one.";

  static Future<void> sendVerification(User user) async {
    try {
      await _functions.httpsCallable('sendVerificationEmail').call<void>();
    } catch (e) {
      final mapped = _emailFunctionError(e);
      if (mapped != null) throw mapped;
      debugPrint('sendVerificationEmail function failed, using Firebase email: $e');
      await user.sendEmailVerification();
    }
  }

  /// True when the account signs in with an email and password (Google and
  /// Apple accounts get their email from that sign-in).
  static bool get hasPasswordSignIn => _auth.currentUser?.providerData.any((p) => p.providerId == 'password') ?? false;

  /// Starts an email change after the person re-enters their password: a link
  /// goes to [newEmail], and the account's email only changes once it's clicked
  /// (until then users/{uid}.pendingEmail holds it). Returns false if the
  /// password prompt is cancelled; throws an [EmailChangeException] with a
  /// readable message on failure.
  static Future<bool> requestEmailChange(String newEmail, Future<String?> Function() askPassword) async {
    final user = _auth.currentUser;
    if (user == null || user.email == null) return false;
    final email = newEmail.trim().toLowerCase();
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) throw const EmailChangeException("That email address doesn't look right.");
    if (email == user.email!.toLowerCase()) throw const EmailChangeException("That's already your email.");

    final password = await askPassword();
    if (password == null || password.isEmpty) return false;
    try {
      await user.reauthenticateWithCredential(EmailAuthProvider.credential(email: user.email!, password: password));
    } on FirebaseAuthException catch (e) {
      throw EmailChangeException(switch (e.code) {
        'wrong-password' || 'invalid-credential' => 'That password is incorrect.',
        'too-many-requests' => 'Too many attempts. Please wait a bit and try again.',
        _ => "Couldn't confirm it's you (${e.code}).",
      });
    }

    try {
      await _functions.httpsCallable('requestEmailChange').call<void>({'email': email});
      return true;
    } on FirebaseFunctionsException catch (e) {
      if (e.code == 'invalid-argument' || e.code == 'already-exists') throw EmailChangeException(e.message ?? "That email can't be used.");
      if (e.code == 'resource-exhausted') {
        throw const EmailChangeException("You've requested a link already. Please wait a minute before trying again.");
      }
      // The function is unavailable (e.g. the Gmail account failed): use Firebase's own email instead
      debugPrint('requestEmailChange function failed, using Firebase email: $e');
    } catch (e) {
      debugPrint('requestEmailChange function failed, using Firebase email: $e');
    }
    try {
      await user.verifyBeforeUpdateEmail(email);
    } on FirebaseAuthException catch (e) {
      throw EmailChangeException(switch (e.code) {
        'email-already-in-use' => 'Another account already uses that email.',
        'invalid-email' => "That email address doesn't look right.",
        'too-many-requests' => "You've requested a few links already. Please wait a bit and try again.",
        _ => "Couldn't send the link (${e.code}). Please try again.",
      });
    }
    await _db.doc('users/${user.uid}').update({'pendingEmail': email});
    return true;
  }

  /// Stops showing a pending email change (a link already sent still works until it expires).
  static Future<void> cancelEmailChange(String uid) => _db.doc('users/$uid').update({'pendingEmail': FieldValue.delete()});

  /// Emails a password-reset link. Never reveals whether the email has an
  /// account, so callers should word the confirmation accordingly.
  static Future<void> sendPasswordReset(String email) async {
    try {
      await _functions.httpsCallable('sendPasswordResetEmail').call<void>({'email': email.trim()});
    } catch (e) {
      final mapped = _emailFunctionError(e);
      if (mapped != null) throw mapped;
      debugPrint('sendPasswordResetEmail function failed, using Firebase email: $e');
      await _auth.sendPasswordResetEmail(email: email.trim());
    }
  }

  static Future<OAuthCredential> _googleCredential() async {
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null) throw Exception('No ID token returned from Google Sign-In');
    return GoogleAuthProvider.credential(idToken: idToken);
  }

  static Future<void> signInWithGoogle() async {
    if (!googleSupported) throw UnsupportedError('Google sign-in is only available on iOS, Android and web.');
    OAuthCredential? googleCred;
    final UserCredential cred;
    try {
      if (kIsWeb) {
        cred = await _auth.signInWithPopup(GoogleAuthProvider());
      } else {
        googleCred = await _googleCredential();
        cred = await _auth.signInWithCredential(googleCred);
      }
    } on FirebaseAuthException catch (e) {
      _rememberForLinking(e, googleCred);
      rethrow;
    }
    final user = cred.user!;
    await _linkPending(user);
    // Google's default is a 96px thumbnail; ask for a high-res copy to store
    final photo = user.photoURL?.replaceAll(RegExp(r'=s\d+-c'), '=s400-c').replaceAll(RegExp(r'=s\d+$'), '=s400');
    await _provisionOAuthUser(user, photo);
  }

  static Future<void> signInWithApple() async {
    if (!appleSupported) throw UnsupportedError('Sign in with Apple is only available on iOS.');
    final UserCredential cred;
    try {
      cred = await _auth.signInWithProvider(_appleProvider);
    } on FirebaseAuthException catch (e) {
      _rememberForLinking(e, null);
      rethrow;
    }
    await _linkPending(cred.user!);
    // Firebase copies Apple's name onto the user just after sign-in completes,
    // so re-read the user to pick it up.
    await cred.user!.reload().catchError((_) {});
    final user = _auth.currentUser ?? cred.user!;
    final appleName = user.displayName?.trim();
    final hasName = appleName != null && appleName.isNotEmpty;

    // Apple shares the name only the first time an Apple ID signs in to the
    // app, and users can hide their email behind a relay address, so fall back
    // to something readable.
    final name = hasName
        ? appleName
        : (user.email?.contains('privaterelay.appleid.com') == false ? user.email!.split('@').first : appleFallbackName);
    await _provisionOAuthUser(user, null, name: name);

    // Profiles created before the name came through got the placeholder; fix them up.
    if (hasName) {
      final ref = _db.doc('users/${user.uid}');
      final snap = await ref.get();
      if (snap.data()?['name'] == appleFallbackName) await ref.update({'name': appleName});
    }
  }

  /// Name given to Apple accounts when Apple doesn't share one.
  static const appleFallbackName = 'StemUp Member';

  /// Copies a Google profile photo into Storage and returns its URL. If the
  /// copy fails, returns Google's own photo URL (which still shows the photo)
  /// instead of falling back to the initials avatar.
  static Future<String> _copyOAuthPhoto(String uid, String source) async {
    try {
      final res = await http.get(Uri.parse(source));
      if (res.statusCode != 200) throw Exception('Photo download failed (${res.statusCode})');
      final storageRef = _storage.ref('profilePictures/$uid');
      await storageRef.putData(res.bodyBytes, SettableMetadata(contentType: res.headers['content-type'] ?? 'image/jpeg'));
      return await storageRef.getDownloadURL();
    } catch (e) {
      debugPrint("Couldn't copy the sign-in photo; using it from Google directly: $e");
      return source;
    }
  }

  /// Creates users/{uid} (and adds them to the global role) on a first-time
  /// Google or Apple sign-in. No-op if the profile already exists.
  static Future<void> _provisionOAuthUser(User user, String? photoOverride, {String? name}) async {
    final ref = _db.doc('users/${user.uid}');
    final snap = await ref.get();
    final source = photoOverride ?? user.photoURL;

    if (snap.exists) {
      // Accounts whose photo copy failed at sign-up got the initials avatar; give them their photo now
      final current = snap.data()?['photoURL'] as String?;
      if (source != null && (current == null || current.isEmpty || current == defaultAvatar)) {
        await ref.update({'photoURL': await _copyOAuthPhoto(user.uid, source)}).catchError((Object e) {
          debugPrint("Couldn't update the profile photo: $e");
        });
      }
      return;
    }

    final photoURL = source == null ? defaultAvatar : await _copyOAuthPhoto(user.uid, source);

    await ref.set(_starterProfile(email: user.email, name: name ?? user.displayName, photoURL: photoURL));
    await _db.doc('roles/$globalRoleId').update({
      'members': FieldValue.arrayUnion([user.uid]),
    });
  }

  static Future<void> signOut() async {
    // Stop this phone getting the account's notifications (needs to be signed in)
    await PushService.unregister();
    if (_nativeGoogle) await GoogleSignIn.instance.signOut().catchError((_) {});
    await _auth.signOut();
  }

  /// Updates display name and, if [photo] is given, replaces the profile picture.
  static Future<String> setAccountInformation({
    required String name,
    Uint8List? photo,
    String contentType = 'image/jpeg',
    required UserData userData,
  }) async {
    final uid = userData.uid;
    var photoURL = userData.photoURL;
    if (photo != null) {
      final ref = _storage.ref('profilePictures/$uid');
      if (userData.photoURL.isNotEmpty && userData.photoURL != defaultAvatar) {
        await ref.delete().catchError((_) {});
      }
      await ref.putData(photo, SettableMetadata(contentType: contentType));
      photoURL = await ref.getDownloadURL();
    }
    await _db.doc('users/$uid').set({'name': name, 'photoURL': photoURL}, SetOptions(merge: true));
    return photoURL;
  }

  /// Re-authenticates, then deletes the user's tasks, role memberships, photo,
  /// profile, and finally the Auth account. [askPassword] is called for
  /// email/password accounts; returning null cancels.
  static Future<bool> deleteAccount(UserData userData, Future<String?> Function() askPassword) async {
    final user = _auth.currentUser;
    if (user == null) return false;

    final providers = user.providerData.map((p) => p.providerId);
    String? appleAuthCode;
    if (providers.contains('apple.com') && appleSupported) {
      final cred = await user.reauthenticateWithProvider(_appleProvider);
      appleAuthCode = cred.additionalUserInfo?.authorizationCode;
    } else if (providers.contains('google.com')) {
      if (kIsWeb) {
        await user.reauthenticateWithPopup(GoogleAuthProvider());
      } else {
        await user.reauthenticateWithCredential(await _googleCredential());
      }
    } else {
      final password = await askPassword();
      if (password == null || password.isEmpty) return false;
      await user.reauthenticateWithCredential(EmailAuthProvider.credential(email: user.email!, password: password));
    }

    final writes = <Future<void>>[];
    for (final r in userData.roles) {
      writes.add(
        _db.doc('roles/${r.id}').update({
          'members': FieldValue.arrayRemove([user.uid]),
        }),
      );
    }
    final results = await Future.wait([
      _db.collection('tasks').where('assignedTo', isEqualTo: user.uid).get(),
      _db.collection('tasksSubmitted').where('assignedTo', isEqualTo: user.uid).get(),
    ]);
    for (final snap in results) {
      for (final d in snap.docs) {
        writes.add(d.reference.delete());
      }
    }
    if (userData.photoURL.isNotEmpty && userData.photoURL != defaultAvatar) {
      await _storage.ref('profilePictures/${user.uid}').delete().catchError((_) {});
    }
    // Best effort: one failed write (e.g. a role that was since deleted) must not stop the
    // account itself being deleted. The cleanUpDeletedAccount function clears anything left.
    await Future.wait(writes.map((w) => w.catchError((Object e) => debugPrint('Account cleanup step failed: $e'))));
    await _db.doc('users/${user.uid}').delete().catchError((Object e) => debugPrint("Couldn't delete profile: $e"));
    // Apple requires revoking the app's Sign in with Apple tokens on deletion
    if (appleAuthCode != null) {
      await _auth.revokeTokenWithAuthorizationCode(appleAuthCode).catchError((_) {});
    }
    await user.delete();
    if (_nativeGoogle) await GoogleSignIn.instance.signOut().catchError((_) {});
    return true;
  }
}

/// A failed email change, with a message to show as is.
class EmailChangeException implements Exception {
  const EmailChangeException(this.message);

  final String message;

  @override
  String toString() => message;
}
