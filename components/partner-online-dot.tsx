'use client'

import { useState, useCallback } from 'react'
import { useCoupleChannel } from '@/hooks/use-couple-channel'

interface PartnerOnlineDotProps {
    coupleId: string
    userId: string
    partnerId: string
}

export function PartnerOnlineDot({ coupleId, userId, partnerId }: PartnerOnlineDotProps) {
    const [isOnline, setIsOnline] = useState(false)

    const handlePresence = useCallback((onlineIds: string[]) => {
        const online = onlineIds.includes(partnerId)
        console.log(`[PartnerOnlineDot] Online IDs:`, onlineIds, `Partner: ${partnerId}`, `IsOnline: ${online}`)
        setIsOnline(online)
    }, [partnerId])

    // Shares the same channel as PartnerAvatarHeartbeat — no extra connection
    useCoupleChannel({
        coupleId,
        userId,
        onPresenceChange: handlePresence,
    })

    if (!isOnline) return null

    return (
        <span
            title="Online now"
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-[#0a0a0a] shadow-[0_0_12px_rgba(251,191,36,0.6)] z-30 transition-opacity duration-300"
        />
    )
}
