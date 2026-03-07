'use client'

import React from 'react'
import { Moon, Plus, Minus, Activity, Heart, Loader2, Settings } from 'lucide-react'
import { differenceInDays, format, startOfDay } from 'date-fns'
import { cn, getTodayIST, normalizeDate } from '@/lib/utils'
import { logPeriodStart, logPeriodEnd } from '@/lib/client/auth'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { CycleCalendar } from './cycle-calendar'
import { AuraLogCard } from './aura-log-card'
import { IntimacyAlert } from '@/components/intimacy-alert'
import { ImpactStyle } from '@capacitor/haptics'
import { safeImpact } from '@/lib/client/haptics'
import { useOrbitStore } from '@/lib/store/global-store'

export function LunaraTabDashboard({ data: initialSnapshot }: { data: any }) {
    const { profile } = useOrbitStore();
    const userCycle = useOrbitStore(state => state.userCycle);
    const partnerCycle = useOrbitStore(state => state.partnerCycle);
    const cycleLogs = useOrbitStore(state => state.cycleLogs);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);

    // Reactive cycle profile based on gender
    const cycleProfile = profile?.gender === 'female' ? userCycle : partnerCycle;

    const [isLogging, setIsLogging] = React.useState(false)

    // Find the LATEST log for the person being tracked (within 24h rolling window)
    const trackedUserId = profile?.gender === 'female' ? profile?.id : partnerProfile?.id
    const trackedLog = cycleLogs?.find((l: any) => l.user_id === trackedUserId)

    const { toast } = useToast()
    const router = useRouter()

    const getCycleDay = () => {
        if (!cycleProfile?.last_period_start) return null
        const start = startOfDay(new Date(cycleProfile.last_period_start))
        const today = startOfDay(new Date())
        const diff = differenceInDays(today, start)
        const cycleLength = cycleProfile.avg_cycle_length || 28
        return (diff % cycleLength) + 1
    }

    const currentDay = getCycleDay()
    const partnerName = partnerProfile?.display_name || 'Partner'

    const getPhaseInfo = (day: number) => {
        const phases = [
            {
                name: "Menstrual Phase",
                color: "text-rose-400",
                female: [
                    "Your body is working hard. Prioritize deep rest, warm teas, and iron-rich meals.",
                    "Focus on your inner world. It's okay to decline social invites. Magnesium is your best friend today.",
                    "Gentle heat and restorative movements will soothe you. Honor your need for boundaries and softness."
                ],
                male: [
                    "Comfort is everything. Keep her environment warm and have her favorite snacks ready.",
                    "Offer gentle physical comfort without expectations. Think hot water bottles and soft blankets.",
                    "Patience is your superpower today. Listen deeply and provide a steady, grounding presence."
                ]
            },
            {
                name: "Follicular Phase",
                color: "text-emerald-400",
                female: [
                    "A surge of creativity and optimism is blooming. Perfect time to start a new project.",
                    "Harness your rising ambition. Your brain is primed for learning and socializing.",
                    "You're feeling a fresh wave of energy. Try a new workout or a bold creative challenge today."
                ],
                male: [
                    `${partnerName} is feeling a fresh wave of energy. Surprise her with an active date—a hike or a new restaurant.`,
                    `Match ${partnerName}'s rising optimism. Be her biggest cheerleader as she starts new projects or ideas.`,
                    "Social energy is high. Suggest a double date or a fun evening out with friends."
                ]
            },
            {
                name: "Ovulatory Phase",
                color: "text-amber-400",
                female: [
                    "You're at your most vibrant and magnetic. Use this peak energy for important social events.",
                    "Your communication is at its most persuasive and clear. Be open about your deepest desires.",
                    "You're radiating confidence. This is a great time for deep connection and bold moves."
                ],
                male: [
                    `This is ${partnerName}'s most magnetic phase. Compliment her sincerely and plan a romantic evening.`,
                    `Match ${partnerName}'s peak energy with quality presence and passion. She's feeling vibrant and seen.`,
                    "Confidence is peaking. Major romance points for compliments and high-energy quality time."
                ]
            },
            {
                name: "Luteal Phase",
                color: "text-indigo-400",
                female: [
                    "The season of grounding. Honor your need for nesting and restorative, gentle movement.",
                    "Prioritize self-care and protein-rich meals to help stabilize your mood as energy dips.",
                    "Peaceful boundaries are vital now. Create a relaxing environment and finish up pending tasks."
                ],
                male: [
                    "Patience and emotional safety are vital now. Take over household chores without being asked.",
                    `Listen without trying to 'fix' things. Provide a steady, grounding presence as ${partnerName}'s energy shifts.`,
                    `Be extra gentle today. Physical comfort and a listening ear go a long way in this phase.`
                ]
            }
        ]

        if (day <= 5) return phases[0]
        if (day <= 13) return phases[1]
        if (day === 14 || day === 15) return phases[2]
        return phases[3]
    }

    const phase = currentDay ? getPhaseInfo(currentDay) : null

    const getPregnancyChance = (day: number) => {
        if (day === 14) return { level: "Very High", color: "text-red-500" }
        if (day >= 12 && day <= 15) return { level: "High", color: "text-rose-500" }
        if (day >= 10 && day <= 17) return { level: "Medium", color: "text-amber-400" }
        return { level: "Low", color: "text-emerald-400" }
    }

    const chance = currentDay ? getPregnancyChance(currentDay) : { level: "—", color: "text-white/20" }

    const getInsightContent = () => {
        if (!phase) return "Stay synced and supportive."
        const now = new Date()
        const index = now.getDate() % 3
        return profile?.gender === 'female' ? phase.female[index] : phase.male[index]
    }

    const dailyInsight = getInsightContent()

    const isPeriodActive = currentDay !== null &&
        currentDay <= (cycleProfile?.avg_period_length || 5) &&
        (!cycleProfile?.period_ended_at || new Date(cycleProfile.period_ended_at) < new Date(cycleProfile.last_period_start))

    const handleLogPeriod = async () => {
        setIsLogging(true)
        try {
            const result = await logPeriodStart()
            if (result.success) {
                toast({ title: "Period Started 🩸", variant: "success" })
                router.refresh()
            } else {
                toast({ title: "Log Failed", variant: "destructive" })
            }
        } catch (e) {
            toast({ title: "Log Failed", variant: "destructive" })
        } finally {
            setIsLogging(false)
        }
    }

    const handleLogPeriodEnd = async () => {
        setIsLogging(true)
        try {
            const result = await logPeriodEnd()
            if (result.success) {
                toast({ title: "Period Ended ", variant: "success" })
                router.refresh()
            } else {
                toast({ title: "Update Failed", variant: "destructive" })
            }
        } catch (e) {
            toast({ title: "Update Failed", variant: "destructive" })
        } finally {
            setIsLogging(false)
        }
    }

    const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
        await safeImpact(style, 10)
    }

    return (
        <div className="space-y-12">
            <IntimacyAlert
                profile={profile}
                partnerProfile={partnerProfile}
                couple={useOrbitStore.getState().couple}
                isInitialized={true}
                milestones={useOrbitStore.getState().milestones}
                cycleLogs={cycleLogs}
                currentDateIST={useOrbitStore.getState().currentDateIST}
            />

            <div className="w-full">
                <div className="orbit-lite-black-tint lunara-section-card preserve-original-card relative overflow-hidden rounded-3xl bg-gradient-to-b from-purple-900/10 to-transparent border border-purple-500/5 p-6 md:p-10 shadow-2xl group min-h-[350px] flex items-center justify-center">
                    <div className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[80px] opacity-10 transition-colors duration-1000",
                        phase?.color?.replace('text', 'bg') || "bg-purple-500"
                    )} />

                    {profile?.gender === 'female' && (
                        <button
                            onClick={() => router.push('/lunara/settings')}
                            className="absolute top-6 right-6 z-20 p-2.5 rounded-xl bg-white/5 border border-white/10 text-purple-200 hover:bg-purple-500/20 transition-all group/btn"
                        >
                            <Settings className="w-4 h-4 group-hover/btn:rotate-90 transition-transform duration-500" />
                        </button>
                    )}

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-56 h-56 md:w-72 md:h-72 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full border border-purple-500/5 animate-pulse" />
                            <div className="absolute inset-4 rounded-full border border-purple-400/5 animate-spin-slow" />
                            <div className="absolute inset-10 rounded-full border-[0.5px] border-purple-300/10" />

                            <div className="flex flex-col items-center text-center space-y-2 relative">
                                <div className="animate-fade-in">
                                    <Moon className={cn("w-10 h-10 md:w-14 md:h-14 mb-1 drop-shadow-[0_0_12px_rgba(168,85,247,0.4)]", phase?.color || "text-purple-300")} />
                                </div>

                                <div className="space-y-0.5">
                                    <span className="block text-4xl md:text-6xl font-bold text-white tracking-tighter">
                                        {profile?.gender === 'female'
                                            ? (currentDay ? `Day ${currentDay}` : 'Rhythm')
                                            : (currentDay && cycleProfile?.sharing_enabled
                                                ? `Day ${currentDay}`
                                                : 'Support')}
                                    </span>
                                    {cycleProfile?.last_period_start && (
                                        <span className="block text-[9px] md:text-[11px] font-bold text-white/30 uppercase tracking-[0.2em] font-mono">
                                            {format(normalizeDate(cycleProfile.last_period_start), "MMM dd")}
                                        </span>
                                    )}
                                </div>

                                <div className={cn(
                                    "text-[10px] uppercase tracking-[0.2em] font-black",
                                    phase?.color || "text-purple-300/60"
                                )}>
                                    {phase?.name || 'Partner Sync'}
                                </div>
                            </div>
                        </div>

                        {profile?.gender === 'female' && (
                            <div className="mt-8">
                                <button
                                    onClick={isPeriodActive ? handleLogPeriodEnd : handleLogPeriod}
                                    onPointerDown={() => triggerHaptic(ImpactStyle.Medium)}
                                    disabled={isLogging}
                                    className={cn(
                                        "px-4 py-1.25 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 backdrop-blur-sm md:backdrop-blur-md border active:scale-95 hover:scale-105",
                                        isPeriodActive
                                            ? "bg-rose-500/10 border-rose-500/5 text-rose-400 hover:bg-rose-500/20"
                                            : "bg-purple-500/10 border-purple-500/5 text-purple-400 hover:bg-purple-500/20"
                                    )}
                                >
                                    {isLogging ? <Loader2 className="w-3 h-3 animate-spin" /> : isPeriodActive ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                    {isPeriodActive ? 'End Period' : 'Log Start'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div >
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/5 to-indigo-500/5 rounded-2xl blur opacity-25" />
                    <div className="relative glass-card lunara-section-card py-6 px-3 bg-white/5 border-purple-500/5 rounded-3xl shadow-xl overflow-hidden">
                        <CycleCalendar cycleProfile={cycleProfile} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-0 md:gap-10">
                <div className="lg:col-span-5 h-full">
                    <AuraLogCard
                        isEditable={profile?.gender === 'female'}
                        isFemale={profile?.gender === 'female'}
                        title={profile?.gender === 'female' ? "How are you feeling?" : `How ${partnerName} is feeling?`}
                        subtitle={profile?.gender === 'female' ? "CORE VITALITY" : "VITALITY TRACKING"}
                        currentDay={currentDay}
                        initialSymptoms={trackedLog?.symptoms || []}
                    />
                </div>

                <div className="lg:col-span-7 flex flex-col gap-0 md:gap-10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 md:gap-10">
                        <div className="h-full">
                            <div className="glass-card lunara-section-card p-6 md:p-8 border-purple-500/5 h-full flex flex-col justify-center items-center text-center rounded-3xl">
                                <Activity className="w-5 h-5 text-rose-400/60 mb-4" />
                                <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Pregnancy Chance</h3>
                                <span className={cn("text-3xl md:text-5xl font-black tracking-tight block", chance.color)}>{chance.level}</span>
                                <div className="flex gap-1.5 mt-4">
                                    <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", chance.level === 'Low' ? "bg-emerald-400" : "bg-white/10")} />
                                    <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", chance.level === 'Medium' ? "bg-amber-400" : "bg-white/10")} />
                                    <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", chance.level === 'High' ? "bg-rose-500" : "bg-white/10")} />
                                    <div className={cn("w-1.5 h-1.5 rounded-full transition-colors", chance.level === 'Very High' ? "bg-red-500" : "bg-white/10")} />
                                </div>
                            </div>
                        </div>
                        <div className="hidden md:block h-full">
                            <div className="h-full">
                                <div className="glass-card lunara-section-card p-6 md:p-8 border-purple-500/5 h-full flex flex-col justify-center items-center text-center rounded-3xl">
                                    <Heart className="w-8 h-8 text-rose-400 mb-4" />
                                    <h3 className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30 mb-2">Connection</h3>
                                    <p className="text-xl md:text-3xl font-black text-white tracking-tight">Synced</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div >
                        <div className="glass-card lunara-section-card p-8 md:p-10 border-t border-l border-purple-500/5 h-full relative overflow-hidden rounded-3xl shadow-2xl flex flex-col justify-center">
                            <div className="space-y-6 relative z-10">
                                <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">
                                    {profile?.gender === 'female' ? "Daily Advice" : "Support Protocol"}
                                </span>
                                <p className="text-xl md:text-2xl text-purple-50/90 font-serif leading-relaxed italic pr-6 h-full flex flex-col justify-center">
                                    "{dailyInsight}"
                                </p>
                                <div className="w-12 h-1 bg-purple-500/40 rounded-full mt-2" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
