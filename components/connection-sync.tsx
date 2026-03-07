import { useState, useCallback, useRef, useEffect } from 'react'
import { Sparkles, Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCoupleChannel } from '@/hooks/use-couple-channel'
import { useOrbitStore } from '@/lib/store/global-store'

const FloatingHeart = ({ delay = 0, x = 0 }) => (
    <motion.div
        initial={{ y: 14, opacity: 0, scale: 0.55, x }}
        animate={{
            y: [-12, -72],
            opacity: [0, 0.95, 0],
            scale: [0.55, 1.08, 0.82],
            x: [x, x + (Math.random() - 0.5) * 18]
        }}
        transition={{
            duration: 1.2,
            delay,
            ease: "easeOut"
        }}
        className="absolute pointer-events-none"
    >
        <Heart className="w-4 h-4 text-rose-400 fill-rose-400/40" />
    </motion.div>
)

const SparkleIcon = ({ delay = 0, top = 0, left = 0 }) => (
    <motion.div
        initial={{ scale: 0, opacity: 0, rotate: 0 }}
        animate={{
            scale: [0, 1.35, 0],
            opacity: [0, 1, 0],
            rotate: [0, 160]
        }}
        transition={{
            duration: 0.45,
            delay,
            ease: "backOut"
        }}
        style={{ top: `${top}%`, left: `${left}%` }}
        className="absolute pointer-events-none"
    >
        <Sparkles className="w-3 h-3 text-amber-300" />
    </motion.div>
)

export function ConnectionSync({ coupleId, userId, partnerId }: { coupleId: string; userId: string; partnerId?: string | null }) {
    const [showFlash, setShowFlash] = useState(false)
    const wasOnlineRef = useRef(false)
    const presenceInitializedRef = useRef(false)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current)
                hideTimerRef.current = null
            }
        }
    }, [])

    const handlePresence = useCallback((onlineIds: string[]) => {
        const partnerIsOnline = !!partnerId && onlineIds.includes(partnerId)
        // Baseline the very first snapshot to avoid false animation on mount/remount.
        if (!presenceInitializedRef.current) {
            wasOnlineRef.current = partnerIsOnline
            presenceInitializedRef.current = true
            return
        }
        // Only flash when partner first comes online
        if (partnerIsOnline && !wasOnlineRef.current) {
            setShowFlash(true)
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
            hideTimerRef.current = setTimeout(() => setShowFlash(false), 1650)
        }
        wasOnlineRef.current = partnerIsOnline
    }, [partnerId])

    useCoupleChannel({ coupleId, userId, onPresenceChange: handlePresence })

    return (
        <AnimatePresence>
            {showFlash && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="fixed inset-0 top-0 left-0 w-screen h-[100dvh] z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
                >
                    {/* Background Subtle Glow */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 bg-rose-500/5"
                    />

                    {/* Central Glow */}
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="w-80 h-80 bg-rose-500/10 rounded-full blur-[70px]"
                    />

                    <motion.div
                        initial={{ y: 10, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -10, opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute left-1/2 top-[45%] md:top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3"
                    >
                        {/* Floating elements (restored, but sped up) */}
                        <FloatingHeart delay={0} x={-30} />
                        <FloatingHeart delay={0.12} x={26} />
                        <FloatingHeart delay={0.24} x={-8} />
                        <FloatingHeart delay={0.36} x={38} />

                        <SparkleIcon delay={0.08} top={-20} left={-48} />
                        <SparkleIcon delay={0.2} top={34} left={70} />
                        <SparkleIcon delay={0.3} top={-44} left={22} />

                        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                            <Heart className="w-7 h-7 text-rose-400 fill-rose-400 animate-pulse" />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-black uppercase tracking-[0.35em] text-white/65">
                                {useOrbitStore.getState().getPartnerDisplayName()} Connected
                            </span>
                            <div className="h-0.5 w-8 bg-rose-400/30 rounded-full" />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
