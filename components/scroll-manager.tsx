'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ScrollManager() {
    const pathname = usePathname()

    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual'
        }

        // Enforce no-shift route changes: always pin to top immediately on pathname change.
        // This keeps tab navigation visually stable across devices/webviews.
        requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        })

        return () => {
            // no-op
        }
    }, [pathname])

    return null
}
