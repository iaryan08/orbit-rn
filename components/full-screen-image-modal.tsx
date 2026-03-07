'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Lock, Download } from 'lucide-react'
import { downloadMedia } from '@/lib/client/crypto-e2ee'
import { useToast } from '@/hooks/use-toast'
import { useState, useEffect, useRef, useCallback } from 'react'
import * as Portal from '@radix-ui/react-portal'
import { ImageWithLoader } from './ui/image-with-loader'
import { DecryptedImage } from './e2ee/decrypted-image'
import { EncryptedLockedCard } from './e2ee/encrypted-locked-card'
import { getPublicStorageUrl } from '@/lib/storage'
import { cn } from "@/lib/utils"

interface FullScreenImageModalProps {
    src?: string | null
    images?: string[]
    currentIndex?: number
    onIndexChange?: (index: number) => void
    onClose: () => void
    isEncrypted?: boolean
    iv?: string
    prefix?: string | null
    canRevealEncrypted?: boolean
}

export function FullScreenImageModal({ src, images, currentIndex = 0, onIndexChange, onClose, isEncrypted, iv, prefix, canRevealEncrypted = true }: FullScreenImageModalProps) {
    const [scale, setScale] = useState(1)
    const [rotate, setRotate] = useState(0)
    const [isMounted, setIsMounted] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const { toast } = useToast()
    const [internalIndex, setInternalIndex] = useState(currentIndex)
    const [pan, setPan] = useState({ x: 0, y: 0 })

    const containerRef = useRef<HTMLDivElement>(null)

    // All gesture state in a single ref — zero re-renders during gestures
    const gesture = useRef({
        // pinch
        pinching: false,
        startDist: 0,
        startScale: 1,
        // pan (when zoomed)
        panning: false,
        panStart: { x: 0, y: 0 },
        panOrigin: { x: 0, y: 0 },
        // swipe (when at 1×)
        swipeStart: { x: 0, y: 0 },
        swipeAxis: null as 'h' | 'v' | null,
        // double-tap
        lastTap: 0,
    })

    // Mirror state into refs so gesture callbacks read fresh values without stale closure
    const scaleRef = useRef(1)
    const panRef = useRef({ x: 0, y: 0 })
    useEffect(() => { scaleRef.current = scale }, [scale])
    useEffect(() => { panRef.current = pan }, [pan])
    useEffect(() => { setInternalIndex(currentIndex) }, [currentIndex])

    const activeSrc = src ? (images?.length ? images[internalIndex] : src) : null
    const shouldLockView = !!activeSrc && !!isEncrypted && !canRevealEncrypted

    // Reset transform when switching images
    useEffect(() => {
        setScale(1); setPan({ x: 0, y: 0 })
    }, [internalIndex])

    const dist = (t: TouchList) =>
        Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const go = useCallback((dir: 1 | -1) => {
        if (!images || images.length < 2) return
        const next = (internalIndex + dir + images.length) % images.length
        setInternalIndex(next)
        onIndexChange?.(next)
        setRotate(0)
    }, [images, internalIndex, onIndexChange])

    // ── Single non-passive touch handler on the image container ─────────────
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        const onStart = (e: TouchEvent) => {
            const g = gesture.current
            if (e.touches.length === 2) {
                g.pinching = true
                g.panning = false
                g.swipeAxis = null
                g.startDist = dist(e.touches)
                g.startScale = scaleRef.current
            } else if (e.touches.length === 1) {
                g.pinching = false
                const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY }
                if (scaleRef.current > 1.05) {
                    g.panning = true
                    g.panStart = pt
                    g.panOrigin = { ...panRef.current }
                    g.swipeAxis = null
                } else {
                    g.panning = false
                    g.swipeStart = pt
                    g.swipeAxis = null
                }
            }
        }

        const onMove = (e: TouchEvent) => {
            const g = gesture.current

            // Pinch zoom
            if (g.pinching && e.touches.length === 2) {
                e.preventDefault()
                const ratio = dist(e.touches) / g.startDist
                const next = Math.min(Math.max(g.startScale * ratio, 0.5), 6)
                setScale(next)
                if (next < 1.05) setPan({ x: 0, y: 0 })
                return
            }

            // Pan when zoomed
            if (g.panning && e.touches.length === 1) {
                e.preventDefault()
                const dx = e.touches[0].clientX - g.panStart.x
                const dy = e.touches[0].clientY - g.panStart.y
                setPan({ x: g.panOrigin.x + dx, y: g.panOrigin.y + dy })
                return
            }

            // Axis-lock swipe at natural scale with VISUAL FEEDBACK
            if (!g.pinching && !g.panning && e.touches.length === 1) {
                const dx = e.touches[0].clientX - g.swipeStart.x
                const dy = e.touches[0].clientY - g.swipeStart.y

                if (!g.swipeAxis) {
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        g.swipeAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
                    }
                }

                if (g.swipeAxis === 'h') {
                    // FOLLOW THE FINGER: Update X pan during swipe for "fast" feel
                    e.preventDefault()
                    setPan({ x: dx, y: 0 })
                }
            }
        }

        const onEnd = (e: TouchEvent) => {
            const g = gesture.current
            if (g.pinching) {
                g.pinching = true // flag to reset below
                if (scaleRef.current < 1.1) { setScale(1); setPan({ x: 0, y: 0 }) }
                g.pinching = false
                return
            }
            if (g.panning) { g.panning = false; return }

            // Commit swipe
            if (g.swipeAxis === 'h' && e.changedTouches.length === 1) {
                const dx = e.changedTouches[0].clientX - g.swipeStart.x
                if (Math.abs(dx) > 60) {
                    // Committed! Go to next/prev and snap back
                    go(dx < 0 ? 1 : -1)
                } else {
                    // Cancelled, snap back to center
                    setPan({ x: 0, y: 0 })
                }
            }
            g.swipeAxis = null
        }

        el.addEventListener('touchstart', onStart, { passive: false })
        el.addEventListener('touchmove', onMove, { passive: false })
        el.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchmove', onMove)
            el.removeEventListener('touchend', onEnd)
        }
    }, [go])

    // ── Double-tap to zoom, single tap does nothing (no accidental close) ───
    const handleImageTap = (e: React.MouseEvent) => {
        e.stopPropagation()
        const now = Date.now()
        const g = gesture.current
        if (now - g.lastTap < 280) {
            // Double-tap: toggle zoom
            if ((g as any).closeTimer) { clearTimeout((g as any).closeTimer); (g as any).closeTimer = null; }
            scaleRef.current > 1.2
                ? (setScale(1), setPan({ x: 0, y: 0 }))
                : setScale(2.5)
        }
        // Single tap: strictly Do Nothing as per user request to handle only back/X/esc
        g.lastTap = now
    }

    // ── Keyboard + Android back ──────────────────────────────────────────────
    useEffect(() => {
        if (!activeSrc) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
            if (e.key === 'ArrowRight') go(1)
            if (e.key === 'ArrowLeft') go(-1)
        }
        const onBack = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); onClose() }

        window.addEventListener('keydown', onKey, true)
        window.addEventListener('capacitor:back', onBack, true)
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('capacitor:back', onBack, true)
            document.body.style.overflow = ''
        }
    }, [activeSrc, onClose, go])

    const handleDownload = async () => {
        if (!activeSrc) return
        setIsDownloading(true)
        try {
            const resolved = getPublicStorageUrl(activeSrc, 'memories', 'none', prefix) || activeSrc;
            await downloadMedia(resolved, `orbit-media-${Date.now()}.jpg`)
            toast({ title: "Saved to gallery" })
        } catch (e) {
            toast({ title: "Download failed", variant: "destructive" })
        } finally {
            setIsDownloading(false)
        }
    }

    useEffect(() => { setIsMounted(true) }, [])
    if (!isMounted) return null

    return (
        <Portal.Root>
            <AnimatePresence>
                {activeSrc && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="fixed inset-0 z-[10000] bg-black"
                        style={{ touchAction: 'none', pointerEvents: 'all' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ── Image / gesture surface ───────────────────────────────── */}
                        <motion.div
                            ref={containerRef}
                            animate={{ scale, rotate, x: pan.x, y: pan.y }}
                            transition={{ type: 'spring', stiffness: 300, damping: 38 }}
                            className="absolute inset-0 flex items-center justify-center select-none"
                            style={{ touchAction: 'none', userSelect: 'none' }}
                            onClick={handleImageTap}
                        >
                            {shouldLockView ? (
                                <div className="w-full h-full flex items-center justify-center px-8">
                                    <EncryptedLockedCard
                                        className="w-full max-w-xl rounded-2xl py-10"
                                        label="Media Locked"
                                        onClick={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                    />
                                </div>
                            ) : (
                                <DecryptedImage
                                    key={activeSrc}
                                    src={activeSrc}
                                    alt="Full screen"
                                    className="object-contain w-full h-full max-h-[100dvh]"
                                    isEncrypted={isEncrypted}
                                    iv={iv}
                                    prefix={prefix}
                                    loadingSize="xl"
                                    onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                />
                            )}
                        </motion.div>

                        {/* ── Controls (top-right) ──────────────────────────────────── */}
                        <div
                            className="absolute top-0 right-0 z-10 flex items-center gap-1.5 p-4"
                            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
                            // stop every touch here from reaching the gesture layer
                            onTouchStart={e => e.stopPropagation()}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Image counter pill */}
                            {!shouldLockView && images && images.length > 1 && (
                                <div className="flex items-center bg-transparent rounded-full px-2.5 py-1.5 mr-1">
                                    <span className="text-[11px] font-bold text-white/80 tabular-nums tracking-widest">
                                        {internalIndex + 1}/{images.length}
                                    </span>
                                </div>
                            )}

                            {/* Tool pill — rotate / zoom-in / zoom-out */}
                            {!shouldLockView && (
                                <div className="flex items-center gap-0.5 bg-white/8 border border-white/12 rounded-full px-1 py-1 shadow-none ring-1 ring-inset ring-white/5">
                                    <button onTouchStart={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setRotate(r => r + 90); }}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors">
                                        <RotateCw className="w-4 h-4" />
                                    </button>
                                    <button onTouchStart={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(s + 0.5, 6)); }}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors">
                                        <ZoomIn className="w-4 h-4" />
                                    </button>
                                    <button onTouchStart={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setScale(s => { const n = Math.max(s - 0.5, 1); if (n <= 1.05) setPan({ x: 0, y: 0 }); return n; }); }}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white/90 transition-colors">
                                        <ZoomOut className="w-4 h-4" />
                                    </button>
                                    <div className="w-px h-3 bg-white/10 mx-0.5" />
                                    <button
                                        onTouchStart={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                                        disabled={isDownloading}
                                        className={cn(
                                            "p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white/90 transition-all",
                                            isDownloading && "animate-pulse"
                                        )}
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Close pill */}
                            <button
                                onTouchStart={e => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onClose(); }}
                                className="p-2 rounded-full bg-white/8 border border-white/12 ring-1 ring-inset ring-white/5 text-white/50 hover:text-white/90 hover:bg-white/15 transition-colors shadow-none"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* ── Desktop prev/next ─────────────────────────────────────── */}
                        {!shouldLockView && images && images.length > 1 && (
                            <>
                                <button
                                    className="hidden sm:flex absolute left-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/8 border border-white/12 ring-1 ring-inset ring-white/5 text-white/50 hover:text-white/90 hover:bg-white/15 transition-all"
                                    onClick={(e) => { e.stopPropagation(); go(-1); }}>
                                    <ChevronLeft className="w-6 h-6" />
                                </button>
                                <button
                                    className="hidden sm:flex absolute right-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/8 border border-white/12 ring-1 ring-inset ring-white/5 text-white/50 hover:text-white/90 hover:bg-white/15 transition-all"
                                    onClick={(e) => { e.stopPropagation(); go(1); }}>
                                    <ChevronRight className="w-6 h-6" />
                                </button>
                            </>
                        )}

                        {/* ── Hint ─────────────────────────────────────────────────── */}
                        {!shouldLockView && (
                            <p className="absolute bottom-8 inset-x-0 text-center text-[9px] font-semibold uppercase tracking-[0.3em] text-white/15 pointer-events-none select-none sm:hidden">
                                {scale > 1 ? 'Drag to pan · Pinch to zoom' : 'Pinch · Double-tap · Swipe'}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </Portal.Root>
    )
}
