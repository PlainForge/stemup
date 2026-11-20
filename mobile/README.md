# StemUP iOS (Flutter)

The native iOS app, replacing the Capacitor wrapper in `../ios`. It talks to the
same Firebase project (`stempower-fellowship`) as the web app, so the website
and the app share one database.

## Run it (on the Mac)

1. Install Xcode (latest, for the iOS 26 SDK), then `sudo gem install cocoapods`.
2. Install the Flutter SDK (stable channel) and run `flutter doctor` until the iOS section is green.
3. From this folder:

   ```sh
   flutter pub get
   cd ios && pod install && cd ..
   open ios/Runner.xcworkspace
   ```

4. In Xcode → Runner target → Signing & Capabilities, pick your team (the bundle ID
   `com.stempower.stemup` is the same one the Capacitor app used).
5. `flutter run` with an iPhone or simulator selected. Liquid Glass needs Impeller,
   which is the default on iOS — **judge performance on a real phone**, not the simulator.

## Releasing

- Bump `version:` in `pubspec.yaml`. The build number (after `+`) must be higher than
  the last Capacitor build you uploaded to App Store Connect.
- `flutter build ipa`, then upload `build/ios/ipa/*.ipa` with Transporter or Xcode's Organizer.

## Layout

| Path | What it is |
| --- | --- |
| `lib/services/` | Firestore/Auth calls, ported from `src/lib/firebaseService.ts` and the inline calls in the React pages |
| `lib/state/app_state.dart` | Port of `MainProvider` (auth, profile, admins, preferences, tab badges) |
| `lib/router.dart` | Routes (mirrors `src/Routes.tsx`); each tab keeps its own navigation stack |
| `lib/widgets/glass*.dart` | Liquid Glass surfaces and the floating tab bar |
| `lib/screens/` | One file per page |

`liquid_glass_renderer` is a pre-release package. If it misbehaves, users can switch
it off in **Settings → Reduce glass effects** (falls back to a plain blur), and
`GlassSurface` in `lib/widgets/glass.dart` is the only place that touches it.

`flutter test` runs the semester-reset logic tests and layout smoke tests for the
custom controls.
