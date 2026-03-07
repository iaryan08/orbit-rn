'use client'

import React from 'react'
import { Heart, Activity, Sparkles, Loader2, History, Flame } from 'lucide-react'
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { format, differenceInDays, startOfDay } from 'date-fns'
import { logSexDrive } from '@/lib/client/auth'
import { useToast } from '@/hooks/use-toast'
import { cn, normalizeDate } from '@/lib/utils'
import { SupportModal } from '../support-modal'
import { LibidoMeter } from './libido-meter'
import { LibidoSlider } from './libido-slider'
import { AuraLogCard } from './aura-log-card'
import { fetchSupportSuggestions } from '@/lib/client/ai-support'
import { useOrbitStore } from '@/lib/store/global-store'

export function LunaraTabPartner({ data: initialSnapshot }: { data: any }) {
    const { profile, partnerProfile, supportLogs, cycleLogs, userCycle, partnerCycle } = useOrbitStore();

    const [sharedSymptoms, setSharedSymptoms] = React.useState<string[]>([])
    const [mySexDrive, setMySexDrive] = React.useState<string | null>(null)
    const [partnerSexDrive, setPartnerSexDrive] = React.useState<string | null>(null)
    const [isSyncingDrive, setIsSyncingDrive] = React.useState(false)
    const [syncedFlash, setSyncedFlash] = React.useState(false)
    const [showSupportModal, setShowSupportModal] = React.useState(false)
    const { toast } = useToast()

    // relevant cycle logic
    const isFemale = profile?.gender === 'female'
    const herCycle = isFemale ? userCycle : partnerCycle
    const partnerName = partnerProfile?.display_name || 'Partner'

    // Calculate Cycle Day
    const getCycleDay = () => {
        if (!herCycle?.last_period_start) return null
        const start = startOfDay(new Date(herCycle.last_period_start))
        const today = startOfDay(new Date())
        const diff = differenceInDays(today, start)
        const cycleLength = herCycle.avg_cycle_length || 28
        return (diff % cycleLength) + 1
    }
    const currentDay = getCycleDay()

    // Tips for Support (Male View)
    const getSupportAdvice = (day: number) => {
        if (day <= 5) return `During her Winter, ${partnerName} might appreciate extra rest and comfort. A warm tea or taking over chores would mean a lot today.`
        if (day <= 13) return `${partnerName} is in her Spring—energy is rising! Plan something active or a surprise date.`
        if (day === 14 || day === 15) return `${partnerName} is in her Summer. This is her peak social and energetic time—make the most of it together!`
        return `${partnerName} is in her Autumn. Extra patience and listening are key. Maybe surprise her with her favorite comfort food?`
    }

    // Tips for Wellness (Female View)
    const getWellnessAdvice = (day: number) => {
        if (day <= 5) return "Be gentle with yourself. Focus on hydration, slow movement, and early nights. Your body is doing hard work."
        if (day <= 13) return "Your creative energy is peaking! It's a great time to start new projects or have deep conversations."
        if (day === 14 || day === 15) return "You're at your most outgoing—embrace it. Great time for social connections and feeling confident."
        return "You might feel more introspective. Prioritize self-care and communicate your needs clearly to your partner."
    }

    // Sync state with store data
    React.useEffect(() => {
        if (!profile?.id) return;
        const myLog = cycleLogs?.find((l: any) => l.user_id === profile.id)
        if (myLog) {
            setSharedSymptoms(myLog.symptoms || [])
            setMySexDrive(myLog.sex_drive || null)
        } else {
            setSharedSymptoms([])
            setMySexDrive(null)
        }

        const partnerLog = cycleLogs?.find((l: any) => l.user_id === partnerProfile?.id)
        if (partnerLog) {
            setPartnerSexDrive(partnerLog.sex_drive || null)
        } else {
            setPartnerSexDrive(null)
        }
    }, [cycleLogs, profile?.id, partnerProfile?.id])

    React.useEffect(() => {
        if (!isFemale && partnerProfile?.id && herCycle) {
            const phase = (currentDay ?? 1) <= 5 ? "The Winter" :
                (currentDay ?? 1) <= 13 ? "The Spring" :
                    ((currentDay ?? 1) === 14 || (currentDay ?? 1) === 15) ? "The Summer" : "The Autumn"

            fetchSupportSuggestions(partnerProfile.id, partnerName, phase, currentDay ?? 1)
        }
    }, [isFemale, partnerProfile?.id, currentDay, partnerName, herCycle])

    const partnerLog = cycleLogs?.find((l: any) => l.user_id === partnerProfile?.id)

    const oneMonthAgo = new Date()
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30)

    const allVisibleLogs = (supportLogs || [])
        .filter((log: any) => new Date(log.log_date) >= oneMonthAgo)

    const visibleLogsMobile = allVisibleLogs.slice(0, 3)
    const visibleLogsDesktop = allVisibleLogs.slice(0, 5)

    const archivedLogs = supportLogs || []
    const hasMoreDesktop = archivedLogs.length > visibleLogsDesktop.length
    const hasMoreMobile = archivedLogs.length > visibleLogsMobile.length

    return (
        <div className="w-screen relative left-1/2 -translate-x-1/2 md:w-auto md:left-0 md:translate-x-0 space-y-8 pb-6">
            <div className="hidden md:block">
                <div className="flex flex-col gap-3">
                    <div className="space-y-2">
                        <h2 className="text-3xl md:text-[48px] font-serif font-light text-white tracking-wide">
                            {isFemale ? "Wellness" : `With ${partnerName}`}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-8">
                <div className="h-full">
                    <div className="glass-card lunara-section-card p-8 md:p-10 border-t border-l border-purple-500/5 h-full relative overflow-hidden flex flex-col justify-between rounded-2xl transition-all duration-300">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
                                    <Sparkles className="w-5 h-5 text-purple-300" />
                                </div>
                                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Daily Wisdom</span>
                            </div>

                            <p className="text-xl md:text-2xl text-white/90 font-serif italic leading-relaxed">
                                {herCycle ? (
                                    currentDay ? (isFemale ? getWellnessAdvice(currentDay) : getSupportAdvice(currentDay)) : "Syncing orbit..."
                                ) : "Connect shared orbit for deep insights."}
                            </p>
                            <div className="w-12 h-1 bg-purple-500/40 rounded-full mt-2" />
                        </div>

                        {!isFemale && (
                            <button
                                onClick={() => setShowSupportModal(true)}
                                className="mt-8 h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-[0.25em] text-white/40 hover:text-white transition-all w-full flex items-center justify-center gap-3 group"
                            >
                                <Heart className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                Log Support Action
                            </button>
                        )}
                    </div>
                </div>

                <div className="h-full">
                    <div className="glass-card lunara-section-card p-8 md:p-10 border-t border-l border-purple-500/5 h-full relative overflow-hidden flex flex-col rounded-2xl transition-all duration-300">
                        <div className="flex items-center justify-between gap-6 mb-10">
                            <div className="space-y-0.5">
                                <h3 className="text-lg font-bold text-white tracking-wide">Libido Meter</h3>
                                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Intimacy Alignment</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                                <Flame className="w-4 h-4 text-rose-400 opacity-60" />
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col justify-between space-y-10">
                            <div className="py-2">
                                <LibidoMeter level={partnerSexDrive} />
                                <div className="text-center mt-6">
                                    <span className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                                        {isFemale ? partnerName : "Her"} Libido
                                    </span>
                                    {partnerSexDrive && (
                                        <div className={cn("text-[11px] font-black uppercase tracking-[0.25em] mt-2",
                                            partnerSexDrive === 'low' ? "text-green-400" :
                                                partnerSexDrive === 'medium' ? "text-yellow-400" :
                                                    partnerSexDrive === 'high' ? "text-orange-400" :
                                                        partnerSexDrive === 'very_high' ? "text-rose-400" : "text-red-400"
                                        )}>
                                            {partnerSexDrive.replace('_', ' ')}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <LibidoSlider
                                    key={mySexDrive}
                                    defaultValue={mySexDrive || 'medium'}
                                    isSyncing={isSyncingDrive}
                                    isSynced={syncedFlash}
                                    onValueChange={async (val) => {
                                        setMySexDrive(val)
                                        setIsSyncingDrive(true)
                                        setSyncedFlash(false)
                                        try {
                                            const result = await logSexDrive(val)
                                            if (result?.success) {
                                                setSyncedFlash(true)
                                                setTimeout(() => setSyncedFlash(false), 2000)
                                            }
                                        } finally {
                                            setIsSyncingDrive(false)
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2">
                    <AuraLogCard
                        isEditable={isFemale}
                        isFemale={isFemale}
                        title={isFemale ? "How are you feeling?" : `How ${partnerName} is feeling`}
                        subtitle={isFemale ? "CORE VITALITY" : "VITALITY TRACKING"}
                        currentDay={currentDay}
                        initialSymptoms={isFemale ? sharedSymptoms : (partnerLog?.symptoms || [])}
                    />
                </div>

                <div className="md:col-span-2">
                    <div className="glass-card lunara-section-card p-10 md:p-12 border-t border-l border-purple-500/5 rounded-2xl">
                        <div className="flex items-center justify-between gap-6 mb-10">
                            <div className="space-y-0.5">
                                <h3 className="text-lg md:text-xl font-bold text-white tracking-wide">
                                    {isFemale ? "Grateful Moments" : "Support Legacy"}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Chronicle of Care</p>
                                    <div className="hidden md:block">
                                        {hasMoreDesktop && <div className="w-1 h-1 rounded-full bg-purple-500/40" />}
                                    </div>
                                    <div className="md:hidden">
                                        {hasMoreMobile && <div className="w-1 h-1 rounded-full bg-purple-500/40" />}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {hasMoreDesktop && (
                                    <Drawer>
                                        <DrawerTrigger asChild>
                                            <button className="hidden md:flex w-10 h-10 rounded-full bg-white/5 border border-white/10 items-center justify-center hover:bg-white/10 transition-colors group">
                                                <History className="w-4 h-4 text-purple-300 opacity-60 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        </DrawerTrigger>
                                        <DrawerContent className="bg-[#0a0a0a] border-white/10 max-h-[85vh] focus:outline-none">
                                            <div className="mx-auto w-full max-w-lg">
                                                <DrawerHeader className="border-b border-white/5 pb-6">
                                                    <DrawerTitle className="text-xl font-serif font-light text-white tracking-wide flex items-center justify-between">
                                                        <span>Full History</span>
                                                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/20">{archivedLogs.length} Moments</span>
                                                    </DrawerTitle>
                                                </DrawerHeader>
                                                <ScrollArea className="h-[60vh] p-6">
                                                    <div className="space-y-4 pb-12">
                                                        {archivedLogs.map((log: any) => {
                                                            const isMe = log.supporter_id === profile?.id
                                                            return (
                                                                <div key={log.id} className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-between min-h-[100px]">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <span className="text-[8px] text-rose-400/60 font-black uppercase tracking-widest">{log.category}</span>
                                                                        <span className="text-[9px] text-white/20 font-mono">{format(normalizeDate(log.log_date), "MMM d, yyyy")}</span>
                                                                    </div>
                                                                    <p className="text-sm text-white/80 font-serif italic leading-relaxed">
                                                                        <span className="text-purple-300/40 not-italic uppercase text-[9px] font-black mr-2">{isMe ? "You" : partnerName}</span>
                                                                        {log.action_text}
                                                                    </p>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </DrawerContent>
                                    </Drawer>
                                )}
                                {hasMoreMobile && (
                                    <Drawer>
                                        <DrawerTrigger asChild>
                                            <button className="md:hidden w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors group">
                                                <History className="w-4 h-4 text-purple-300 opacity-60 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        </DrawerTrigger>
                                        <DrawerContent className="bg-[#0a0a0a] border-white/10 max-h-[85vh] focus:outline-none">
                                            <div className="mx-auto w-full max-w-lg">
                                                <DrawerHeader className="border-b border-white/5 pb-6">
                                                    <DrawerTitle className="text-xl font-serif font-light text-white tracking-wide flex items-center justify-between">
                                                        <span>Full History</span>
                                                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/20">{archivedLogs.length} Moments</span>
                                                    </DrawerTitle>
                                                </DrawerHeader>
                                                <ScrollArea className="h-[60vh] p-6">
                                                    <div className="space-y-4 pb-12">
                                                        {archivedLogs.map((log: any) => {
                                                            const isMe = log.supporter_id === profile?.id
                                                            return (
                                                                <div key={log.id} className="p-5 rounded-2xl bg-white/5 border border-white/5 flex flex-col justify-between min-h-[100px]">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <span className="text-[8px] text-rose-400/60 font-black uppercase tracking-widest">{log.category}</span>
                                                                        <span className="text-[9px] text-white/20 font-mono">{format(normalizeDate(log.log_date), "MMM d, yyyy")}</span>
                                                                    </div>
                                                                    <p className="text-sm text-white/80 font-serif italic leading-relaxed">
                                                                        <span className="text-purple-300/40 not-italic uppercase text-[9px] font-black mr-2">{isMe ? "You" : partnerName}</span>
                                                                        {log.action_text}
                                                                    </p>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        </DrawerContent>
                                    </Drawer>
                                )}
                            </div>
                        </div>

                        <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {visibleLogsDesktop && visibleLogsDesktop.length > 0 ? visibleLogsDesktop.map((log: any) => {
                                const isMe = log.supporter_id === profile?.id
                                return (
                                    <div key={log.id} className="p-5 rounded-2xl bg-black/20 border border-white/5 hover:border-purple-500/20 transition-all group flex flex-col justify-between min-h-[110px]">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[8px] text-rose-400/60 font-black uppercase tracking-widest line-clamp-1 truncate">{log.category}</span>
                                            <span className="text-[9px] text-white/10 font-mono flex-shrink-0">{format(normalizeDate(log.log_date), "MMM d")}</span>
                                        </div>
                                        <p className="text-[11px] text-white/80 font-serif italic leading-relaxed truncate">
                                            <span className="text-purple-300/40 not-italic uppercase text-[9px] font-black mr-2">{isMe ? "You" : partnerName}</span>
                                            {log.action_text}
                                        </p>
                                    </div>
                                )
                            }) : (
                                <div className="col-span-full py-12 text-center border border-dashed border-white/5 rounded-2xl">
                                    <p className="text-[9px] text-white/20 uppercase font-black tracking-widest">No support legacy yet.</p>
                                </div>
                            )}
                        </div>

                        <div className="md:hidden grid grid-cols-1 gap-0">
                            {visibleLogsMobile && visibleLogsMobile.length > 0 ? visibleLogsMobile.map((log: any) => {
                                const isMe = log.supporter_id === profile?.id
                                return (
                                    <div key={log.id} className="p-5 rounded-2xl bg-black/20 border border-white/5 hover:border-purple-500/20 transition-all group flex flex-col justify-between min-h-[90px]">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[8px] text-rose-400/60 font-black uppercase tracking-widest line-clamp-1 truncate">{log.category}</span>
                                            <span className="text-[9px] text-white/10 font-mono flex-shrink-0">{format(normalizeDate(log.log_date), "MMM d")}</span>
                                        </div>
                                        <p className="text-[12px] text-white/80 font-serif italic leading-relaxed truncate">
                                            <span className="text-purple-300/40 not-italic uppercase text-[9px] font-black mr-2">{isMe ? "You" : partnerName}</span>
                                            {log.action_text}
                                        </p>
                                    </div>
                                )
                            }) : (
                                <div className="col-span-full py-8 text-center border border-dashed border-white/5 rounded-2xl">
                                    <p className="text-[9px] text-white/20 uppercase font-black tracking-widest">No support legacy yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <SupportModal
                isOpen={showSupportModal}
                onClose={() => setShowSupportModal(false)}
                phase={herCycle ? (
                    (currentDay ?? 1) <= 5 ? "The Winter" :
                        (currentDay ?? 1) <= 13 ? "The Spring" :
                            ((currentDay ?? 1) === 14 || (currentDay ?? 1) === 15) ? "The Summer" : "The Autumn"
                ) : "Support"}
                day={currentDay ?? 1}
                partnerName={partnerName}
                partnerAvatar={partnerProfile?.avatar_url}
                partnerId={partnerProfile?.id || ""}
            />
        </div>
    )
}
