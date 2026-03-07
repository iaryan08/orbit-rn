'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useCoupleChannel } from '@/hooks/use-couple-channel'
import { useAuth } from '@/contexts/auth-context'

/**
 * PartnerStatus — shows partner's online presence dot.
 * Uses the shared useCoupleChannel hook for consistent RTDB presence tracking.
 */
export function PartnerStatus({
    partnerId,
    coupleId,
}: {
    partnerId: string | null
    coupleId?: string | null
}) {
    const [isOnline, setIsOnline] = useState(false)
    const { user } = useAuth()

    useCoupleChannel({
        coupleId: coupleId || '',
        userId: user?.uid || '',
        onPresenceChange: (onlineIds) => {
            setIsOnline(!!partnerId && onlineIds.includes(partnerId))
        }
    })

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