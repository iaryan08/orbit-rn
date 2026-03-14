## Native Android Perf & UX Checklist

### A. Stability & Errors

- **A1 – Remove `DashboardWidgets` hook bug**
  - [ ] Stop using `DashboardWidgets.tsx` in the native dashboard; import split `components/dashboard/*` widgets instead.
  - [ ] Verify no conditional hooks remain in any dashboard widget.
  - [ ] Confirm no “Rendered more hooks than during the previous render” errors when switching tabs in dev.

- **A2 – Presence & Firebase noise**
  - [ ] Align native presence keys with web (`presence/<coupleId>/<userId>`).
  - [ ] Ensure `NavbarDock`, `SyncCinemaScreen`, and `ConnectionSync` all read/write the same presence path.
  - [ ] Wrap Firebase Storage calls with graceful fallbacks to R2 so `storage/unknown` errors don’t spam logs.

### B. Performance & Smoothness

- **B1 – Pager swipe safety**
  - [ ] Add a `usePagerSwipeGuard` helper that temporarily disables pager swipes during inner horizontal drags.
  - [ ] Apply it to memories media carousels, quick‑log chips, and other horizontal scrollers.
  - [ ] Verify horizontal media swipes never change the main tab.

- **B2 – Image & video loading**
  - [ ] Lower upload target resolution for memories/polaroids on `isLiteMode` / Android (e.g. 1280–1600px width).
  - [ ] Tune `drawDistance` and `estimatedItemSize` for `MemoriesScreen` FlashList on low‑end devices.
  - [ ] Prefetch the first 1–2 memories when opening the tab for a snappier initial scroll.

- **B3 – Skeletons instead of blank voids**
  - [ ] Add lightweight skeleton components for Dashboard widgets, Memories list items, and Letters list items.
  - [ ] Show skeletons whenever data is loading/deferred (instead of empty black screens).
  - [ ] Keep skeletons static or simple opacity animations (no heavy JS timers).

### C. UX / Visual System

- **C1 – Typography & contrast**
  - [ ] Audit headers, pills, and captions to use consistent `Typography` families and sizes.
  - [ ] Increase contrast for important labels for dark‑room readability.
  - [ ] Normalize spacing and border radius so Dashboard, Memories, Intimacy, and Lunara feel like one story.

- **C2 – Story‑driven micro‑interactions**
  - [ ] Add light UI‑thread Reanimated touches and haptics to key actions (bucket add, cinema reactions, polaroid save).
  - [ ] Ensure micro‑animations are short `withTiming` / shared‑value based, with no extra JS work.

### D. Features & Flows

- **D1 – Avatar & wallpaper uploads**
  - [ ] Route avatar and wallpaper uploads through the R2 upload pipeline (with clear fallback copy on failure).
  - [ ] Add a small retry/pause mechanism so repeated failures don’t cause heat.

- **D2 – Partner presence UX**
  - [ ] Make partner online / “in cinema” badges read from the corrected presence path.
  - [ ] Surface consistent presence indicators in the dock and dashboard.

- **D3 – MediaViewer + polaroids + comments**
  - [ ] Extend `MediaViewer` to open directly from polaroids as well as memories.
  - [ ] Add a lightweight comment drawer for memories and polaroids (Instagram‑style).
  - [ ] Keep “Save polaroid as forever memory” inside the viewer using existing save logic.

- **D4 – On‑login flows**
  - [ ] Ensure period logging prompts appear on first login when required (gender + cycle data aware).
  - [ ] Keep prompts non‑blocking but clearly visible.

