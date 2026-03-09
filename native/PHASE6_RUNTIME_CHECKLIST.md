# Phase 6 Runtime Checklist (Device/Emulator)

Use this after release build is available. Mark each line as `PASS` / `FAIL` and include brief notes.

## A) Functional Regression
- [ STRUGGLE ] Login flow works (`/login` -> main app) - PAGE RESTART NEEDED
- [ PASSS ] Logout returns to login cleanly
- [ NOT FAST - INSTANT ] Bottom navigation tab switching is correct
- [ FAIL ] Pager/tab sync does not desync after rapid taps/swipes - IT JITTER
- [ PASS ] Memories feed loads and scrolls correctly
- [ PPASS ] Open memory media viewer from feed works
- [ RETEST ] Memory edit (title + caption/content) saves correctly from media viewer
- [ RETEST ] Memory delete removes item from feed without restart
- [ RETEST ] Compose memory: pick media, title/content, send works
- [ RETEST ] Newly uploaded memory appears without app restart
- [ PASS ] Letters feed loads and scrolls correctly
- [ PASS ] Open letter details modal works
- [ PASS ] Compose letter send works
- [ FAIL ] Scheduled letter options work (if enabled)
- [ PASS ] Vanish mode behavior works (if enabled)
- [ FAIL ] Shared canvas draw/undo/redo/clear all work
- [ FAIL ] Shared canvas sync state appears correctly for partner state updates
- [ PASS ] Sync Cinema opens and interaction HUD works
- [ PASS ] Sync Cinema reactions/presence handling works

## B) Performance Smoke
- [ ALMOST ] Memories feed sustained scroll is smooth
- [ ALMOST ] Letters feed sustained scroll is smooth
- [ PASS ] Compose modal open/close is smooth
- [ FAIL ] Canvas stroke latency feels immediate
- [ FAIL ] Canvas pinch/pan remains smooth under continuous interaction
- [ PASS ] Sync Cinema gesture interactions remain responsive
- [ PASS ] Header transitions while scrolling have no visible jank

## C) Stability / Edge Cases
- [ PASS ] No crashes during rapid tab switches
- [ PASS ] No crashes when opening/closing modal screens repeatedly
- [ PASS ] No crashes when leaving screen during pending timers/animations
- [ PASS ] No stuck states after network drop/reconnect
- [ FAIL ] Canvas does not corrupt after repeated undo/redo/clear actions
- [ PASS ] Memory upload with multiple assets does not freeze app

## E) Hotfix Retest (2026-03-08)
- [ PASS ] Firebase memory upload no longer fails with `storage/unknown`
- [ PASS ] Memory upload works for both single image and multi-image payload
- [ PASS ] Memory upload works for at least one short video (if enabled)
- [ PASS ] Upload still succeeds after app restart (no stale config/bucket issue)
- [ PASS ] Console no longer logs repeated `[FirebaseStorage] Upload attempt failed`

## D) Device Matrix
- [ ] Mid-range Android test device completed
- [ ] Android version noted
- [ ] Build type noted (`debug`/`release`)
- [ ] Result summary captured
