'use client'

import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { ImpactStyle } from '@capacitor/haptics'
import { safeImpact } from '@/lib/client/haptics'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
    children: React.ReactNode
    onRefresh: () => Promise<void>
}

export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [pullDistance, setPullDistance] = useState(0)
    const [isPulling, setIsPulling] = useState(false)
    const startY = useRef(0)
    const startX = useRef(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const PULL_THRESHOLD = 70
    const MAX_PULL = 120

    const isRefreshingRef = useRef(isRefreshing)
    const isPullingRef = useRef(isPulling)
    const pullDistanceRef = useRef(pullDistance)

    useEffect(() => {
        isRefreshingRef.current = isRefreshing
        isPullingRef.current = isPulling
        pullDistanceRef.current = pullDistance
    }, [isRefreshing, isPulling, pullDistance])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const getPageScrollTop = () => {
            const doc = document.documentElement
            const body = document.body
            const scrolling = document.scrollingElement as HTMLElement | null
            return Math.max(
                window.scrollY || 0,
                scrolling?.scrollTop || 0,
                doc?.scrollTop || 0,
                body?.scrollTop || 0
            )
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (isRefreshingRef.current || !isPullingRef.current) return

            if (e.touches.length !== 1) return
            const currentY = e.touches[0].clientY
            const currentX = e.touches[0].clientX
            const distance = currentY - startY.current
            const horizontal = Math.abs(currentX - startX.current)

            // Ignore diagonal/horizontal gestures so normal swipes don't trigger refresh.
            if (horizontal > Math.max(12, distance * 0.6)) return

            if (distance > 0) {
                if (e.cancelable) e.preventDefault()
                const dampenedDistance = Math.min(distance * 0.4, MAX_PULL)
                setPullDistance(dampenedDistance)
            }
        }

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1 || isRefreshingRef.current) return
            if (getPageScrollTop() > 1) return
            startY.current = e.touches[0].clientY
            startX.current = e.touches[0].clientX
            setIsPulling(true)
            // ONLY attach the expensive non-passive listener if we are pulling from the absolute top.
            // This leaves 99% of regular scrolling completely JS-free and GPU-accelerated!
            document.addEventListener('touchmove', handleTouchMove, { passive: false })
        }

        const handleTouchEnd = async () => {
            document.removeEventListener('touchmove', handleTouchMove)

            if (!isPullingRef.current) return
            setIsPulling(false)

            if (pullDistanceRef.current >= PULL_THRESHOLD && !isRefreshingRef.current) {
                setIsRefreshing(true)
                setPullDistance(PULL_THRESHOLD)
                await safeImpact(ImpactStyle.Light, 10)
                await onRefresh()
                setIsRefreshing(false)
                setPullDistance(0)
            } else {
                setPullDistance(0)
            }
        }

        container.addEventListener('touchstart', handleTouchStart, { passive: true })
        document.addEventListener('touchend', handleTouchEnd)
        document.addEventListener('touchcancel', handleTouchEnd)

        return () => {
            container.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
            document.removeEventListener('touchcancel', handleTouchEnd)
        }
    }, [onRefresh])

    return (
        <div ref={containerRef} className="relative min-h-screen">
            {/* Refresh Indicator — fixed so it slides in from behind the status bar */}
            <div
                className="fixed left-0 right-0 flex justify-center pointer-events-none z-[70]"
                style={{ top: 0 }}
            >
                <div
                    style={{
                        // Start fully hidden above status bar, pull distance slides it into view
                        transform: `translateY(calc(env(safe-area-inset-top, 24px) - 60px + ${isRefreshing ? PULL_THRESHOLD : pullDistance
                            }px))`,
                        opacity: isRefreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
                        transition: isPulling ? 'none' : 'transform 0.3s ease, opacity 0.3s ease'
                    }}
                >
                    <div className="rounded-full shadow-2xl shadow-indigo-500/10 border border-white/10 bg-[#0a0a0a] p-2.5 flex items-center justify-center relative overflow-hidden">
                        {/* Soft inner glow */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent rounded-full" />

                        <RefreshCw
                            className={cn(
                                "w-4 h-4 relative z-10 transition-colors duration-300",
                                isRefreshing ? "animate-spin text-white" : "text-white/70"
                            )}
                            style={{
                                animationDuration: '1.2s', // Slower, elegant spin
                                transform: isRefreshing ? undefined : `rotate(${pullDistance * 1.8}deg)`
                            }}
                            strokeWidth={2.5}
                        />
                    </div>
                </div>
            </div>

            {/* Main Content (kept static to avoid visual overlay/background shifting) */}
            <div>
                {children}
            </div>
        </div>
    )
}
