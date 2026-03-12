'use client'

import { useEffect } from 'react'
import { rtdb } from '@/lib/firebase/client'
import { ref, onValue, onDisconnect, serverTimestamp, update } from 'firebase/database'
import { useCoupleChannel } from '@/hooks/use-couple-channel'

export function PresenceTracker({ coupleId, userId }: { coupleId: string; userId: string }) {
    useEffect(() => {
        if (!coupleId || !userId) return

        const userPresenceRef = ref(rtdb, `presence/${coupleId}/${userId}`)
        const connectedRef = ref(rtdb, '.info/connected')

        const updateMyPresence = async (isOnline: boolean) => {
            try {
                const payload: any = {
                    is_online: isOnline,
                    online_at: serverTimestamp(),
                    last_changed: serverTimestamp(),
                }
                await update(userPresenceRef, payload)

                if (isOnline) {
                    onDisconnect(userPresenceRef).update({
                        is_online: false,
                        in_cinema: null,
                        online_at: serverTimestamp(),
                        last_changed: serverTimestamp()
                    })
                    console.log(`[Presence] Mark Online: ${userId} (Global)`)
                } else {
                    console.log(`[Presence] Mark Offline: ${userId} (Global)`)
                }
            } catch (err) {
                console.warn('[Presence] Update failed:', err)
            }
        }

        // Listen for connection state changes
        const unsubConnect = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                console.log('RTDB Connected')
                updateMyPresence(true)
            } else {
                console.log('RTDB Disconnected')
            }
        })

        // Self-heal heartbeat (Once a minute - zero burden)
        const interval = setInterval(() => updateMyPresence(true), 60000)

        return () => {
            unsubConnect()
            clearInterval(interval)
            updateMyPresence(false).catch(() => { })
        }
    }, [coupleId, userId])

    // Global vibration listener - works on every page
    useCoupleChannel({
        coupleId,
        userId,
        onVibrate: () => {
            console.log('[Presence] Global Heartbeat Received')
            import('@/lib/client/haptics').then(({ safeImpact }) => {
                const { ImpactStyle } = require('@capacitor/haptics')
                const beat = async () => {
                    await safeImpact(ImpactStyle.Heavy, 20)
                    setTimeout(() => safeImpact(ImpactStyle.Medium, 20), 120)
                }
                void beat()
                setTimeout(() => void beat(), 800)
                setTimeout(() => void beat(), 1600)
            })
        }
    })

    return null
}
