# 🚀 Ultra-Fast Android Building Guide (Orbit Native)

To reduce build times from **20+ minutes** to under **2 minutes**, follow these high-performance strategies:

## 1. Shorten the Project Path (CRITICAL)
Windows has a **250-character path limit**. Deep directory structures like `C:\Users\Aryan\Desktop\orbit-v2\...` cause the C++ compiler (used for Skia/Reanimated) to crash or restart.
- **Action**: Move your project to a short root path like `C:\orbit`.

## 2. Target a Single Architecture
By default, Gradle builds for `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64`. This is building the app 4 times!
- **Action**: In `android/gradle.properties`, change:
  ```properties
  # For Physical devices (most modern phones)
  reactNativeArchitectures=arm64-v8a
  # OR for Emulators
  reactNativeArchitectures=x86_64
  ```

## 3. Windows Defender Exclusions
Anti-virus scans every temporary C++ file generated during compilation, slowing you down by 50-70%.
- **Action**: Add your project folder (`C:\orbit`) to **Windows Defender > Virus & threat protection > Manage settings > Exclusions**.

## 4. Gradle Resource Optimization (Applied 🛠️)
I've already updated your `gradle.properties` with these "Ultra" settings:
- `org.gradle.jvmargs=-Xmx4096m`: Increases heap memory to 4GB.
- `org.gradle.parallel=true`: Compiles modules in parallel.
- `org.gradle.caching=true`: Reuses previously compiled parts of the app.

## 5. Selective Build Offline
If you haven't added new `npm` packages, skip the network dependency check:
```powershell
npx expo run:android --offline
```

---