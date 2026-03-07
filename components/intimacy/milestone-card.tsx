"use client";

import { useState, useEffect, useRef } from "react";
import { useAppMode } from "@/components/app-mode-context";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon, Unlock, Sparkles, History, ChevronRight } from "lucide-react";
import { cn, normalizeDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

interface MilestoneCardProps {
    id: string;
    label: string;
    question: string;
    milestone: any;
    myContentField: string;
    partnerContentField: string;
    myDateField: string;
    partnerDateField: string;
    partnerName: string;
    icon?: React.ReactNode | string;
    image?: string;
    isOpen: boolean;
    onToggle: () => void;
    onSave: (id: string, date: Date | undefined, time: string | undefined, content: string) => Promise<void>;
    isLocallyViewed?: boolean;
}

export function MilestoneCard({
    id,
    label,
    question,
    milestone,
    myContentField,
    partnerContentField,
    myDateField,
    partnerDateField,
    partnerName,
    icon,
    isOpen,
    onToggle,
    onSave,
    isLocallyViewed = false,
}: MilestoneCardProps) {
    const { mode } = useAppMode();
    const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(id);
    const myTimeField = myDateField === 'date_user1' ? 'time_user1' : 'time_user2';
    const partnerTimeField = partnerDateField === 'date_user1' ? 'time_user1' : 'time_user2';

    const [date, setDate] = useState<Date | undefined>(
        showDualDates
            ? (milestone?.[myDateField] ? normalizeDate(milestone[myDateField]) : milestone?.milestone_date ? normalizeDate(milestone.milestone_date) : undefined)
            : (milestone?.milestone_date ? normalizeDate(milestone.milestone_date) : undefined)
    );
    const [content, setContent] = useState(milestone?.[myContentField] || "");
    const [time, setTime] = useState<string>(showDualDates ? (milestone?.[myTimeField] || milestone?.milestone_time || "") : (milestone?.milestone_time || ""));
    const [saving, setSaving] = useState(false);
    const [hasInteracted, setHasInteracted] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    // Scroll card into view when opened
    useEffect(() => {
        if (isOpen && cardRef.current) {
            const el = cardRef.current;
            setTimeout(() => {
                const rect = el.getBoundingClientRect();
                // Only scroll if top is not already near the visible area
                if (rect.top < 80 || rect.top > window.innerHeight * 0.6) {
                    const y = window.scrollY + rect.top - 88; // 88px = safe area below sticky header
                    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
                }
            }, 80);
        }
    }, [isOpen]);

    useEffect(() => {
        if (milestone && !hasInteracted) {
            const initialDate = showDualDates
                ? (milestone[myDateField] || milestone.milestone_date)
                : milestone.milestone_date;

            if (initialDate) {
                setDate(normalizeDate(initialDate));
            }
            if (milestone[myContentField]) {
                setContent(milestone[myContentField]);
            }
            const initialTime = showDualDates ? (milestone?.[myTimeField] || milestone?.milestone_time) : milestone?.milestone_time;
            if (typeof initialTime === 'string') {
                setTime(initialTime);
            }
        }
    }, [milestone, myContentField, myDateField, myTimeField, hasInteracted, showDualDates, id]);

    const myAnswer = milestone?.[myContentField];
    const partnerAnswer = milestone?.[partnerContentField];
    const partnerDateRaw = milestone?.[partnerDateField];
    const partnerDate = partnerDateRaw ? normalizeDate(partnerDateRaw) : null;
    const partnerTimeRaw = showDualDates ? milestone?.[partnerTimeField] : null;
    const partnerTime = typeof partnerTimeRaw === 'string' ? partnerTimeRaw.slice(0, 5) : null;
    const myTime = typeof time === 'string' ? time.slice(0, 5) : '';
    const isCompleted = myAnswer && partnerAnswer;
    const isValid = (d: any): d is Date => d instanceof Date && !isNaN(d.getTime());
    const dateDiff = date && isValid(date) && partnerDate && isValid(partnerDate) ? Math.abs(differenceInDays(date, partnerDate)) : null;
    const isSynced = dateDiff !== null && dateDiff === 0;
    const toMinutes = (timeValue?: string | null) => {
        if (!timeValue) return null;
        const m = String(timeValue).match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const h = Number(m[1]);
        const mins = Number(m[2]);
        if (Number.isNaN(h) || Number.isNaN(mins) || h < 0 || h > 23 || mins < 0 || mins > 59) return null;
        return (h * 60) + mins;
    };
    const myMinutes = toMinutes(myTime);
    const partnerMinutes = toMinutes(partnerTime);
    const timeDiffMinutes = myMinutes !== null && partnerMinutes !== null ? Math.abs(myMinutes - partnerMinutes) : null;

    // Derive accent color from the same icon border palette
    const statusColor = isCompleted
        ? { label: "text-emerald-300", question: "text-white" }
        : myAnswer
            ? { label: "text-amber-300", question: "text-white" }
            : { label: "text-rose-300", question: "text-white" };

    const getMyDateLabel = () => {
        switch (id) {
            case 'first_kiss': return `You kissed ${partnerName}`;
            case 'first_surprise': return 'You received a surprise';
            case 'first_memory': return 'Your memory date';
            default: return 'Your perspective';
        }
    };

    const getPartnerDateLabel = () => {
        const possessivePartner = partnerName.endsWith('s') ? `${partnerName}'` : `${partnerName}'s`;
        switch (id) {
            case 'first_kiss': return `${partnerName} kissed you`;
            case 'first_surprise': return `You surprised ${partnerName}`;
            case 'first_memory': return `${possessivePartner} memory date`;
            default: return `${possessivePartner} perspective`;
        }
    };

    const handleSaveClick = async () => {
        setSaving(true);
        await onSave(id, date, time || undefined, content);
        setSaving(false);
        onToggle();
        setHasInteracted(false);
    };

    const renderIcon = () => {
        if (!icon) return null;

        const statusClasses = isCompleted
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
            : myAnswer
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-rose-500/20 text-rose-400 border-rose-500/40";

        return (
            <div className={cn(
                "p-3 rounded-full flex items-center justify-center transition-all duration-300 border shrink-0",
                statusClasses
            )}>
                {typeof icon === 'string' ? <span className="text-xl">{icon}</span> : icon}
            </div>
        );
    };

    return (
        <div className={cn(
            "group/milestone relative glass-card p-0 overflow-hidden flex flex-col rounded-2xl border border-transparent pointer-events-auto transition-all duration-500",
            isCompleted
                ? "bg-emerald-950/10 border-emerald-500/18"
                : myAnswer
                    ? "bg-amber-950/10 border-amber-500/18"
                    : "bg-neutral-950/40 border-red-500/16",
            isOpen && (
                isCompleted
                    ? "border-emerald-500/38 bg-emerald-950/20"
                    : myAnswer
                        ? "border-amber-500/38 bg-amber-950/20"
                        : "border-red-500/28 bg-red-950/20"
            )
        )} ref={cardRef}>

            {/* Color-themed overlay when card is open */}
            {isOpen && (
                <div
                    className="absolute inset-0 pointer-events-none transition-opacity duration-500"
                    style={{
                        background: isCompleted
                            ? 'linear-gradient(135deg, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.10) 100%)'
                            : myAnswer
                                ? 'linear-gradient(135deg, rgba(245,158,11,0.20) 0%, rgba(245,158,11,0.09) 100%)'
                                : 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.08) 100%)'
                    }}
                />
            )}


            <div
                className="cursor-pointer flex items-center gap-4 p-6 relative z-10"
                onClick={onToggle}
            >
                <div className="relative">
                    {renderIcon()}
                </div>

                <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                        <h3 className="text-2xl md:text-3xl font-serif text-white tracking-tight">
                            {label}
                        </h3>
                        {partnerAnswer && !myAnswer && !isLocallyViewed && (
                            <div className={cn(
                                "w-2 h-2 rounded-full animate-pulse shrink-0",
                                mode === 'moon' ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]" : "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]"
                            )} />
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {date && !isNaN(date.getTime()) && !isOpen && (
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-rose-300/40">{format(date, "dd/MM/yyyy")}</span>
                        </div>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "circOut" }}
                    >
                        <div className="px-6 pb-8 space-y-8 pt-4">
                            {/* Full Question Header */}
                            <div className="space-y-2">
                                <h4 className={cn("text-xl md:text-2xl font-serif italic leading-relaxed tracking-tight", statusColor.question)}>
                                    {question}
                                </h4>
                            </div>

                            {/* Date(s) Selection */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div className="space-y-4">
                                    <label className={cn("text-[10px] uppercase tracking-[0.3em] font-black ml-1", statusColor.label)}>{getMyDateLabel()}</label>
                                    <Input
                                        type="date"
                                        value={date && !isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : ""}
                                        onChange={(e) => {
                                            const d = e.target.value ? normalizeDate(e.target.value) : undefined;
                                            setDate(d);
                                            setHasInteracted(true);
                                        }}
                                        max={format(normalizeDate(new Date()), "yyyy-MM-dd")}
                                        className="h-14 bg-black/40 border-white/10 rounded-2xl text-rose-100 font-serif italic text-lg px-6 [color-scheme:dark] w-full transition-all focus:bg-black/60"
                                        activeBorderClassName="bg-rose-500/80"
                                    />
                                </div>

                                {showDualDates ? (
                                    <div className="space-y-4">
                                        <label className={cn("text-[10px] uppercase tracking-[0.3em] font-black ml-1", statusColor.label)}>{getPartnerDateLabel()}</label>
                                        <div className="w-full h-14 rounded-2xl bg-black/30 border border-white/10 flex items-center px-6">
                                            <span className={cn(
                                                "font-serif italic text-lg",
                                                partnerDate && isValid(partnerDate) ? "text-white/80" : "text-white/25"
                                            )}>
                                                {partnerDate && isValid(partnerDate) ? format(partnerDate, "yyyy-MM-dd") : "Awaiting partner's date..."}
                                            </span>
                                        </div>

                                        <div className={cn(
                                            "inline-flex h-9 rounded-full items-center justify-center px-4 gap-2 border transition-all duration-700",
                                            partnerDate && isValid(partnerDate) && date && isValid(date)
                                                ? (isSynced ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-100" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-100")
                                                : "bg-black/40 border-dashed border-white/10 text-white/20"
                                        )}>
                                            <History className={cn("w-3.5 h-3.5", partnerDate ? (isSynced ? "text-emerald-500/50" : "text-indigo-500/50") : "text-white/20")} />
                                            <span className="font-serif italic text-sm text-center line-clamp-1">
                                                {partnerDate && isValid(partnerDate) && date && isValid(date)
                                                    ? (isSynced ? "Perfectly in sync." : `There's a ${dateDiff} day difference.`)
                                                    : "Awaiting sync comparison..."
                                                }
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="hidden md:flex flex-col justify-end">
                                        <div className="h-14 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-center px-8">
                                            <p className="text-[10px] text-white/20 leading-relaxed uppercase tracking-[0.3em] font-black text-center">
                                                Private & Shared
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mb-6">
                                <div className="space-y-4 max-w-sm">
                                    <label className={cn("text-[10px] uppercase tracking-[0.3em] font-black ml-1", statusColor.label)}>Time (Optional)</label>
                                    <Input
                                        type="time"
                                        value={time}
                                        onChange={(e) => {
                                            setTime(e.target.value);
                                            setHasInteracted(true);
                                        }}
                                        className="h-14 bg-black/40 border-white/10 rounded-2xl text-rose-100 font-serif italic text-lg px-6 [color-scheme:dark] w-full transition-all focus:bg-black/60"
                                        activeBorderClassName="bg-rose-500/80"
                                    />
                                </div>
                            </div>

                            {/* Narratives */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <label className={cn("text-[10px] uppercase tracking-[0.3em] font-black ml-1", statusColor.label)}>My Heart</label>
                                    <Textarea
                                        value={content}
                                        onChange={(e) => { setContent(e.target.value); setHasInteracted(true); }}
                                        className="text-white min-h-[160px] bg-black/40 border-white/10 rounded-3xl p-8 focus:outline-none resize-none font-serif italic text-lg leading-relaxed placeholder:text-white/10 transition-all focus:bg-black/60"
                                        activeBorderClassName="bg-rose-500/80"
                                        placeholder="Note down your perspective..."
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className={cn("text-[10px] uppercase tracking-[0.3em] font-black ml-1", statusColor.label)}>{partnerName.endsWith('s') ? `${partnerName}'` : `${partnerName}'s`} Story</label>
                                    <div className={cn(
                                        "p-8 rounded-3xl border min-h-[160px] flex items-center relative group/inner transition-all duration-500",
                                        partnerAnswer ? "bg-rose-500/5 border-rose-500/20" : "bg-black/40 border-dashed border-white/10 justify-center"
                                    )}>
                                        {partnerAnswer ? (
                                            <>
                                                <div className="absolute -top-4 -left-2 text-[8rem] text-rose-500/5 font-serif select-none pointer-events-none">"</div>
                                                <p className="text-rose-100/90 font-serif italic text-lg leading-relaxed relative z-10">{partnerAnswer}</p>
                                            </>
                                        ) : (
                                            <div className="text-center space-y-3 opacity-40 group-hover/inner:opacity-100 transition-opacity">
                                                <Unlock className="w-6 h-6 text-white/20 mx-auto" />
                                                <span className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-black block">Secret for now...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handleSaveClick}
                                disabled={saving}
                                variant="celestial-rose"
                                className="w-full h-14 text-[11px] font-black tracking-[0.4em] mt-4 border-none"
                            >
                                {saving ? "SAVING..." : "RECORD "}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
