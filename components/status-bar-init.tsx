'use client'

import { useEffect } from 'react'
import { applyPerformanceMode } from '@/lib/client/performance-mode'

export function StatusBarInit() {
    useEffect(() => {
        applyPerformanceMode()

        // Dynamically import Capacitor StatusBar at runtime only
        const initStatusBar = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core')
                if (!Capacitor.isNativePlatform()) return
                document.documentElement.classList.add('capacitor-app')
                document.body.classList.add('capacitor-app')

                const { StatusBar, Style } = await import('@capacitor/status-bar')

                // CRITICAL: prevent app from drawing behind the status bar
                await StatusBar.setOverlaysWebView({ overlay: false })

                // Set solid dark background matching app theme
                await StatusBar.setBackgroundColor({ color: '#09090b' })

                // Light status bar text (white icons on dark background)
                await StatusBar.setStyle({ style: Style.Dark })
            } catch (e) {
                // Not native or plugin not available — silently ignore
            }
        }

        initStatusBar()
    }, [])

    return null
}
