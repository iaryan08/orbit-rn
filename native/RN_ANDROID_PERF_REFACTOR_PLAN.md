# React Native Android Performance Refactor Plan

## Scope
Production hardening for `/native` React Native app with focus on:
- JS thread load reduction
- Re-render containment
- Smooth 60fps interactions/animations
- Android mid-range stability
- Crash/edge-case reduction

## Execution Model
Work is delivered in **phases**. Each phase is implemented and verified before moving forward.

## Master Task Checklist

### Phase 0 - Baseline Audit (Completed)
- [x] Identify hottest screens/components (`MemoriesScreen`, `LettersScreen`, `SharedCanvas`, `SyncCinemaScreen`, root layout)
- [x] Identify store subscription overreach and render churn
- [x] Identify list virtualization gaps and render-path heavy logic
- [x] Identify gesture/animation bridge bottlenecks
- [x] Identify Android config and permission risks

### Phase 1 - Re-render Containment (Completed)
- [x] Replace broad `useOrbitStore()` destructuring with selector-based subscriptions
- [x] Scope store subscriptions with selector-based reads (Zustand v5-safe pattern)
- [x] Remove/limit avoidable computed work in render paths
- [x] Verify no behavior regressions in tab navigation and overlays

### Phase 2 - List Performance Hardening (Completed)
- [x] Tune `FlashList` (`drawDistance`, `removeClippedSubviews`, item typing)
- [x] Stabilize render callbacks and key extractors
- [x] Memoize heavy list/list-header subtrees
- [x] Reduce per-item allocations/logging in render
- [x] Bound media upload concurrency in memory composer flow

### Phase 3 - Canvas/Gesture Throughput (Completed)
- [x] Reduce `runOnJS` frequency in `SharedCanvas`
- [x] Batch/buffer realtime delta payloads
- [x] Reduce persistence frequency for full-state stroke writes (debounced)
- [x] Keep gesture updates on UI thread wherever possible

### Phase 4 - Async & Lifecycle Safety (Completed)
- [x] Harden timer cleanup patterns (`setTimeout`/`setInterval` refs)
- [x] Guard async state updates after unmount
- [x] Remove race-prone delayed cleanup logic in focused screens
- [x] Add timeout cleanup guards in `MilestoneCard`, `SettingsScreen`, `SearchPalette`

### Phase 5 - Android Release Optimization (In Progress)
- [x] Production release signing setup scaffold (ORBIT_UPLOAD_* gradle properties)
- [x] Enable shrink/minify in release profile
- [x] Remove legacy/deprecated storage permission usage
- [ ] Validate startup/runtime behavior on mid-range Android

### Phase 5A - Release Validation Checklist
- [ ] Provide `ORBIT_UPLOAD_STORE_FILE`
- [ ] Provide `ORBIT_UPLOAD_STORE_PASSWORD`
- [ ] Provide `ORBIT_UPLOAD_KEY_ALIAS`
- [ ] Provide `ORBIT_UPLOAD_KEY_PASSWORD`
- [ ] Build `assembleRelease` successfully
- [ ] Install and cold-start app on target Android device
- [ ] Verify launch, login, dashboard load, list scrolling, media, and canvas flows
- [x] Build process documented in `BUILD_RELEASE.md`
- [x] Build attempt history captured in `RELEASE_BUILD_ATTEMPTS.md`

### Current Blocker (Environment)
- Gradle release build is currently blocked by a local file-system issue:
  `Could not move temporary workspace ...\\groovy-dsl\\<hash>-<tmp> -> ...\\groovy-dsl\\<hash>`
- Reproduced across:
  - default `GRADLE_USER_HOME`
  - project-local `GRADLE_USER_HOME`
  - `--no-daemon`
  - `--no-configuration-cache`
  - `-Dorg.gradle.parallel=false`

### Phase 6 - Verification & Release Gate (In Progress)
- [x] Static verification pass (`tsc`, timer cleanup scan, store subscription scan, list usage scan)
- [x] Functional smoke checklist prepared for navigation/compose/media/sync
- [x] Performance smoke checklist prepared for scroll/gestures/transitions
- [x] Stability smoke checklist prepared for timers/async/unmount safety
- [x] Runtime checklist documented in `PHASE6_RUNTIME_CHECKLIST.md`
- [x] Memory upload `storage/unknown` hotfix merged (bucket fallback + upload strategy fallback)
- [ ] Runtime functional regression pass on device (navigation, compose, media, sync)
- [ ] Runtime performance spot-check on device (scroll, gestures, transitions)
- [ ] Runtime stability pass on device (edge flows)
- [ ] Final changelog and risk notes

## Current Phase
**Phase 6 - Verification & Release Gate**
