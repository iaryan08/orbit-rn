# Local Signed APK Generation Guide (Android Studio)

This guide covers the manual steps required **before** opening Android Studio to ensure your Expo project is ready for a signed production build.

## 1. Sync Native Files (Expo Prebuild)
Since your project uses Expo, the `android` folder is generated from your `app.json`. Before building, ensure your native code is in sync with your latest JS changes and configuration.

Run this in the `native` directory:
```powershell
npx expo prebuild --platform android
```

## 2. Generate a Keystore (.jks)
To sign an APK, you need a Keystore file. If you don't have one, generate it using the JDK `keytool`.

Run this command (replace `my-release-key` and `my-key-alias` with your preferred names):
```powershell
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```
> [!IMPORTANT]
> **Keep this file safe!** If you lose it, you cannot update your app on the Play Store. Do **not** commit this file to public git repositories.

## 3. Configure Android Signing (Optional but Recommended)
Instead of typing the password every time in Android Studio, you can configure it in your `android/app/build.gradle`.

1. Move your `.jks` file to `native/android/app/`.
2. Edit `native/android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file('my-release-key.jks')
            storePassword 'YOUR_STORE_PASSWORD'
            keyAlias 'my-key-alias'
            keyPassword 'YOUR_KEY_PASSWORD'
        }
    }
    buildTypes {
        release {
            ...
            signingConfig signingConfigs.release
        }
    }
}
```

## 4. Prepare for Android Studio
Before opening the project, it's good practice to clean any previous build artifacts:

```powershell
cd android
./gradlew clean
cd ..
```

---

## 🏗️ Inside Android Studio
Now that the preparation is done:
1. Open Android Studio.
2. Click **Open** and select the `native/android` folder.
3. Wait for the Gradle sync to finish (check the progress bar at the bottom).
4. Go to **Build > Generate Signed Bundle / APK...**
5. Select **APK** and click **Next**.
6. Choose your `my-release-key.jks` file and enter the credentials you created in Step 2.
7. Select **release** build variant.
8. Click **Finish**. Your signed APK will be in `android/app/release/`.
