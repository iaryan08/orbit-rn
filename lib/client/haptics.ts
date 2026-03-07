'use client'

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

type Pattern = number | number[]

function canVibrate() {
  return typeof window !== 'undefined' && typeof window.navigator?.vibrate === 'function'
}

export function safeVibrate(pattern: Pattern = 10): boolean {
  if (!canVibrate()) return false
  return window.navigator.vibrate(pattern)
}

export async function safeImpact(
  style: ImpactStyle = ImpactStyle.Light,
  fallbackPattern: Pattern = 10,
): Promise<boolean> {
  try {
    await Haptics.impact({ style })
    return true
  } catch {
    return safeVibrate(fallbackPattern)
  }
}

export async function safeSelectionChanged(fallbackPattern: Pattern = 5): Promise<boolean> {
  try {
    await Haptics.selectionChanged()
    return true
  } catch {
    return safeVibrate(fallbackPattern)
  }
}
export async function triggerHaptic(intensity: 'light' | 'medium' | 'heavy' | 'success' | 'error' | number = 'light') {
  try {
    if (intensity === 'success' || intensity === 'error') {
      await Haptics.notification({
        type: intensity === 'success' ? NotificationType.Success : NotificationType.Error
      });
      return;
    }

    const style =
      intensity === 'heavy' ? ImpactStyle.Heavy :
        intensity === 'medium' ? ImpactStyle.Medium :
          ImpactStyle.Light;

    await Haptics.impact({ style });
  } catch {
    if (typeof window !== 'undefined' && window.navigator?.vibrate) {
      const ms = typeof intensity === 'number' ? intensity : (intensity === 'heavy' ? 40 : intensity === 'medium' ? 25 : 15);
      window.navigator.vibrate(ms);
    }
  }
}
