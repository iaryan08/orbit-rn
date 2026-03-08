'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Film, Plus, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useOrbitStore } from '@/lib/store/global-store'
import { DecryptedImage } from './e2ee/decrypted-image'
import { useAuth } from '@/contexts/auth-context'
import { rtdb } from '@/lib/firebase/client'
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp, update } from 'firebase/database'
import { useCoupleChannel } from '@/hooks/use-couple-channel'
// import { useOrbitStore } from '@/lib/orbit/store'
// import { OrbitProvider } from '@/lib/orbit/provider'

interface SyncCinemaProps {
    coupleId?: string | null
    partnerId?: string | null
    userId?: string | null
    isActive: boolean
    onClose: () => void
}

type ReactionType = 'laugh' | 'heartbeat' | 'tap'

type ReactionPayload = {
    senderId?: string
    senderName?: string
    type?: ReactionType | string
    emoji?: string
}

type EmojiPresetPayload = {
    senderId?: string
    senderName?: string
    emoji?: string
}

type NavPayload = {
    senderId: string
    senderName: string
    event: 'double_tap' | 'swipe'
    direction?: 'forward' | 'backward' | 'up' | 'down'
}

const BASE_EMOJIS = ['✨', '🥺', '😘', '🍿']
const SINGLE_EMOJI_REGEX = /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u

export function SyncCinema({ coupleId, partnerId, userId, isActive, onClose }: SyncCinemaProps) {
    const { user } = useAuth()
    const currentUserId = user?.uid || userId
    const [incomingReaction, setIncomingReaction] = useState<{ type: ReactionType; emoji?: string; senderName?: string; senderId?: string } | null>(null)
    const [selectedEmoji, setSelectedEmoji] = useState(BASE_EMOJIS[0])
    const [customEmojis, setCustomEmojis] = useState<string[]>([])
    const isNative = Capacitor.isNativePlatform()
    const pressTimer = useRef<any>(null)
    const touchStartY = useRef<number>(0)
    const closeReactionTimer = useRef<any>(null)
    const tapTimeoutRef = useRef<any>(null)
    const lastNavAt = useRef<number>(0)

    const partnerName = useOrbitStore(state => state.getPartnerDisplayName())
    const myName = (useOrbitStore.getState().profile as any)?.display_name || 'You'
    const sessionEmojiKey = `orbit:cinema:emoji-presets:${coupleId || 'global'}`
    const emojis = [...BASE_EMOJIS, ...customEmojis].slice(0, 8)

    const clearReactionTimer = () => {
        if (closeReactionTimer.current) {
            window.clearTimeout(closeReactionTimer.current)
            closeReactionTimer.current = null
        }
    }

    const [partnerInCinema, setPartnerInCinema] = useState(false)
    const [incomingNav, setIncomingNav] = useState<{ name: string; type: string } | null>(null)

    const safeSetIncomingReaction = (next: { type: ReactionType; emoji?: string; senderName?: string; senderId?: string } | null, duration = 1200) => {
        clearReactionTimer()
        setIncomingReaction(next)
        if (next) {
            closeReactionTimer.current = window.setTimeout(() => {
                setIncomingReaction(null)
                closeReactionTimer.current = null
            }, duration)
        }
    }

    const normalizeSingleEmoji = (value: string): string | null => {
        const trimmed = value.trim()
        if (!trimmed) return null

        try {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
            const segments = Array.from(segmenter.segment(trimmed), s => s.segment)
            if (segments.length !== 1) return null
            const candidate = segments[0]
            return SINGLE_EMOJI_REGEX.test(candidate) ? candidate : null
        } catch {
            return SINGLE_EMOJI_REGEX.test(trimmed) ? trimmed : null
        }
    }

    const isSingleEmoji = (value: string) => {
        return normalizeSingleEmoji(value) !== null
    }

    const appendCustomEmoji = (emoji: string) => {
        if (!isSingleEmoji(emoji)) return
        setCustomEmojis(prev => {
            const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 4)
            try {
                sessionStorage.setItem(sessionEmojiKey, JSON.stringify(next))
            } catch { }
            return next
        })
    }

    const sendCustomEmojiPreset = async (emoji: string) => {
        if (!currentUserId || !coupleId) return
        try {
            if ((window as any).orbitSend) {
                (window as any).orbitSend('cinema_event', {
                    event: 'emoji-preset',
                    senderId: currentUserId,
                    senderName: myName,
                    emoji
                })
            }
        } catch {
            // best-effort realtime broadcast
        }
    }

    const handleAddCustomEmoji = async () => {
        const input = window.prompt('Add one emoji')
        if (!input) return
        const emoji = normalizeSingleEmoji(input)
        if (!emoji) return
        appendCustomEmoji(emoji)
        setSelectedEmoji(emoji)
        await sendCustomEmojiPreset(emoji)
    }

    // Handle scroll lock and cinema mode flag
    // Presence tracking for cinema
    useCoupleChannel({
        coupleId: coupleId || '',
        userId: currentUserId || '',
        onPresenceChange: (_onlineIds: string[], rawData: Record<string, any>) => {
            if (partnerId && rawData[partnerId]) {
                setPartnerInCinema(!!rawData[partnerId].in_cinema)
            }
        }
    })

    useEffect(() => {
        if (!isActive || !coupleId || !currentUserId) return

        const presenceRef = ref(rtdb, `presence/${coupleId}/${currentUserId}`)

        // Mark as entering cinema (Merge with existing global presence)
        update(presenceRef, { in_cinema: true })
        onDisconnect(presenceRef).update({ in_cinema: null })

        return () => {
            update(presenceRef, { in_cinema: null }).catch(() => { })
        }
    }, [isActive, coupleId, currentUserId])

    useEffect(() => {
        if (isActive) {
            document.documentElement.classList.add('cinema-mode-active')
            document.body.style.overflow = 'hidden'
            document.body.style.touchAction = 'none'

            let backListener: { remove: () => void } | undefined
            if (isNative) {
                App.addListener('backButton', () => onClose()).then((listener: any) => {
                    backListener = listener
                })
            }

            if (typeof window !== 'undefined') {
                window.history.pushState({ cinema: true }, '')
                const handlePopState = () => onClose()
                window.addEventListener('popstate', handlePopState)
                return () => {
                    document.documentElement.classList.remove('cinema-mode-active')
                    document.body.style.overflow = ''
                    document.body.style.touchAction = ''
                    backListener?.remove()
                    window.removeEventListener('popstate', handlePopState)
                }
            }
        } else {
            document.documentElement.classList.remove('cinema-mode-active')
            document.body.style.overflow = ''
            document.body.style.touchAction = ''
        }

        return () => {
            document.documentElement.classList.remove('cinema-mode-active')
            document.body.style.overflow = ''
            document.body.style.touchAction = ''
        }
    }, [isActive, isNative, onClose])

    useEffect(() => {
        if (!isActive || typeof window === 'undefined') return
        try {
            const raw = sessionStorage.getItem(sessionEmojiKey)
            const parsed = raw ? JSON.parse(raw) : []
            if (Array.isArray(parsed)) {
                const normalized = parsed
                    .filter((e: unknown) => typeof e === 'string' && isSingleEmoji(e))
                    .slice(0, 4)
                setCustomEmojis(normalized)
            }
        } catch {
            setCustomEmojis([])
        }
    }, [isActive, sessionEmojiKey])

    // No auth fetch needed as we use useAuth

    useEffect(() => {
        if (!coupleId || !currentUserId || !isActive) return

        const onCinemaEvent = (e: any) => {
            const payload = e.detail;
            if (!payload || payload.senderId === currentUserId) return

            if (payload.event === 'reaction') {
                const reaction = payload.type
                if (reaction !== 'tap' && reaction !== 'laugh' && reaction !== 'heartbeat') return

                if (isNative) {
                    try {
                        if (reaction === 'heartbeat') {
                            Haptics.impact({ style: ImpactStyle.Heavy })
                            setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }), 180)
                        } else if (reaction === 'laugh') {
                            Haptics.impact({ style: ImpactStyle.Light })
                            setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 90)
                            setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }), 180)
                        } else {
                            Haptics.impact({ style: ImpactStyle.Medium })
                        }
                    } catch { }
                }

                safeSetIncomingReaction({
                    type: reaction,
                    emoji: payload.emoji,
                    senderName: payload.senderName,
                    senderId: payload.senderId
                }, 1200)
            } else if (payload.event === 'emoji-preset') {
                if (payload.emoji) appendCustomEmoji(payload.emoji)
            } else if (payload.event === 'navigation') {
                const navEmoji = payload.navEvent === 'double_tap' ? '✨' : (payload.direction === 'up' ? '😂' : '😢')
                safeSetIncomingReaction({
                    type: 'tap',
                    emoji: navEmoji,
                    senderName: payload.senderName || partnerName,
                    senderId: payload.senderId
                }, 1200)
            }
        }

        window.addEventListener('orbit:cinema-event', onCinemaEvent);
        return () => { window.removeEventListener('orbit:cinema-event', onCinemaEvent); }
    }, [coupleId, currentUserId, isActive, isNative, sessionEmojiKey])

    useEffect(() => {
        return () => {
            clearReactionTimer()
        }
    }, [])

    const sendReaction = async (type: 'tap' | 'laugh' | 'heartbeat', emojiOverride?: string) => {
        if (!currentUserId || !coupleId) return

        // Only allow local feedback if partner isn't here, skip broadcast to save bandwidth
        const skipBroadcast = !partnerInCinema

        if (isNative) {
            try {
                if (type === 'heartbeat') {
                    await Haptics.impact({ style: ImpactStyle.Heavy })
                } else {
                    await Haptics.impact({ style: ImpactStyle.Medium })
                }
            } catch { }
        }

        const senderName = myName
        const finalEmoji = type === 'tap' ? (emojiOverride || selectedEmoji) : (type === 'heartbeat' ? '💗' : undefined)

        safeSetIncomingReaction({
            type,
            emoji: finalEmoji,
            senderName: myName,
            senderId: currentUserId
        }, 1200)

        if (skipBroadcast) return

        try {
            if ((window as any).orbitSend) {
                (window as any).orbitSend('cinema_event', {
                    event: 'reaction',
                    senderId: currentUserId,
                    senderName,
                    type,
                    emoji: finalEmoji
                })
            }
        } catch { }
    }

    const sendNavigation = async (event: 'double_tap' | 'swipe', direction?: 'up' | 'down' | 'forward' | 'backward') => {
        if (!currentUserId || !coupleId) return

        // Skip broadcast if partner isn't in cinema
        const skipBroadcast = !partnerInCinema

        // Throttle to prevent double-broadcasts on sensitive gestures
        const now = Date.now()
        if (now - lastNavAt.current < 400) return
        lastNavAt.current = now

        const senderName = myName

        // Feedback locally
        const navEmoji = event === 'double_tap' ? '✨' : (direction === 'up' ? '😂' : '😢')
        safeSetIncomingReaction({ type: 'tap', emoji: navEmoji, senderName: myName, senderId: currentUserId }, 1200)

        if (skipBroadcast) return

        try {
            if ((window as any).orbitSend) {
                (window as any).orbitSend('cinema_event', {
                    event: 'navigation',
                    senderId: currentUserId,
                    senderName,
                    navEvent: event,
                    direction
                })
            }
        } catch { }
    }

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        if ('touches' in e) {
            touchStartY.current = e.touches[0].clientY
        } else {
            touchStartY.current = (e as React.MouseEvent).clientY
        }
        if (pressTimer.current) clearTimeout(pressTimer.current)
        pressTimer.current = setTimeout(() => {
            // Heartbeat reaction
            sendReaction('heartbeat')
            pressTimer.current = null
        }, 500)
    }

    const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current)
            pressTimer.current = null

            const currentY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY
            const diff = touchStartY.current - currentY

            if (Math.abs(diff) > 50 && touchStartY.current > 0) {
                if (diff > 50) {
                    sendNavigation('swipe', 'up')
                } else {
                    sendNavigation('swipe', 'down')
                }
                touchStartY.current = 0
                return
            }

            // Delayed tap to allow double-tap to take precedence
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
            tapTimeoutRef.current = setTimeout(() => {
                sendReaction('tap')
                tapTimeoutRef.current = null
            }, 150)

            touchStartY.current = 0
        }
    }

    const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        // Cancel any pending single tap
        if (tapTimeoutRef.current) {
            clearTimeout(tapTimeoutRef.current)
            tapTimeoutRef.current = null
        }

        const clickX = 'clientX' in e ? e.clientX : e.touches[0].clientX
        const width = window.innerWidth
        const direction = clickX > width / 2 ? 'forward' : 'backward'
        sendNavigation('double_tap', direction)
    }

    if (!partnerId || !coupleId) return null

    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[999999] bg-black touch-none select-none overflow-hidden"
                    onContextMenu={(e) => e.preventDefault()}
                    onTouchStart={(e) => partnerInCinema && handleTouchStart(e)}
                    onTouchEnd={(e) => partnerInCinema && handleTouchEnd(e)}
                    onMouseDown={(e) => partnerInCinema && handleTouchStart(e)}
                    onMouseUp={(e) => partnerInCinema && handleTouchEnd(e)}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="absolute top-4 right-4 z-50 p-6 opacity-30 hover:opacity-100 transition-opacity"
                    >
                        <X className="w-8 h-8 text-white" />
                    </button>

                    <motion.div
                        animate={{ opacity: [0.3, 0] }}
                        transition={{ delay: 3, duration: 2 }}
                        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-white/30"
                    >
                        <Film className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-xs uppercase tracking-widest font-bold">Tap to nudge</p>
                        <p className="text-xs uppercase tracking-widest font-bold mt-2">Double-tap sides to Sync-Skip</p>
                        <p className="text-xs uppercase tracking-widest font-bold mt-2">Hold for heartbeat</p>
                        <p className="text-xs uppercase tracking-widest font-bold mt-2">Swipe up to laugh</p>
                    </motion.div>

                    <div className="absolute top-12 left-6 z-50 flex items-center gap-3">
                        <div className="relative h-12 w-12 rounded-full border border-white/10 overflow-hidden">
                            {useOrbitStore.getState().partnerProfile?.avatar_url ? (
                                <DecryptedImage
                                    src={useOrbitStore.getState().partnerProfile?.avatar_url}
                                    alt="Partner"
                                    className="h-full w-full object-cover opacity-60"
                                    bucket="avatars"
                                />
                            ) : (
                                <div className="w-full h-full bg-rose-500/10 flex items-center justify-center">
                                    <span className="text-rose-200/40 text-xs font-bold">
                                        {useOrbitStore.getState().getPartnerDisplayName().charAt(0)}
                                    </span>
                                </div>
                            )}
                        </div>
                        {partnerInCinema && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 fake-blur">
                                {partnerName} in Cinema
                            </span>
                        )}
                    </div>

                    <div className="absolute inset-0 z-0" onDoubleClick={(e) => partnerInCinema && handleDoubleTap(e)} />

                    <div
                        className={cn(
                            "absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 fake-blur px-3 sm:px-4 py-2 rounded-full z-50 border border-white/10 transition-all duration-500",
                            partnerInCinema
                                ? "opacity-100 translate-y-0"
                                : "opacity-30 translate-y-2 pointer-events-none grayscale scale-95"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                disabled={!partnerInCinema}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedEmoji(emoji)
                                    sendReaction('tap', emoji)
                                }}
                                className={cn(
                                    "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-lg sm:text-xl transition-all",
                                    selectedEmoji === emoji ? 'bg-white/20 scale-110' : 'opacity-50 hover:opacity-100 hover:scale-105'
                                )}
                            >
                                {emoji}
                            </button>
                        ))}

                        <button
                            disabled={!partnerInCinema}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleAddCustomEmoji()
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Add custom emoji"
                            title="Add custom emoji (session only)"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {!partnerInCinema && (
                        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 animate-pulse">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                                Watching Alone
                            </span>
                        </div>
                    )}

                    <AnimatePresence>
                        {incomingReaction && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.4 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none mix-blend-screen"
                            >
                                {incomingReaction.type === 'heartbeat' && (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-64 h-64 flex items-center justify-center bg-[radial-gradient(circle,rgba(244,63,94,0.4)_0%,transparent_60%)]">
                                            {(() => {
                                                const isSelf = incomingReaction.senderId === currentUserId || incomingReaction.senderName === myName
                                                const avatarUrl = isSelf
                                                    ? useOrbitStore.getState().profile?.avatar_url
                                                    : useOrbitStore.getState().partnerProfile?.avatar_url
                                                return avatarUrl ? (
                                                    <DecryptedImage
                                                        src={avatarUrl}
                                                        alt={isSelf ? "You" : partnerName}
                                                        className="w-32 h-32 rounded-full object-cover border-2 border-rose-500/30"
                                                        bucket="avatars"
                                                    />
                                                ) : (
                                                    <span className="text-[120px]">❤️</span>
                                                )
                                            })()}
                                        </div>
                                        {incomingReaction.senderName && (
                                            <span className="text-rose-200 text-xs font-black uppercase tracking-[0.3em] bg-black/40 px-4 py-2 rounded-full border border-rose-500/20 animate-pulse">
                                                {incomingReaction.senderName}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {incomingReaction.type === 'laugh' && (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-64 h-64 flex items-center justify-center bg-[radial-gradient(circle,rgba(56,189,248,0.3)_0%,transparent_60%)]">
                                            <span className="text-[120px]">😂</span>
                                        </div>
                                        {incomingReaction.senderName && (
                                            <span className="text-cyan-200 text-xs font-black uppercase tracking-[0.3em] bg-black/40 px-4 py-2 rounded-full border border-cyan-500/20 animate-pulse">
                                                {incomingReaction.senderName}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {incomingReaction.type === 'tap' && (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-64 h-64 flex items-center justify-center bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_50%)]">
                                            <span className="text-[120px]">{incomingReaction.emoji || selectedEmoji}</span>
                                        </div>
                                        {incomingReaction.senderName && (
                                            <span className="text-white/60 text-xs font-black uppercase tracking-[0.3em] bg-black/40 px-4 py-2 rounded-full border border-white/10 animate-pulse">
                                                {incomingReaction.senderName}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
