# IronBandit – Android app

Offline workout log. All data lives in a local SQLite database; the app has
no internet permission. No account, no Google services, no tracking.

The rest timer notification is an exact alarm (`USE_EXACT_ALARM`, timer use)
shown by `RestAlarmReceiver`, so it comes on time with the app in the background.

## Build

Flutter 3.47 (stable), JDK 17, Android SDK 36, NDK r28c, a C compiler for SQLite.

```sh
tool/fetch-sqlite.sh        # SQLite amalgamation, compiled from source
flutter pub get
flutter analyze
flutter test
flutter build apk --release --split-per-abi
```

Without `android/key.properties` (or the `IRONBANDIT_*` environment
variables, see `android/app/build.gradle.kts`) the release APK is unsigned,
as F-Droid expects.

### Reproducible builds

The release APKs are built so that F-Droid can reproduce them byte for byte:
the Dart compiler embeds the build path and the NDK path ends up in the build
ID of native libraries. Release builds therefore run in
`/home/vagrant/build/at.ironbandit.app/app` with `ANDROID_HOME=/opt/android-sdk`,
`PUB_CACHE=$(pwd)/.pub-cache` and Flutter in `/home/vagrant/build/srclib/flutter`,
exactly like the F-Droid build server.

## Layout

- `lib/data` – local database (`db.dart`), data access (`api.dart`), plan and history CSV, platform channels (`device.dart`)
- `lib/ui` – screens; colors and type scale in `ui/theme.dart`
- `lib/l10n` – German (template) and English strings
- `android/…/MainActivity.kt` – file picker (backup, CSV), rest alarm, keep screen on
- `fastlane/` – store texts, screenshots and changelogs
