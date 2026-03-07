'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useOrbitStore } from '@/lib/store/global-store'
import { OrbitLoading } from '@/components/orbit-loading'
import { PairingWall } from '@/components/pairing-wall'
import { cn } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { motion, AnimatePresence } from 'framer-motion'
// import { QuickRestoreKeyDialog } from '@/components/e2ee/quick-restore-key-dialog'

import { AppModeProvider } from '@/components/app-mode-context'
import { DeferredDashboardHeader } from '@/components/deferred-dashboard-header'
import { DeferredConnectionSync } from '@/components/deferred-connection-sync'
import { SyncEngine } from '@/components/sync-engine'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const { user, loading: authLoading } = useAuth()
    const router = useRouter()

    const profile = useOrbitStore((state) => state.profile)
    const partnerProfile = useOrbitStore((state) => state.partnerProfile)
    const couple = useOrbitStore((state) => state.couple)
    const isInitialized = useOrbitStore((state) => state.isInitialized)
    const unreadMemoriesCount = useOrbitStore((state) => state.unreadMemoriesCount)
    const unreadLettersCount = useOrbitStore((state) => state.unreadLettersCount)

    const isNative = Capacitor.isNativePlatform()

    // Auth Guard
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/auth/login')
        }
    }, [user, authLoading, router])

    if (authLoading || !isInitialized) {
        return <OrbitLoading />
    }

    if (!user) {
        return null
    }

    // Pairing Guard - if profile exists but no couple_id, or couple data hasn't loaded 
    // (Note: AuthProvider has some latency while Firestore snapshots resolve)
    const isConnected = profile?.couple_id && couple

    if (!isConnected) {
        return <PairingWall user={user} initialCouple={couple} />
    }

    // Days together calculation for header
    const startDate = couple?.anniversary_date || couple?.paired_at
    const daysTogether = startDate
        ? Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0

    return (
        <AppModeProvider initialProfile={profile} initialCoupleId={couple?.id}>
            <SyncEngine />
            <DeferredConnectionSync coupleId={couple.id} userId={user.uid} partnerId={partnerProfile?.id} />
            <div className="relative min-h-screen">
                {/* 1. Header (Floating Dock + Breadcrumbs) */}
                <DeferredDashboardHeader
                    userName={profile?.display_name || 'User'}
                    userAvatar={profile?.avatar_url}
                    partnerName={partnerProfile?.display_name}
                    daysTogetherCount={daysTogether}
                    coupleId={couple?.id}
                    partnerId={partnerProfile?.id}
                    unreadCounts={{
                        memories: unreadMemoriesCount,
                        letters: unreadLettersCount
                    }}
                    userId={user.uid}
                    user={user}
                />

                {/* Status bar fade guard */}
                <div
                    className="fixed top-0 left-0 right-0 pointer-events-none z-[1900]"
                    style={{
                        height: 'calc(env(safe-area-inset-top, 24px) + 8px)',
                        background: 'linear-gradient(to bottom, #000000 40%, rgba(0,0,0,0.8) 70%, transparent 100%)'
                    }}
                />

                <main
                    className={cn(
                        "w-full pb-24 md:pb-12 relative z-10 min-h-screen md:max-w-[1440px] md:mx-auto",
                        isNative ? "pt-14 md:pt-20" : "pt-14 md:pt-32"
                    )}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </AppModeProvider>
    )
}
