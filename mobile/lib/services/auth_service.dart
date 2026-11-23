// Port of the auth half of src/lib/firebaseService.ts. Google sign-in uses the
// native google_sign_in flow and hands the ID token to Firebase, the same thing
// the Capacitor plugin did.

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

import '../firebase_options.dart';
import '../models/models.dart';

class AuthService {
  AuthService._();

  static final _auth = FirebaseAuth.instance;
  static final _db = FirebaseFirestore.instance;
  static final _storage = FirebaseStorage.instance;

  /// The native google_sign_in flow only exists on iOS/Android. Web uses
  /// Firebase's popup flow instead (like the React app), and desktop has no
  /// Google sign-in support in FlutterFire at all.
  static bool get _nativeGoogle => !kIsWeb && (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.android);

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
    await user.sendEmailVerification();
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
    final user = cred.user!;
    await _linkPending(user);
    // Apple shares the name only on the very first sign-in, and users can hide
    // their email behind a relay address, so fall back to something readable.
    final name = user.displayName?.trim().isNotEmpty == true
        ? user.displayName
        : (user.email?.contains('privaterelay.appleid.com') == false ? user.email!.split('@').first : 'StemUp Member');
    await _provisionOAuthUser(user, null, name: name);
  }

  /// Creates users/{uid} (and adds them to the global role) on a first-time
  /// Google or Apple sign-in. No-op if the profile already exists.
  static Future<void> _provisionOAuthUser(User user, String? photoOverride, {String? name}) async {
    final ref = _db.doc('users/${user.uid}');
    if ((await ref.get()).exists) return;

    var photoURL = defaultAvatar;
    final source = photoOverride ?? user.photoURL;
    if (source != null) {
      try {
        final res = await http.get(Uri.parse(source));
        final storageRef = _storage.ref('profilePictures/${user.uid}');
        await storageRef.putData(res.bodyBytes, SettableMetadata(contentType: res.headers['content-type'] ?? 'image/jpeg'));
        photoURL = await storageRef.getDownloadURL();
      } catch (_) {
        // Fall back to the default avatar rather than blocking sign-up
      }
    }

    await ref.set(_starterProfile(email: user.email, name: name ?? user.displayName, photoURL: photoURL));
    await _db.doc('roles/$globalRoleId').update({
      'members': FieldValue.arrayUnion([user.uid]),
    });
  }

  static Future<void> signOut() async {
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
    writes.add(_db.doc('users/${user.uid}').delete());
    await Future.wait(writes);
    // Apple requires revoking the app's Sign in with Apple tokens on deletion
    if (appleAuthCode != null) {
      await _auth.revokeTokenWithAuthorizationCode(appleAuthCode).catchError((_) {});
    }
    await user.delete();
    if (_nativeGoogle) await GoogleSignIn.instance.signOut().catchError((_) {});
    return true;
  }
}
