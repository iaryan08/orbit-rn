'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { App } from '@capacitor/app'
import { toast } from '@/hooks/use-toast'

/**
 * Global stack of back button handlers.
 * Components push their "close" logic onto this stack.
 * The handler at the top (end of array) gets priority.
 */
const backStack: (() => boolean | void)[] = []

export function pushBackHandler(handler: () => boolean | void) {
    backStack.push(handler)
}

export function popBackHandler(handler: () => boolean | void) {
    const index = backStack.lastIndexOf(handler)
    if (index !== -1) backStack.splice(index, 1)
}

/**
 * Hook for components to register back button handling.
 * @param onBack Function to call on back press. Return false to skip (continue to next handler).
 * @param active Whether the handler should be active.
 */
export function useBackHandler(onBack: () => boolean | void, active: boolean) {
    const handlerRef = useRef(onBack)
    handlerRef.current = onBack

    useEffect(() => {
        if (!active) return

        const wrapper = () => handlerRef.current()
        pushBackHandler(wrapper)
        return () => popBackHandler(wrapper)
    }, [active])
}

/**
 * Handles Android hardware back button globally.
 *
 * Priority system (highest → lowest):
 *   1. Check backStack (LIFO) - Topmost handler (e.g. FullScreen -> Modal)
 *   2. If nothing in stack, check current pathname:
 *        - exit paths -> App.exitApp()
 *        - everything else -> window.history.back()
 */
const SUB_ROOT_PATHS = [
    '/intimacy',
    '/letters',
    '/memories',
    '/partner',
    '/insights',
    '/admin',
    '/settings',
    '/dashboard/games',
]

const EXIT_PATHS = [
    '',
    '/',
    '/auth/login',
    '/auth/sign-up',
    '/dashboard',
    '/unpaired',
]

export function GlobalBackHandler() {
    const pathname = usePathname()
    const router = useRouter()
    const routerRef = useRef(router)
    const lastExitPress = useRef<number>(0)

    // Keep routerRef updated without re-running the main listener effect
    useEffect(() => {
        routerRef.current = router
    }, [router])

    useEffect(() => {
        let handle: any = null
        let isMounted = true

        const setup = async () => {
            try {
                const h = await App.addListener('backButton', () => {
                    // 1. Stack check (LIFO)
                    if (backStack.length > 0) {
                        const handler = backStack[backStack.length - 1]
                        const result = handler()
                        if (result !== false) return
                    }

                    // 2. Custom events (legacy support)
                    const evt = new Event('capacitor:back', { cancelable: true })
                    if (!window.dispatchEvent(evt)) return

                    // 3. Default navigation
                    const raw = window.location.pathname
                    const current = raw.replace(/\/+$/, '') || '/'

                    // Detect if we are on a sub-page that should jump back to root Dashboard
                    const isSubRoot = SUB_ROOT_PATHS.some(p => current === p || current.startsWith(p + '/'))

                    if (isSubRoot) {
                        // Use replace for a smoother "switch" feel and to avoid history loops
                        routerRef.current.replace('/dashboard')
                        return
                    }

                    if (EXIT_PATHS.includes(current)) {
                        const now = Date.now()
                        if (now - lastExitPress.current < 2000) {
                            App.exitApp()
                        } else {
                            if (current !== '/dashboard' && current !== '/') {
                                routerRef.current.replace('/dashboard')
                                return
                            }
                            lastExitPress.current = now
                            toast({ title: "Tap back again to exit" })
                        }
                    } else {
                        window.history.back()
                    }
                })

                if (!isMounted) {
                    h.remove()
                } else {
                    handle = h
                }
            } catch (e) {
                // Likely not on native
            }
        }

        setup()
        return () => {
            isMounted = false
            if (handle) handle.remove()
        }
    }, [])

    return null
}
