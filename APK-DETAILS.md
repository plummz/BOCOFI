# BOCO-FI Android App (APK)

## Download

- File: `BOCO-FI.apk`
- Google Drive folder: https://drive.google.com/drive/folders/1urI8SjJE5q3R4qBUX_9saxqWRvegs-dS
- Direct file link: (DRIVE_FILE_LINK)

## Details

| | |
|---|---|
| App name | BOCO-FI |
| Package name | com.bocofi.app |
| Version | 1.0 (version code 1) |
| File size | about 100 KB |
| Minimum Android | Android 7.0 (API 24) |
| Target Android | Android 16 (API 36) |
| Build type | Debug |
| Built on | October 4, 2026 |
| Internet needed? | Only for the font. Everything else works offline. |

## What's inside

The app has 4 tabs at the top:

| Tab | What it shows |
|---|---|
| Home | The landing page |
| Kiosk | The machine screen (insert bottles, choose reward) |
| App | The user app (login, wallet, Wi-Fi, recycle) |
| Admin | The owner page (machines, transactions, users) |

All 4 tabs stay open in the background, so when you switch from the Kiosk to the App to type the code, the kiosk does not reset. They also share the same saved data, so linking and points work between tabs.

## How to install

1. Open the Drive link on your Android phone and download `BOCO-FI.apk`.
2. Tap the downloaded file.
3. If it asks, allow "Install unknown apps" for your browser or file manager.
4. Tap **Install**, then **Open**.

## Test accounts

- User app: `juandelacruz@gmail.com`, PIN `1234`
- Admin: `admin` / `admin123`

## How to use it for the demo

1. **App** tab: log in with the test account.
2. **Kiosk** tab: tap Recycle Today, START, then LOG IN. Remember the 4-letter code.
3. **App** tab: tap Recycle, type the code, tap Link my account.
4. **Kiosk** tab: it says Welcome back, Juan. Tap CONTINUE on the check screens, insert items, CLAIM, then choose a reward.
5. **App** tab: the new points show on the home screen.

To start over: in the App tab, tap **Log out**, or go to Profile and tap **Reset test data**.

## How to build it again

The Android Studio project is in the `android` folder. It copies the website files (index.html, kiosk, app, admin, assets) into the app every time it builds, so changes to the website are included automatically.

- Android Studio: open the `android` folder, then **Build > Build App Bundle(s) / APK(s) > Build APK(s)**.
- Command line:
  ```
  cd android
  gradlew assembleDebug
  ```
- Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Needs JDK 17 or 21 (set it in Android Studio under Settings > Build Tools > Gradle > Gradle JDK).
