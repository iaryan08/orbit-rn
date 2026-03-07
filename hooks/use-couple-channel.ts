'use client'

/**
 * useCoupleChannel — ONE shared Supabase channel for all real-time features.
 *
 * Uses a module-level registry so that multiple components calling this hook
 * with the same coupleId share a SINGLE WebSocket connection — not one each.
 *
 * Pauses when the tab goes hidden → 0 CPU / no phone heat when screen is off.
 * Resumes instantly when the user comes back.
 */

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type PresencePayload = { user_id: string; online_at: string; pathname: string }
type VibrateHandler = () => void
type PresenceHandler = (onlineUserIds: string[]) => void

interface ChannelEntry {
    channel: any
    refCount: number
    vibrateHandlers: Set<VibrateHandler>
    presenceHandlers: Set<PresenceHandler>
    userId: string
}

// Module-level singleton registry (survives re-renders, shared across components)
const registry = new Map<string, ChannelEntry>()

function getOnlineIds(entry: ChannelEntry): string[] {
    const state = entry.channel.presenceState()
    const ids = new Set<string>()
    const now = Date.now()
    const STALE_AFTER_MS = 1000 * 90
    for (const presences of Object.values(state)) {
        for (const p of presences as PresencePayload[]) {
            if (!p?.user_id || p.user_id === entry.userId) continue
            const ts = p.online_at ? new Date(p.online_at).getTime() : now
            if (Number.isFinite(ts) && now - ts <= STALE_AFTER_MS) {
                ids.add(p.user_id)
            }
        }
    }
    return Array.from(ids)
}

function notifyPresence(entry: ChannelEntry) {
    const ids = getOnlineIds(entry)
    entry.presenceHandlers.forEach(h => h(ids))
}

function createEntry(coupleId: string, userId: string): ChannelEntry {
    const supabase = createClient()
    const ch = supabase.channel(`orbit-${coupleId}`, {
        config: { presence: { key: userId } },
    })

    const entry: ChannelEntry = {
        channel: ch,
        refCount: 0,
        vibrateHandlers: new Set(),
        presenceHandlers: new Set(),
        userId,
    }

    ch
        .on('presence', { event: 'sync' }, () => notifyPresence(entry))
        .on('presence', { event: 'join' }, () => notifyPresence(entry))
        .on('presence', { event: 'leave' }, () => notifyPresence(entry))
        .on('broadcast', { event: 'vibrate' }, () => {
            entry.vibrateHandlers.forEach(h => h())
        })
        .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                await ch.track({
                    user_id: userId,
                    online_at: new Date().toISOString(),
                    pathname: typeof window !== 'undefined' ? window.location.pathname : '/',
                })
            }
        })

    return entry
}

interface UseCoupleChannelOptions {
    coupleId: string
    userId: string
    onVibrate?: VibrateHandler
    onPresenceChange?: PresenceHandler
}

let visibilityHandlerAdded = false

function setupVisibilityHandler() {
    if (typeof document === 'undefined' || visibilityHandlerAdded) return
    visibilityHandlerAdded = true

    const handleVisibility = async (isHidden: boolean) => {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        if (isHidden) {
            for (const entry of registry.values()) {
                supabase.removeChannel(entry.channel)
                // Instantly mark offline for local UI when tab is hidden
                entry.presenceHandlers.forEach(h => h([]))
            }
        } else {
            for (const [coupleId, entry] of registry.entries()) {
                const fresh = createEntry(coupleId, entry.userId)
                fresh.refCount = entry.refCount
                fresh.vibrateHandlers = entry.vibrateHandlers
                fresh.presenceHandlers = entry.presenceHandlers
                registry.set(coupleId, fresh)
            }
        }
    }

    document.addEventListener('visibilitychange', () => {
        handleVisibility(document.hidden)
    })

    import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
            handleVisibility(!isActive)
        })
    }).catch(() => { })
}

export function useCoupleChannel({ coupleId, userId, onVibrate, onPresenceChange }: UseCoupleChannelOptions) {
    const pathname = usePathname()
    const onVibrateRef = useRef(onVibrate)
    const onPresenceRef = useRef(onPresenceChange)
    onVibrateRef.current = onVibrate
    onPresenceRef.current = onPresenceChange

    // Stable handler wrappers that always call the latest ref
    const stableVibrate = useRef<VibrateHandler>(() => onVibrateRef.current?.())
    const stablePresence = useRef<PresenceHandler>((ids) => onPresenceRef.current?.(ids))

    const sendVibrate = useCallback(async () => {
        const entry = registry.get(coupleId)
        if (entry?.channel) {
            await entry.channel.send({ type: 'broadcast', event: 'vibrate', payload: {} })
        }
    }, [coupleId])

    useEffect(() => {
        if (!coupleId || !userId) return
        setupVisibilityHandler()

        // ── Acquire shared channel ────────────────────────────────────
        let entry = registry.get(coupleId)
        if (!entry) {
            entry = createEntry(coupleId, userId)
            registry.set(coupleId, entry)
        }
        entry.refCount++

        if (onVibrate) entry.vibrateHandlers.add(stableVibrate.current)
        if (onPresenceChange) entry.presenceHandlers.add(stablePresence.current)

        const supabase = createClient()

        return () => {

            const e = registry.get(coupleId)
            if (!e) return

            e.vibrateHandlers.delete(stableVibrate.current)
            e.presenceHandlers.delete(stablePresence.current)
            e.refCount--

            if (e.refCount <= 0) {
                supabase.removeChannel(e.channel)
                registry.delete(coupleId)
            }
        }
    }, [coupleId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-track presence on pathname changes ─────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return
        const entry = registry.get(coupleId)
        if (entry?.channel && userId) {
            entry.channel.track({
                user_id: userId,
                online_at: new Date().toISOString(),
                pathname: window.location.pathname
            })
        }
    }, [pathname, coupleId, userId])

    return { sendVibrate }
}
