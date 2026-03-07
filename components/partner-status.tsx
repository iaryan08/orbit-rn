'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * PartnerStatus — shows partner's online presence dot.
 *
 * IMPORTANT: uses the SAME channel name as DashboardHeader (`online-${coupleId}`)
 * so Supabase multiplexes both components into ONE WebSocket connection.
 * Pass `coupleId` to enable deduplication. Falls back to `partnerId`-only channel.
 */
export function PartnerStatus({
    partnerId,
    coupleId,
}: {
    partnerId: string | null
    coupleId?: string | null
}) {
    const [isOnline, setIsOnline] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        if (!partnerId) return

        const onPresenceSync = (e: any) => {
            const state = e.detail;
            const onlineUsers = Object.values(state).flat() as any[]
            setIsOnline(onlineUsers.some(u => (u as any).user_id === partnerId))
        }

        window.addEventListener('orbit:presence-sync', onPresenceSync);
        return () => { window.removeEventListener('orbit:presence-sync', onPresenceSync); }
    }, [partnerId])

    return (
        <div className="relative flex items-center justify-center">
            <span className={cn(
                "w-2 h-2 rounded-full transition-colors duration-500",
                isOnline
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                    : "bg-white/10"
            )} />
            {isOnline && (
                <span className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
            )}
        </div>
    )
}