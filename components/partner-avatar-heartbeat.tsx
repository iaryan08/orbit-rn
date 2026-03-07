'use client'

import { useState, useRef, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCoupleChannel } from '@/hooks/use-couple-channel'
import { sendHeartbeat as triggerHeartbeatPush } from '@/lib/client/notifications'
import { ImpactStyle } from '@capacitor/haptics'
import { safeImpact, safeVibrate } from '@/lib/client/haptics'
import { DecryptedImage } from './e2ee/decrypted-image'

interface PartnerAvatarProps {
    partnerProfile: any
    uProfile?: any
    coupleId: string
    className?: string
}

export function PartnerAvatarHeartbeat({ partnerProfile, uProfile, coupleId, className }: PartnerAvatarProps) {
    const [isReceiving, setIsReceiving] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [isPressing, setIsPressing] = useState(false)
    const timeoutRef = useRef<any>(null)

    const handleVibrate = useCallback(async () => {
        setIsReceiving(true)
        let usedNativeHaptics = false

        // Rhythmic double-pulse heartbeat pattern with safe fallback.
        const beat = async () => {
            const heavyWorked = await safeImpact(ImpactStyle.Heavy, 20)
            usedNativeHaptics = usedNativeHaptics || heavyWorked
            setTimeout(() => {
                void safeImpact(ImpactStyle.Medium, 20).then((worked) => {
                    usedNativeHaptics = usedNativeHaptics || worked
                })
            }, 120)
        }

        await beat()
        setTimeout(() => {
            void beat()
        }, 800)
        setTimeout(() => {
            void beat()
        }, 1600)
        if (!usedNativeHaptics) {
            safeVibrate([200, 100, 200, 400, 200, 100, 200])
        }

        if (document.visibilityState === 'hidden') {
            // Local fallback for heartbeat when app backgrounded but not "killed"
            // Note: Native FCM push handles killed state.
        }
        setTimeout(() => setIsReceiving(false), 3000)
    }, [])

    const { sendVibrate } = useCoupleChannel({
        coupleId,
        userId: uProfile?.id || '',
        onVibrate: handleVibrate,
    })

    const handlePressStart = async () => {
        setIsPressing(true)
        await safeImpact(ImpactStyle.Light, 20)
        timeoutRef.current = setTimeout(() => handleSendHeartbeat(), 600)
    }

    const handlePressEnd = () => {
        setIsPressing(false)
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }

    const handleSendHeartbeat = async () => {
        await safeImpact(ImpactStyle.Medium, [100, 50, 100])
        setIsSending(true)
        await sendVibrate()
        await triggerHeartbeatPush({
            actorId: uProfile?.id,
            partnerId: partnerProfile?.id,
            displayName: uProfile?.display_name
        })
        setTimeout(() => setIsSending(false), 2000)
    }

    if (!partnerProfile) {
        return (
            <div className={cn('w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-background bg-secondary/20 flex items-center justify-center ring-2 ring-white/10 overflow-hidden shadow-xl', className)}>
                <div className="w-full h-full flex items-center justify-center bg-cyan-500/20 text-cyan-200 font-bold text-xs">P</div>
            </div>
        )
    }

    const isActive = isReceiving || isSending

    return (
        <div
            className={cn('relative flex items-center', uProfile ? '-space-x-4' : '')}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* User Avatar */}
            {uProfile && (
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-background bg-primary/20 flex items-center justify-center ring-2 ring-white/10 overflow-hidden shadow-xl relative z-0">
                    {uProfile.avatar_url
                        ? (
                            <DecryptedImage
                                src={uProfile.avatar_url}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                                alt="You"
                                bucket="avatars"
                                priority
                            />
                        )
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-500/20 to-rose-900/30 text-rose-100/60 font-bold text-xs">{uProfile.display_name?.charAt(0) || 'U'}</div>
                    }
                </div>
            )}

            {/* Partner Avatar */}
            <div className="relative">
                {/* CSS ripples — no Framer Motion, no JS on idle */}
                {isActive && (
                    <div className="absolute inset-0 z-0">
                        <div className="absolute inset-0 animate-ping rounded-full bg-rose-500/20" />
                    </div>
                )}

                <div
                    className={cn(
                        'relative z-10 w-10 h-10 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center overflow-hidden shadow-xl cursor-pointer select-none bg-secondary/20 transition-all duration-300',
                        isActive
                            ? 'border-rose-400 ring-2 ring-rose-400/25 scale-105 shadow-[0_0_6px_rgba(244,63,94,0.22)] md:shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                            : isPressing
                                ? 'border-background ring-2 ring-white/10 scale-95'
                                : 'border-background ring-2 ring-white/10 scale-100'
                    )}
                >
                    {partnerProfile?.avatar_url
                        ? (
                            <DecryptedImage
                                src={partnerProfile.avatar_url}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover pointer-events-none"
                                alt="Partner Avatar"
                                bucket="avatars"
                                priority
                            />
                        )
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-500/20 to-rose-900/30 text-rose-100/60 font-bold text-xs pointer-events-none">{partnerProfile?.display_name?.charAt(0) || 'P'}</div>
                    }


                    {/* Aesthetic Corner Heartbeat */}
                    {isActive && (
                        <div className="absolute bottom-0 right-0 z-20">
                            <div className="bg-rose-500/90 rounded-full p-1 border border-white/20">
                                <Heart className="w-2.5 h-2.5 text-white fill-white" />
                            </div>
                        </div>
                    )}

                    {/* Calm tint only; avoids glittery shimmer */}
                    {isActive && (
                        <div className="absolute inset-0 bg-rose-500/5 pointer-events-none" />
                    )}
                </div>

                {/* Press tip — CSS only */}
                {isPressing && !isSending && (
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-20 pointer-events-none text-[9px] font-bold uppercase tracking-widest text-rose-200 bg-black/60 px-2 py-0.5 rounded-full border border-rose-500/20">
                        Hold to Send Love
                    </span>
                )}
            </div>
        </div>
    )
}
