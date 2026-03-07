"use client";

import { useOrbitStore } from "@/lib/store/global-store";
import { startOfDay, differenceInDays } from "date-fns";
import { Moon, Sparkles, Sun, Leaf, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { m } from "framer-motion";
import { Card } from "@/components/ui/card";

export function LunarPhaseCard() {
    const { profile, userCycle, partnerCycle, partnerProfile } = useOrbitStore();

    if (!profile) return null;

    const isFemale = profile.gender === "female";
    const herCycle = isFemale ? userCycle : partnerCycle;
    const partnerName = partnerProfile?.display_name || "Partner";

    if (!herCycle?.last_period_start) return null;

    // Calculate Cycle Day
    const getCycleDay = () => {
        const start = startOfDay(new Date(herCycle.last_period_start));
        const today = startOfDay(new Date());
        const diff = differenceInDays(today, start);
        const cycleLength = herCycle.avg_cycle_length || 28;
        return (diff % cycleLength) + 1;
    };

    const currentDay = getCycleDay();

    const getPhaseData = (day: number) => {
        if (day <= 5) {
            return {
                name: "Menstrual Phase",
                stage: "The Winter",
                icon: Moon,
                color: "text-rose-400",
                ambientGlow: "bg-rose-500/10",
                borderHighlight: "bg-rose-500/30",
                cardBg: "hover:border-rose-500/20",
                femaleAdvice: "Focus on rest and warmth. Your body is doing hard work. 🍵",
                maleAdvice: `${partnerName} might feel low-energy. Great time for a cozy movie night. 🧸`,
            };
        } else if (day <= 13) {
            return {
                name: "Follicular Phase",
                stage: "The Spring",
                icon: Leaf,
                color: "text-emerald-400",
                ambientGlow: "bg-emerald-500/10",
                borderHighlight: "bg-emerald-500/30",
                cardBg: "hover:border-emerald-500/20",
                femaleAdvice: "Your energy is rising! Perfect for new projects and creativity. 🌱",
                maleAdvice: `${partnerName} is feeling more active. Plan an outdoor date or a surprise? 🚲`,
            };
        } else if (day <= 16) {
            return {
                name: "Ovulatory Phase",
                stage: "The Summer",
                icon: Sun,
                color: "text-amber-400",
                ambientGlow: "bg-amber-500/10",
                borderHighlight: "bg-amber-500/30",
                cardBg: "hover:border-amber-500/20",
                femaleAdvice: "Confidence at its peak. You're glowing and magnetic! ✨",
                maleAdvice: `${partnerName} is in a high-energy phase. Great time for social activities. 🥂`,
            };
        } else {
            return {
                name: "Luteal Phase",
                stage: "The Autumn",
                icon: Sparkles,
                color: "text-indigo-400",
                ambientGlow: "bg-indigo-500/10",
                borderHighlight: "bg-indigo-500/30",
                cardBg: "hover:border-indigo-500/20",
                femaleAdvice: "PMS might kick in. Be gentle with yourself and find grounding. 🕯️",
                maleAdvice: `${partnerName} may feel more sensitive today. Extra patience goes a long way. 🤍`,
            };
        }
    };

    const phase = getPhaseData(currentDay);
    const Icon = phase.icon;
    const advice = isFemale ? phase.femaleAdvice : phase.maleAdvice;

    return (
        <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <Card className={cn(
                "relative overflow-hidden group border-white/5 transition-all duration-700 p-0 !rounded-[1.5rem] glass-card",
                phase.cardBg
            )}>
                {/* Phase Glow Overlay */}
                <div className={cn(
                    "absolute inset-0 opacity-20 pointer-events-none transition-colors duration-700",
                    phase.ambientGlow
                )} />

                <div className="relative z-10 flex flex-col">
                    {/* Standardized Dashboard Widget Header */}
                    <div className="px-6 py-5 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <Icon className={cn("w-5 h-5 drop-shadow-[0_0_8px_currentColor] transition-colors duration-700", phase.color)} />
                            <div className="flex flex-col">
                                <h3 className="text-xl font-serif text-white tracking-tight leading-tight">
                                    {phase.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30">{phase.stage}</p>
                                    <div className="w-1 h-1 rounded-full bg-white/10" />
                                    <p className="text-[9px] uppercase tracking-[0.2em] font-black text-rose-300/40">Cycle Compass</p>
                                </div>
                            </div>
                        </div>

                        {/* Day Indicator */}
                        <div className="flex items-baseline gap-1 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                            <span className="text-xl font-serif text-white">{currentDay}</span>
                            <span className="text-[8px] uppercase tracking-widest font-black text-white/30">Day</span>
                        </div>
                    </div>

                    {/* Advice Content Area */}
                    <div className="px-6 pt-6 pb-8 min-h-[100px] flex flex-col justify-center gap-6">
                        <p className="text-white text-[16px] sm:text-[18px] font-serif italic leading-[1.6] opacity-90 drop-shadow-sm">
                            {advice}
                        </p>

                        {/* Cycle Phase Indicator */}
                        <div className="flex gap-1.5">
                            {["Menstrual Phase", "Follicular Phase", "Ovulatory Phase", "Luteal Phase"].map((p, i) => {
                                const isActive = phase.name === p;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            "h-1 w-8 rounded-full transition-all duration-700",
                                            isActive
                                                ? cn("opacity-100 shadow-[0_0_8px_currentColor]", phase.color.replace('text-', 'bg-'))
                                                : "bg-white/10 opacity-30"
                                        )}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Highlight Glow */}
                <div className={cn(
                    "absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-700",
                    phase.borderHighlight
                )} />
            </Card>
        </m.div>
    );
}
