"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Heart, ImageIcon, PenLine, Plus } from "lucide-react";

interface RelationshipStatsProps {
    couple: any;
    lettersCount: number;
    memoriesCount: number;
    onAddLetter?: () => void;
    onAddMemory?: () => void;
}

export function RelationshipStats({
    couple,
    lettersCount,
    memoriesCount,
    onAddLetter,
    onAddMemory
}: RelationshipStatsProps) {
    const daysTogether = useMemo(() => {
        const startDate = couple?.anniversary_date || couple?.paired_at;
        if (!startDate) return 0;
        const start = new Date(startDate).getTime();
        if (isNaN(start)) return 0;
        const diff = new Date().getTime() - start;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        return isNaN(days) ? 0 : Math.max(0, days);
    }, [couple?.anniversary_date, couple?.paired_at]);

    return (
        <div className="w-full h-full flex" >
            <div className="w-full flex flex-row items-center justify-between gap-3 md:gap-6 relative group min-h-[90px] glass-card !rounded-[1.5rem] px-6 py-5 border-t border-rose-500/5">
                {/* Days Together */}
                <div className="flex items-center gap-3 md:gap-5 flex-1">
                    <div className="relative shrink-0">
                        <Heart className="w-10 h-10 md:w-12 md:h-12 text-rose-500/80" fill="currentColor" />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl md:text-5xl font-bold text-rose-50 tracking-tighter leading-none">
                                {daysTogether}
                            </span>
                            <span className="text-xs md:text-sm text-rose-100/70 font-serif italic">Days</span>
                        </div>
                        <p className="text-[8px] md:text-[10px] uppercase text-white/50 tracking-widest font-bold">Our Journey</p>
                    </div>
                </div>

                <div className="h-10 w-px bg-white/10 shrink-0" />

                {/* Letters & Memories Stacked (One below other) */}
                <div className="flex flex-col gap-4 flex-1 justify-center items-start pl-4 md:pl-8">
                    <div className="flex items-center gap-3">
                        <PenLine className="w-4 h-4 text-rose-300/50" />
                        <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl md:text-2xl font-bold text-white/90 leading-none">{lettersCount}</span>
                                <span className="text-[9px] uppercase text-white/40 tracking-widest font-bold hidden sm:inline">Letters</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <ImageIcon className="w-4 h-4 text-amber-300/50" />
                        <div className="flex flex-col">
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl md:text-2xl font-bold text-white/90 leading-none">{memoriesCount}</span>
                                <span className="text-[9px] uppercase text-white/40 tracking-widest font-black hidden sm:inline">Memories</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
