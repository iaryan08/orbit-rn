'use client'

import { useEffect, useState } from 'react'

export function DeferredPushManager() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const isLocalHost =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.hostname === '::1'
        const isDev = process.env.NODE_ENV !== 'production'

        if ('serviceWorker' in navigator) {
            if (isLocalHost || isDev) {
                // Prevent stale cached JS/assets in local development.
                navigator.serviceWorker.getRegistrations()
                    .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
                    .catch(() => { })
            } else {
                // Service Worker Registration for background push in production only
                navigator.serviceWorker
                    .register('/sw.js')
                    .catch(() => { })
            }
        }

        const run = () => setReady(true)
        const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined

        if (idle) {
            const id = idle(run, { timeout: 5000 })
            return () => {
                const cancel = (window as any).cancelIdleCallback as ((idleId: number) => void) | undefined
                if (cancel) cancel(id)
            }
        }

        const timer = window.setTimeout(run, 2500)
        return () => window.clearTimeout(timer)
    }, [])

    if (!ready) return null
    return null
}
