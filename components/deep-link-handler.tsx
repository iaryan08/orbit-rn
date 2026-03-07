'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

function resolveInAppPath(rawUrl: string): string | null {
    try {
        const url = new URL(rawUrl)
        const protocol = url.protocol.replace(':', '')

        // For custom scheme links like: com.orbit.app://auth/reset-password?...
        // URL parser treats "auth" as host and "/reset-password" as pathname.
        if (protocol === 'com.orbit.app') {
            const hostPart = url.host ? `/${url.host}` : ''
            const pathname = url.pathname && url.pathname !== '/' ? url.pathname : ''
            const search = url.search || ''
            const hash = url.hash || ''
            return `${hostPart}${pathname}${search}${hash}` || '/auth/login'
        }

        // For https links that include an app route.
        const search = url.search || ''
        const hash = url.hash || ''
        if (url.pathname?.startsWith('/')) {
            return `${url.pathname}${search}${hash}`
        }
    } catch {
        // Fallback: if URL parsing fails but route substring exists.
        const idx = rawUrl.indexOf('/auth/')
        if (idx >= 0) return rawUrl.slice(idx)
    }

    return null
}

export function DeepLinkHandler() {
    const router = useRouter()

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return

        const navigateFromUrl = (incoming?: string | null) => {
            if (!incoming) return
            const target = resolveInAppPath(incoming)
            if (!target) return
            router.replace(target)
        }

        let appUrlListener: { remove: () => Promise<void> } | null = null

        CapacitorApp.addListener('appUrlOpen', ({ url }) => {
            navigateFromUrl(url)
        }).then((listener) => {
            appUrlListener = listener
        }).catch((err) => {
            console.warn('[DeepLinkHandler] Failed to register appUrlOpen listener:', err)
        })

        // Handle cold-start from recovery link.
        CapacitorApp.getLaunchUrl()
            .then((result) => navigateFromUrl(result?.url))
            .catch((err) => {
                console.warn('[DeepLinkHandler] Failed to read launch URL:', err)
            })

        return () => {
            if (appUrlListener) {
                void appUrlListener.remove()
            }
        }
    }, [router])

    return null
}

