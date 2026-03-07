'use client'

import { useEffect } from 'react'

/**
 * Disables the Android WebView / browser long-press context menu
 * that shows the internal "http://localhost/..." URL.
 */
export function DisableContextMenu() {
    useEffect(() => {
        const prevent = (e: Event) => e.preventDefault()
        document.addEventListener('contextmenu', prevent)
        return () => document.removeEventListener('contextmenu', prevent)
    }, [])

    return null
}
