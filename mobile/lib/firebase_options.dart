// Firebase config. iOS values come from the same GoogleService-Info.plist the
// Capacitor build used (ios/App/App/GoogleService-Info.plist); web values match
// src/lib/firebase.ts. If you ever run `flutterfire configure`, it will
// regenerate this file with the same values.
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform => kIsWeb ? web : ios;

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDVhkl9H-gUhI6r_nwSWTiMprLrpPrbayk',
    authDomain: 'stempower-fellowship.firebaseapp.com',
    appId: '1:137488563400:web:78b39c9ce50df57cc079fd',
    messagingSenderId: '137488563400',
    projectId: 'stempower-fellowship',
    storageBucket: 'stempower-fellowship.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyAiLbZDJzC3DCw7LRHEP0ivgYoB8XhYSWU',
    appId: '1:137488563400:ios:f892ca512c7db0ffc079fd',
    messagingSenderId: '137488563400',
    projectId: 'stempower-fellowship',
    storageBucket: 'stempower-fellowship.firebasestorage.app',
    iosClientId: '137488563400-na5qk2ivvodd01kmlsdnf1rqinl2g7pj.apps.googleusercontent.com',
    iosBundleId: 'com.stempower.stemup',
  );
}
