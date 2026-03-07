'use client'

import { useState, useEffect } from 'react'

/**
 * Hook to pause expensive operations (animations, realtime, heavy sync)
 * when the tab is not visible. Essential for battery life and mobile performance.
 */
export function useBatteryOptimization() {
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        if (typeof document === 'undefined') return

        const handleVisibilityChange = () => {
            const isCinemaMode = document.documentElement.classList.contains('cinema-mode-active')
            setIsVisible(!document.hidden && !isCinemaMode)
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        // Listen for cinema mode toggle — MUST disconnect in cleanup to prevent CPU leak
        const observer = new MutationObserver(handleVisibilityChange)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

        // Initial check
        handleVisibilityChange()

        // Capacitor Native App State Listener
        let appListener: any = null
        const setupCapacitorListener = async () => {
            if (typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()) {
                const { App } = await import('@capacitor/app')
                appListener = await App.addListener('appStateChange', ({ isActive }) => {
                    const isCinemaMode = document.documentElement.classList.contains('cinema-mode-active')
                    setIsVisible(isActive && !isCinemaMode)
                })
            }
        }
        setupCapacitorListener()

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            observer.disconnect()
            if (appListener) appListener.remove()
        }
    }, [])

    return { isVisible }
}
