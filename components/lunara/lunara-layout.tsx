'use client'

import React, { useState, useEffect } from 'react'
import { LayoutGrid, BookOpen, Heart, Loader2, Flame } from 'lucide-react'
import { getCoreDashboardData } from '@/lib/client/consolidated'

import { LunaraTabDashboard } from './lunara-tab-dashboard'
import { LunaraTabPartner } from './lunara-tab-partner'
import { LunaraTabInsights } from './lunara-tab-insights'
import { useAppMode } from '@/components/app-mode-context'
import { cn } from '@/lib/utils'
import { Capacitor } from '@capacitor/core'
import { useOrbitStore } from '@/lib/store/global-store'

export function LunaraLayout({ initialData }: { initialData?: any }) {
    const { activeLunaraTab: activeTab } = useAppMode()
    const isNative = Capacitor.isNativePlatform()

    // Connect to global store for zero-fetch updates
    const { profile, partnerProfile, cycleLogs, supportLogs, userCycle, partnerCycle, setCoreData } = useOrbitStore();

    // Still allow initial hydration from server components
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        if (initialData && !mounted) {
            setCoreData(initialData);
            setMounted(true);
        }
    }, [initialData, mounted, setCoreData]);

    const resolvedData = {
        profile: profile ?? initialData?.profile ?? null,
        partnerProfile: partnerProfile ?? initialData?.partnerProfile ?? null,
        cycleLogs: (cycleLogs && cycleLogs.length > 0 ? cycleLogs : (initialData?.cycleLogs || [])),
        supportLogs: (supportLogs && supportLogs.length > 0 ? supportLogs : (initialData?.supportLogs || [])),
        userCycle: userCycle ?? initialData?.userCycle ?? initialData?.userTodayCycle ?? null,
        partnerCycle: partnerCycle ?? initialData?.partnerCycle ?? initialData?.partnerTodayCycle ?? null,
        // backward compatibility for any old consumers
        userTodayCycle: userCycle ?? initialData?.userCycle ?? initialData?.userTodayCycle ?? null,
        partnerTodayCycle: partnerCycle ?? initialData?.partnerCycle ?? initialData?.partnerTodayCycle ?? null,
    };

    // Basic loading protector if core data is empty
    if (!resolvedData.profile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                <p className="text-purple-200/40 uppercase tracking-widest text-[10px] font-bold">Synchronising with the moon...</p>
            </div>
        )
    }

    const data = resolvedData;

    useEffect(() => {
        const onDeltaRefresh = async (event: Event) => {
            const custom = event as CustomEvent<{ force?: boolean; done?: () => void }>
            // const force = !!custom.detail?.force // force is not used directly here, but the refresh implies force

            const result = await getCoreDashboardData()
            if (result.success && result.data) {
                setCoreData(result.data)
            } else {
                const errMsg = 'error' in result ? result.error : 'Unknown error'
                console.error("Failed to refresh Lunara data:", errMsg)
            }
            custom.detail?.done?.()
        }

        window.addEventListener('orbit:tab-delta-refresh', onDeltaRefresh as EventListener)
        // window.addEventListener('orbit:lunara-refresh', onRealtimeRefresh) // Removed as per instruction

        return () => {
            window.removeEventListener('orbit:tab-delta-refresh', onDeltaRefresh as EventListener)
            // window.removeEventListener('orbit:lunara-refresh', onRealtimeRefresh) // Removed as per instruction
        }
    }, [setCoreData]); // Dependency on setCoreData

    return (
        <div
            className={cn(
                "w-full space-y-6 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12 md:max-w-7xl md:mx-auto",
                isNative ? "pt-16" : ""
            )}
        >
            {/* Header Area */}
            <div className="space-y-4 text-center lg:text-left relative">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/62">
                            <span>Lunara</span>
                            <span className="text-white/40">
                                {activeTab === 'dashboard' ? 'Sync' : activeTab === 'insights' ? 'Discover' : 'Share'}
                            </span>
                        </div>
                        <h1 className="hidden md:block text-4xl md:text-[56px] font-serif font-light text-white leading-[1.1] tracking-wide">
                            {activeTab === 'dashboard' && 'Your Natural Rhythm'}
                            {activeTab === 'insights' && 'Wellness & Intimacy'}
                            {activeTab === 'partner' && 'Sync & Support'}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[500px]">
                {!data ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-4">
                        <p className="text-white/40 text-sm">Failed to load Lunara data. Please try refreshing.</p>
                        <button onClick={() => window.location.reload()} className="text-[10px] uppercase tracking-widest font-black text-purple-400 hover:text-purple-300">
                            Reload Orbit
                        </button>
                    </div>
                ) : (

                    <div className="relative z-10 isolate">
                        {activeTab === 'dashboard' && <LunaraTabDashboard data={data} />}
                        {activeTab === 'partner' && <LunaraTabPartner data={data} />}
                        {activeTab === 'insights' && <LunaraTabInsights coupleId={data.profile?.couple_id} />}
                    </div>
                )}
            </div>
        </div>
    )
}
