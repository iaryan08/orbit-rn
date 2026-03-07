'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

type AppMode = 'moon' | 'lunara'

interface AppModeContextType {
    mode: AppMode
    setMode: (mode: AppMode) => void
    toggleMode: () => void
    activeLunaraTab: 'dashboard' | 'insights' | 'partner'
    setActiveLunaraTab: (tab: 'dashboard' | 'insights' | 'partner') => void
    profile: any | null
    coupleId: string | null
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined)

interface AppModeProviderProps {
    children: React.ReactNode
    initialProfile?: any
    initialCoupleId?: string | null
}

const MIN_SWIPE_DISTANCE = 50

export function AppModeProvider({
    children,
    initialProfile,
    initialCoupleId
}: AppModeProviderProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [mode, setMode] = useState<AppMode>('moon')
    const [mounted, setMounted] = useState(false)
    const [activeLunaraTab, setActiveLunaraTab] = useState<'dashboard' | 'insights' | 'partner'>('dashboard')

    // Allow dynamic updates from server-to-client if provided later
    const profile = initialProfile || null
    const coupleId = initialCoupleId || null

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (coupleId && String(coupleId).trim()) {
            (window as any).__ORBIT_COUPLE_ID__ = String(coupleId).trim();
            try {
                localStorage.setItem('orbit:cached_couple_id', String(coupleId).trim());
            } catch {
                // ignore storage errors
            }
        }
    }, [coupleId])

    // Initialize Mode & Sync across tabs
    useEffect(() => {
        const savedMode = localStorage.getItem('app-mode') as AppMode
        const savedTab = localStorage.getItem('lunara-active-tab') as 'dashboard' | 'insights' | 'partner'

        if (savedMode && (savedMode === 'moon' || savedMode === 'lunara')) {
            setMode(savedMode)
        }
        if (savedTab && ['dashboard', 'insights', 'partner'].includes(savedTab)) {
            setActiveLunaraTab(savedTab)
        }
        setMounted(true)

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'app-mode' && e.newValue) {
                setMode(e.newValue as AppMode)
            }
            if (e.key === 'lunara-active-tab' && e.newValue) {
                setActiveLunaraTab(e.newValue as any)
            }
        }
        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [])

    const handleSetMode = (newMode: AppMode) => {
        setMode(newMode)
        localStorage.setItem('app-mode', newMode)
    }

    const handleSetActiveTab = (tab: 'dashboard' | 'insights' | 'partner') => {
        setActiveLunaraTab(tab)
        localStorage.setItem('lunara-active-tab', tab)
    }

    const toggleMode = () => {
        const newMode = mode === 'moon' ? 'lunara' : 'moon'
        handleSetMode(newMode)
        if (pathname && !pathname.startsWith('/dashboard')) {
            router.push('/dashboard')
        }
    }



    return (
        <AppModeContext.Provider value={{
            mode,
            setMode: handleSetMode,
            toggleMode,
            activeLunaraTab,
            setActiveLunaraTab: handleSetActiveTab,
            profile,
            coupleId
        }}>
            {children}
        </AppModeContext.Provider>
    )
}

export function useAppMode() {
    const context = useContext(AppModeContext)
    if (context === undefined) {
        throw new Error('useAppMode must be used within an AppModeProvider')
    }
    return context
}
