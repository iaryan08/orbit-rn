'use client'

import { useEffect, useRef, useState } from 'react'
import { useOrbitStore } from '@/lib/store/global-store'
import { deletePolaroid } from '@/lib/client/polaroids'
import { saveDoodle } from '@/lib/client/doodles'
import { reactivateCanvasNotification, sendNotification } from '@/lib/client/notifications'
import { DashboardShell } from '@/components/dashboard-shell'
import { useAppMode } from '@/components/app-mode-context'
import { Suspense } from 'react'
import {
    CoupleMomentsWrapper,
    DailyContentWrapper,
    DashboardSkeleton
} from '@/components/dashboard-wrappers'
import { Sparkles, Heart, Image as ImageIcon, PenLine, LayoutGrid, Camera, Clock, Flame } from 'lucide-react'
import {
    StackedPolaroids,
    SharedDoodle,
    DistanceTimeWidget,
    MoodCheckIn,
    PartnerMood,
} from '@/components/lazy-widgets'
import { PartnerAvatarHeartbeat } from '@/components/partner-avatar-heartbeat'
import { DashboardHeroEnhancements } from '@/components/dashboard-hero-enhancements'
import { PartnerNamePresence } from '@/components/partner-name-presence'
import { WriteLetterDialog } from "@/components/dialogs/write-letter-dialog"
import { AddMemoryDialog } from "@/components/dialogs/add-memory-dialog"
import { safeImpact } from '@/lib/client/haptics'
import { ImpactStyle } from '@capacitor/haptics'
import { motion } from 'framer-motion'

import { IntimacyAlert } from '@/components/intimacy-alert'
import { RelationshipStats } from '@/components/relationship-stats'
import { Capacitor } from '@capacitor/core'
import { cn } from '@/lib/utils'
import { LunarPhaseCard } from '@/components/lunar-phase-card'
import { SoftPageLoader } from '@/components/soft-page-loader'
import { ImportantDatesCountdown } from '@/components/important-dates-countdown'
import { SectionHeader } from '@/components/section-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
    const isInitialized = useOrbitStore(state => state.isInitialized)
    const profile = useOrbitStore(state => state.profile)
    const partnerProfile = useOrbitStore(state => state.partnerProfile)
    const couple = useOrbitStore(state => state.couple)
    const userTodayMoods = useOrbitStore(state => state.userTodayMoods)
    const partnerTodayMoods = useOrbitStore(state => state.partnerTodayMoods)
    const memoriesCount = useOrbitStore(state => state.memoriesCount)
    const lettersCount = useOrbitStore(state => state.lettersCount)
    const polaroids = useOrbitStore(state => state.polaroids)
    const doodle = useOrbitStore(state => state.doodle)
    const milestones = useOrbitStore(state => state.milestones)
    const cycleLogs = useOrbitStore(state => state.cycleLogs)
    const userCycle = useOrbitStore(state => state.userCycle)
    const partnerCycle = useOrbitStore(state => state.partnerCycle)
    const currentDateIST = useOrbitStore(state => state.currentDateIST)
    const setCoreData = useOrbitStore(state => state.setCoreData)

    const [isWritingLetter, setIsWritingLetter] = useState(false)
    const [isAddingMemory, setIsAddingMemory] = useState(false)
    const doodleNotificationInFlightRef = useRef(false)

    const generateSessionId = () => {
        if (typeof window === 'undefined') return null
        const cryptoObj = window.crypto as Crypto | undefined
        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID()
        }
        return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    }

    const getOrCreateAppSessionId = () => {
        if (typeof window === 'undefined') return null
        let sessionId = sessionStorage.getItem('orbit_app_session_id')
        if (!sessionId) {
            sessionId = generateSessionId()
            if (!sessionId) return null
            sessionStorage.setItem('orbit_app_session_id', sessionId)
        }
        return sessionId
    }

    const getSessionIdForCanvasNotification = () => {
        const sessionId = getOrCreateAppSessionId()
        return sessionId
    }

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        }
    }, [])

    if (!isInitialized) {
        return <SoftPageLoader className="pt-24 pb-12" />
    }

    if (!profile) {
        return (
            <div className="max-w-7xl mx-auto pt-24 md:pt-12 pb-12 px-4">
                <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-center space-y-4">
                    <p className="text-sm text-white/60">Dashboard is still syncing your profile data.</p>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('orbit:dashboard-refresh', {
                                    detail: { force: true, reason: 'profile-missing-retry' }
                                }))
                            }}
                            className="px-5 py-2 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-white/90 transition-all"
                        >
                            Retry Sync
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const coupleId = couple?.id
    const hasPartner = !!couple
    const startDate = couple?.anniversary_date || couple?.paired_at
    const daysTogether = startDate
        ? Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0
    const isNative = Capacitor.isNativePlatform()
    const longPressTimer = useRef<any>(null)
    const { mode } = useAppMode()

    const handleDeletePolaroid = async (id: string) => {
        const res = await deletePolaroid(id)
        if (res.success) {
            setCoreData({
                polaroids: {
                    ...polaroids,
                    userPolaroid: polaroids?.userPolaroid?.id === id ? null : polaroids?.userPolaroid,
                    partnerPolaroid: polaroids?.partnerPolaroid?.id === id ? null : polaroids?.partnerPolaroid
                }
            })
        }
    }

    const handleUploadSuccess = (newPolaroid: any) => {
        setCoreData({
            polaroids: {
                ...polaroids,
                userPolaroid: newPolaroid
            }
        })
    }

    return (
        <DashboardShell
            profile={profile}
            partnerProfile={partnerProfile}
            couple={couple}
            isInitialized={isInitialized}
            milestones={milestones}
        >
            <motion.div
                className={cn(
                    "feed-stream w-full max-w-[480px] mx-auto space-y-0 pt-24 md:pt-12 pb-32 md:pb-12 outline-none",
                    isNative ? "pt-16" : "",
                    "transition-all duration-300 transform-gpu"
                )}
            >
                {/* Invisible Gesture Overlay for Background long-press */}
                <motion.div
                    className="absolute inset-0 z-0 pointer-events-auto"
                    onContextMenu={(e) => e.preventDefault()}
                    onTapStart={() => {
                        longPressTimer.current = setTimeout(async () => {
                            await safeImpact(ImpactStyle.Heavy, 30)
                            document.querySelector('#profile-toggle-container button')?.dispatchEvent(
                                new MouseEvent('click', { bubbles: true })
                            )
                        }, 600)
                    }}
                    onTapCancel={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                    onTap={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current) }}
                />

                <div className="feed-section space-y-2 lg:text-left w-full relative z-10">


                    <div className="flex flex-col items-center lg:items-start space-y-2 transition-all duration-500 w-full">
                        <div className="flex flex-col md:flex-row items-center md:items-center gap-3 md:gap-4 justify-center lg:justify-start w-full">
                            <PartnerAvatarHeartbeat
                                uProfile={profile}
                                partnerProfile={partnerProfile}
                                coupleId={coupleId || ""}
                            />
                            <div className="flex flex-col items-center md:items-start justify-center">
                                <PartnerNamePresence
                                    hasPartner={hasPartner}
                                    partnerProfile={partnerProfile}
                                    coupleId={coupleId}
                                    userId={profile?.id}
                                />
                            </div>
                        </div>
                        <DashboardHeroEnhancements
                            hasPartner={hasPartner}
                            partnerProfile={partnerProfile}
                            coupleId={coupleId}
                            userLatitude={profile?.latitude}
                        />
                    </div>
                </div>

                {/* Core Stats & Status */}
                <div className="feed-section grid grid-cols-1 gap-0 mt-0 relative z-20">
                    <div className="flex flex-col gap-4">
                        <div className="w-full md:flex-1 min-h-[90px] flex border-b border-white/[0.08]">
                            <RelationshipStats
                                couple={couple}
                                lettersCount={lettersCount}
                                memoriesCount={memoriesCount}
                                onAddLetter={() => setIsWritingLetter(true)}
                                onAddMemory={() => setIsAddingMemory(true)}
                            />
                        </div>

                        <IntimacyAlert
                            profile={profile}
                            partnerProfile={partnerProfile}
                            couple={couple}
                            isInitialized={isInitialized}
                            milestones={milestones}
                            cycleLogs={cycleLogs}
                            currentDateIST={currentDateIST}
                            className="border-b border-white/[0.08]"
                        />

                        <ImportantDatesCountdown
                            className="w-full md:w-[420px]"
                            milestones={milestones}
                            couple={couple}
                            profile={profile}
                            partnerProfile={partnerProfile}
                        />
                    </div>

                    {/* Secondary Widgets Grid */}
                    <div className="grid grid-cols-1 gap-0 pb-0 auto-rows-min">
                        {/* Row 1: Status & Presence */}
                        <div className="h-full">
                            <PartnerMood
                                partnerName={partnerProfile?.display_name || 'Partner'}
                                partnerAvatar={partnerProfile?.avatar_url}
                                moods={partnerTodayMoods}
                                coupleId={coupleId}
                            />
                        </div>
                        <div className="border-b border-white/[0.08] w-full" />

                        <div className="h-full">
                            <MoodCheckIn hasPartner={hasPartner} userMoods={userTodayMoods} />
                        </div>
                        <div className="border-b border-white/[0.08] w-full" />

                        <div className="h-full">
                            <Card className="glass-card h-full rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden">
                                <CardHeader className="px-6 pt-6 pb-4 border-none">
                                    <div className="flex items-center justify-between w-full">
                                        <CardTitle className="text-xl font-serif text-white flex items-center gap-3 tracking-tight">
                                            <Camera className="h-5 w-5 text-indigo-400" />
                                            Daily Polaroid
                                        </CardTitle>
                                        <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] uppercase tracking-widest text-white/40 font-black">
                                            Moment
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
                                        Captured in orbit
                                    </p>
                                </CardHeader>
                                <CardContent className="px-6 pb-6 pt-0 flex-1 flex items-center justify-center">
                                    <StackedPolaroids
                                        userPolaroid={polaroids?.userPolaroid || null}
                                        partnerPolaroid={polaroids?.partnerPolaroid || null}
                                        partnerName={partnerProfile?.display_name || 'Partner'}
                                        currentUserId={profile?.id}
                                        coupleId={coupleId}
                                        onDelete={handleDeletePolaroid}
                                        onUploadSuccess={handleUploadSuccess}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                        <div className="border-b border-white/[0.08] w-full" />

                        {/* Row 2: Location & Canvas */}
                        <div className="h-full">
                            <div className="h-full">
                                <DistanceTimeWidget uProfile={profile} partnerProfile={partnerProfile} />
                            </div>
                        </div>
                        <div className="border-b border-white/[0.08] w-full" />

                        <div className="h-full">
                            <div className="h-[420px] md:h-[400px]">
                                <SharedDoodle
                                    savedPath={doodle?.path_data}
                                    coupleId={coupleId}
                                    onSave={async (path) => {
                                        const res = await saveDoodle(path, coupleId)
                                        if (res.success) {
                                            setCoreData({ doodle: { ...doodle, path_data: path } })
                                            const partnerId = partnerProfile?.id
                                            const actorId = profile?.id
                                            const sessionId = getSessionIdForCanvasNotification()
                                            if (partnerId && actorId && sessionId && !doodleNotificationInFlightRef.current) {
                                                doodleNotificationInFlightRef.current = true
                                                try {
                                                    const reactivateResult = await reactivateCanvasNotification({
                                                        recipientId: partnerId,
                                                        sessionId,
                                                        actionUrl: '/dashboard'
                                                    })
                                                    if (!reactivateResult.success) {
                                                        await sendNotification({
                                                            recipientId: partnerId,
                                                            actorId,
                                                            type: 'announcement',
                                                            title: 'Canvas Updated 🎨',
                                                            message: `${profile?.display_name || 'Partner'} updated the shared canvas.`,
                                                            actionUrl: '/dashboard',
                                                            metadata: { type: 'canvas_update', coupleId, sessionId }
                                                        })
                                                    }
                                                } finally {
                                                    doodleNotificationInFlightRef.current = false
                                                }
                                            }
                                        }
                                        return res
                                    }}
                                />
                            </div>
                        </div>

                        {/* Row 3: Insights & Daily Content */}
                        <div className="h-full">
                            <Suspense fallback={<DashboardSkeleton className="h-full min-h-[200px]" />}>
                                <DailyContentWrapper />
                            </Suspense>
                        </div>

                        {(userCycle?.last_period_start || partnerCycle?.last_period_start) && (
                            <div className="h-full">
                                <LunarPhaseCard />
                            </div>
                        )}

                        {/* Row 4: Chronological Moments */}
                        {hasPartner && coupleId && (
                            <Suspense fallback={<DashboardSkeleton className="h-[400px]" />}>
                                <CoupleMomentsWrapper
                                    coupleId={coupleId}
                                    partnerName={partnerProfile?.display_name || 'Partner'}
                                    daysTogether={daysTogether}
                                />
                            </Suspense>
                        )}
                    </div>
                </div>
            </motion.div>

            <WriteLetterDialog
                open={isWritingLetter}
                onOpenChange={setIsWritingLetter}
            />

            <AddMemoryDialog
                open={isAddingMemory}
                onOpenChange={setIsAddingMemory}
            />
        </DashboardShell>
    )
}
