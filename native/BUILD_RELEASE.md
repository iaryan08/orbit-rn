# Android Release Build Guide

This guide is for building a production Android release from `native/`.

## 1) Prerequisites
- Android Studio installed
- JDK available (Android Studio JBR is acceptable)
- Android SDK + build tools installed
- Node/npm installed

## 2) Required signing variables
Release signing is configured in `android/app/build.gradle` to read:
- `ORBIT_UPLOAD_STORE_FILE`
- `ORBIT_UPLOAD_STORE_PASSWORD`
- `ORBIT_UPLOAD_KEY_ALIAS`
- `ORBIT_UPLOAD_KEY_PASSWORD`

If these are missing, build will fall back to debug signing (not for production distribution).

## 3) PowerShell setup (session-only)
Run from repository root:

```powershell
cd native\android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:GRADLE_USER_HOME = "$PWD\.gradle-user-local"

$env:ORBIT_UPLOAD_STORE_FILE = "C:\path\to\your-release-keystore.jks"
$env:ORBIT_UPLOAD_STORE_PASSWORD = "<store-password>"
$env:ORBIT_UPLOAD_KEY_ALIAS = "<key-alias>"
$env:ORBIT_UPLOAD_KEY_PASSWORD = "<key-password>"
```

## 4) Build commands

Debug sanity:
```powershell
.\gradlew.bat assembleDebug
```

Release:
```powershell
.\gradlew.bat --no-daemon assembleRelease
```

Outputs:
- APK: `native/android/app/build/outputs/apk/release/`
- AAB (if configured/build target): `native/android/app/build/outputs/bundle/release/`

## 5) Suggested troubleshooting order
1. Confirm `java -version` works in same shell.
2. Confirm signing env vars are present:  
   `Get-ChildItem Env:ORBIT_UPLOAD_*`
3. Clear local project gradle cache:
   ```powershell
   Remove-Item -Recurse -Force .\.gradle-user-local -ErrorAction SilentlyContinue
   ```
4. Retry with conservative flags:
   ```powershell
   .\gradlew.bat --no-daemon --no-configuration-cache -Dorg.gradle.parallel=false assembleRelease
   ```
5. If still failing with groovy-dsl workspace move error, run outside synced/protected folders and ensure no process is locking `.gradle` directories.

## 6) Post-build runtime verification
Use:
- `PHASE6_RUNTIME_CHECKLIST.md`
