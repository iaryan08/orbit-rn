# Orbit OTA Updates Guide (EAS Update)

This guide explains how to deliver Over-The-Air (OTA) updates to your signed APK without redistributing the file.

## 🚀 How it Works
EAS Update allows you to push JavaScript and asset changes directly to your users' devices. When the app starts, it checks for updates and downloads them in the background.

## 🛠 Prerequisites
Your project is already configured with:
- `expo-updates` library.
- `runtimeVersion` policy in `app.json`.
- `eas.json` build profiles.

## 📦 Delivering an Update

Follow these steps to push changes without a new APK:

### 1. Execute the Update
Run the following command in the `native` directory:
```powershell
npx eas update --platform android --branch main --message "Your update description"
```

### 2. Link Branch to Channel (First time only)
If your APK was built with a specific channel (e.g., `preview`), ensure it is linked to your branch:
```powershell
npx eas channel:edit preview --branch main
```

## ⚠️ Important Limitations
OTA updates **ONLY** work for JavaScript, CSS, and Asset changes. You **MUST** build and send a new APK if you:
- Add/remove npm packages that contain **native code**.
- Change **permissions** in `app.json` (e.g., adding `CAMERA` permission).
- Change the **app icon** or **splash screen**.
- Modify the **`android/`** directory.
- Change the **`version`** or **`runtimeVersion`** in `app.json`.

## 🔄 Update Loading Behavior
By default, Expo uses a "Background" loading strategy:
1. User opens the app.
2. App checks for update in the background.
3. User continues using the *old* version.
4. When the user closes and re-opens the app later, the *new* version is applied.

## 📊 Monitoring
You can monitor your deployments and see how many devices have received the update at:
[https://expo.dev/projects/8dba604e-7f8f-4bf1-bd84-e70058ab1e45/updates](https://expo.dev/projects/8dba604e-7f8f-4bf1-bd84-e70058ab1e45/updates)
