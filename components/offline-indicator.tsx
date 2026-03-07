'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineIndicator() {
    const [offline, setOffline] = useState(false)

    useEffect(() => {
        const sync = () => setOffline(typeof navigator !== 'undefined' ? navigator.onLine === false : false)
        sync()
        window.addEventListener('online', sync)
        window.addEventListener('offline', sync)
        return () => {
            window.removeEventListener('online', sync)
            window.removeEventListener('offline', sync)
        }
    }, [])

    if (!offline) return null

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-[2100] px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-100 text-xs font-semibold backdrop-blur-sm"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
            role="status"
            aria-live="polite"
        >
            <span className="inline-flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5" />
                Offline mode
            </span>
        </div>
    )
}
