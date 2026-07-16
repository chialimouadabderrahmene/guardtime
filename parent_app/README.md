# GuardTime Parent App

Flutter MVP for the GuardTime Parent experience, connected to the production backend at `https://backendparent-production.up.railway.app`.

## Stack

- Flutter stable
- Dart null safety
- Riverpod
- Dio
- Flutter Secure Storage
- GoRouter

## Project shape

- `lib/core/` app config, networking, theme, storage
- `lib/shared/` reusable shared widgets
- `lib/features/auth/` auth flow and session handling
- `lib/features/children/` child list and detail flows
- `lib/features/devices/` device registration, DNS, network, gaming entry points
- `lib/features/gaming/` full internet lock flow
- `lib/features/offline_control/` offline guide and checklist flows
- `lib/features/protection/` schedule rules, protection score, insights
- `lib/features/settings/` parent profile and app settings

## Backend

The app is configured for:

- `API Base URL`: `https://backendparent-production.up.railway.app`
- `GuardTime DNS IP`: `8.208.89.37`
- `Privacy policy URL`: `https://backendparent-production.up.railway.app/legal/privacy-policy`
- `Privacy and account request URL`: `https://backendparent-production.up.railway.app/legal/privacy-request`

## Play Store compliance

- The app now exposes an in-app `Privacy & Account` screen at `/legal`.
- Signed-in parents can delete their account in-app through `DELETE /parents/profile`.
- A public web privacy policy and privacy/account request page are provided by the backend for Play Console URLs.
- You still need to complete the Play Console `Data safety` and `Data deletion` forms with accurate declarations that match the deployed backend behavior.

## Local setup

```bash
flutter pub get
flutter run
```

## Quality checks

```bash
flutter analyze
flutter test
```

## Release builds

APK:

```bash
flutter build apk --release
```

App Bundle:

```bash
flutter build appbundle --release
```

## Android signing

Release signing is scaffolded in `android/app/build.gradle.kts`.

1. Copy `android/key.properties.example` to `android/key.properties`
2. Fill in the real keystore path and passwords
3. Place the keystore file on the machine
4. Build the release bundle again

If `key.properties` is missing, release builds still compile with the debug signing config so build verification can complete locally. Play Store upload should use a real release keystore.
