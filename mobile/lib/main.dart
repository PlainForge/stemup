import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'firebase_options.dart';
import 'router.dart';
import 'services/auth_service.dart';
import 'services/push_service.dart';
import 'state/app_state.dart';
import 'theme/palette.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await AuthService.initGoogle();
  await initializeDateFormatting('en_US');
  final prefs = await SharedPreferences.getInstance();
  runApp(StemUpApp(state: AppState(prefs)));
}

class StemUpApp extends StatefulWidget {
  const StemUpApp({super.key, required this.state});

  final AppState state;

  @override
  State<StemUpApp> createState() => _StemUpAppState();
}

class _StemUpAppState extends State<StemUpApp> {
  late final GoRouter _router = buildRouter(widget.state);

  /// The user this phone is registered for push with, if any.
  String? _pushUid;

  @override
  void initState() {
    super.initState();
    PushService.init(_router, widget.state);
    widget.state.addListener(_syncPush);
  }

  @override
  void dispose() {
    widget.state.removeListener(_syncPush);
    super.dispose();
  }

  /// Registers this phone while the signed-in user has push turned on.
  void _syncPush() {
    final me = widget.state.userData;
    final want = me != null && me.notifications.push ? me.uid : null;
    if (want == _pushUid) return;
    _pushUid = want;
    if (want != null) {
      PushService.register(want);
    } else if (me != null) {
      // Switched off in Settings (signing out unregisters in AuthService.signOut)
      PushService.unregister();
    }
  }

  @override
  Widget build(BuildContext context) => ChangeNotifierProvider.value(
    value: widget.state,
    child: Consumer<AppState>(
      builder: (context, app, _) => CupertinoApp.router(
        title: 'StemUP',
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
        theme: CupertinoThemeData(
          brightness: app.brightnessOverride,
          primaryColor: Palette.blue600,
          scaffoldBackgroundColor: Palette.page,
          // Google Sans, as on the web (index.css); native pickers keep the system font
          textTheme: CupertinoTextThemeData(textStyle: GoogleFonts.googleSans(fontSize: 16, color: Palette.foreground)),
        ),
        // The web's base text: Google Sans Regular (font-weight 400) in the foreground color
        // Reduce Motion in Settings works like the iPhone's own: widgets read it from MediaQuery (widgets/motion.dart)
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(disableAnimations: MediaQuery.of(context).disableAnimations || app.reduceMotion),
          child: DefaultTextStyle(
            style: GoogleFonts.googleSans(fontSize: 16, fontWeight: FontWeight.w400, color: Palette.label(context)),
            child: child!,
          ),
        ),
      ),
    ),
  );
}
