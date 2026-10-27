import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'data/session.dart';
import 'l10n/app_localizations.dart';
import 'ui/home_screen.dart';
import 'ui/theme.dart';
import 'ui/widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session()..start();
  runApp(SessionScope(session: session, child: const IronBanditApp()));
}

class IronBanditApp extends StatelessWidget {
  const IronBanditApp({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    return MaterialApp(
      onGenerateTitle: (c) => c.t.appName,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: session.themeMode,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      // status/navigation bar icons follow the theme on screens without an app bar
      builder: (context, child) {
        final p = context.c;
        final dark = Theme.of(context).brightness == Brightness.dark;
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: (dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
            statusBarColor: Colors.transparent,
            systemNavigationBarColor: p.navBar,
          ),
          child: child!,
        );
      },
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    if (session.error != null) {
      return Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text('${context.t.errorGeneric}\n\n${session.error}', textAlign: TextAlign.center)),
          ),
        ),
      );
    }
    if (!session.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return const HomeScreen();
  }
}
