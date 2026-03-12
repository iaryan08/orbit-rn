'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { rtdb } from '@/lib/firebase/client'
import { ref, onValue, set, onDisconnect, serverTimestamp, off, update } from 'firebase/database'

type VibrateHandler = () => void
type PresenceHandler = (onlineUserIds: string[], rawData: Record<string, any>) => void

interface ChannelEntry {
    refCount: number
    vibrateHandlers: Set<VibrateHandler>
    presenceHandlers: Set<PresenceHandler>
    userId: string
    lastIdsStr?: string
    listenerUnsub?: () => void
    vibeUnsub?: () => void
}

const registry = new Map<string, ChannelEntry>()

function setupPresenceListener(coupleId: string, entry: ChannelEntry) {
    const presenceRef = ref(rtdb, `presence/${coupleId}`)
    const vibeRef = ref(rtdb, `vibrations/${coupleId}`)

    const onPresenceValue = (snapshot: any) => {
        const data = snapshot.val() || {}
        const now = Date.now()

        const onlineUserIds = Object.entries(data)
            .filter(([id, presence]: [string, any]) => {
                if (id === entry.userId) return false

                const explicitlyOnline = presence?.is_online === true || presence?.in_cinema === true
                const rawHeartbeat = presence?.last_changed ?? presence?.online_at ?? 0
                const heartbeat = typeof rawHeartbeat === 'number'
                    ? rawHeartbeat
                    : (explicitlyOnline ? now : 0)
                const isFresh = heartbeat > 0 && (now - heartbeat) < 300000

                if (presence?.is_online === false && !presence?.in_cinema) return false
                if (explicitlyOnline) return isFresh
                if (presence?.status === 'online') return isFresh

                return isFresh
            })
            .map(([id]) => id)

        const currentIdsStr = JSON.stringify(onlineUserIds.sort())
        if (currentIdsStr !== entry.lastIdsStr) {
            entry.lastIdsStr = currentIdsStr
            console.log(`[Presence] Online IDs for ${coupleId}:`, onlineUserIds)
        }
        // Always notify handlers of the latest raw data (important for SyncCinema)
        entry.presenceHandlers.forEach(h => h(onlineUserIds, data))
    }

    const onVibeValue = (snapshot: any) => {
        const val = snapshot.val()
        if (val && val.senderId !== entry.userId) {
            entry.vibrateHandlers.forEach(h => h())
        }
    }

    // Wrap in try-catch to catch permission errors early
    try {
        onValue(presenceRef, onPresenceValue, (err) => {
            console.error(`[Presence] Listener error (Rules issue?):`, err)
        })
        onValue(vibeRef, onVibeValue, (err) => {
            console.error(`[Presence] Vibe error:`, err)
        })
    } catch (err) {
        console.error(`[Presence] Failed to attach listeners:`, err)
    }

    entry.listenerUnsub = () => off(presenceRef, 'value', onPresenceValue)
    entry.vibeUnsub = () => off(vibeRef, 'value', onVibeValue)
}

function stopPresenceListener(coupleId: string) {
    const entry = registry.get(coupleId)
    if (entry) {
        entry.listenerUnsub?.()
        entry.vibeUnsub?.()
    }
}

interface UseCoupleChannelOptions {
    coupleId: string
    userId: string
    onVibrate?: VibrateHandler
    onPresenceChange?: PresenceHandler
}

export function useCoupleChannel({ coupleId, userId, onVibrate, onPresenceChange }: UseCoupleChannelOptions) {
    const pathname = usePathname()
    const onVibrateRef = useRef(onVibrate)
    const onPresenceRef = useRef(onPresenceChange)
    onVibrateRef.current = onVibrate
    onPresenceRef.current = onPresenceChange

    const stableVibrate = useRef<VibrateHandler>(() => onVibrateRef.current?.())
    const stablePresence = useRef<PresenceHandler>((ids, raw) => onPresenceRef.current?.(ids, raw))

    const sendVibrate = useCallback(async () => {
        if (!coupleId || !userId) return
        const vibeRef = ref(rtdb, `vibrations/${coupleId}`)
        await set(vibeRef, {
            senderId: userId,
            timestamp: serverTimestamp()
        })
    }, [coupleId, userId])

    useEffect(() => {
        if (!coupleId || !userId) return

        let entry = registry.get(coupleId)
        if (!entry) {
            entry = {
                refCount: 0,
                vibrateHandlers: new Set(),
                presenceHandlers: new Set(),
                userId
            }
            registry.set(coupleId, entry)
            setupPresenceListener(coupleId, entry)
        }

        entry.refCount++
        if (onVibrate) entry.vibrateHandlers.add(stableVibrate.current)
        if (onPresenceChange) entry.presenceHandlers.add(stablePresence.current)

        return () => {
            const ent = registry.get(coupleId)
            if (ent) {
                ent.refCount--
                ent.vibrateHandlers.delete(stableVibrate.current)
                ent.presenceHandlers.delete(stablePresence.current)

                if (ent.refCount <= 0) {
                    stopPresenceListener(coupleId)
                    registry.delete(coupleId)
                }
            }
        }
    }, [coupleId, userId, onVibrate !== undefined, onPresenceChange !== undefined])

    return { sendVibrate }
}
