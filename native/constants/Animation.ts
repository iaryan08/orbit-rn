/**
 * Orbit Animation Presets
 * ─────────────────────────────────────────────────────────────
 * Centralised animation config. Use these everywhere so the app
 * has a single, consistent feel across all transitions.
 *
 * Design principle: fast in, smooth out. Nothing should feel sluggish.
 *
 * Durations:
 *   SHORT  80ms  – micro interactions (pill, icon colour)
 *   BASE   200ms – standard UI transitions (modals, drawers sliding in)
 *   LONG   300ms – complex entrance animations (page transitions)
 *
 * Easings (withTiming):
 *   ENTER  – decelerating (fast start, gentle land)
 *   EXIT   – accelerating (instant leave, no overhang)
 *   SPRING – reserved for physics-feel elements (e.g. scroll snap)
 */

import { Easing } from 'react-native-reanimated';

// ─── Durations ─────────────────────────────────────────────────

export const DURATION = {
    short: 80,
    base: 200,
    long: 300,
} as const;

// ─── Easing curves ─────────────────────────────────────────────

export const EASING = {
    enter: Easing.out(Easing.cubic),   // decelerate in
    exit: Easing.in(Easing.quad),     // accelerate out
    snap: Easing.out(Easing.back(1.2)), // slight overshoot for "snap" feel
} as const;

// ─── Ready-made withTiming configs ─────────────────────────────

/** Standard sheet / drawer slide-in */
export const ANIM_ENTER = {
    duration: DURATION.base,
    easing: EASING.enter,
} as const;

/** Standard dismiss */
export const ANIM_EXIT = {
    duration: 160,
    easing: EASING.exit,
} as const;

/** Overlay fade-in (backdrop, search palette) */
export const ANIM_FADE_IN = {
    duration: 160,
    easing: EASING.enter,
} as const;

/** Overlay fade-out */
export const ANIM_FADE_OUT = {
    duration: 120,
    easing: EASING.exit,
} as const;

/** Short: pill slide, icon colour switch */
export const ANIM_MICRO = {
    duration: DURATION.short,
    easing: EASING.enter,
} as const;

// ─── withSpring config (pill / elastic elements only) ──────────

export const SPRING_SNAPPY = {
    damping: 20,
    stiffness: 500,
    mass: 0.2,
} as const;
