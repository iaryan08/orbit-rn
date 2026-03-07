"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useAppMode } from "./app-mode-context";
import { useOrbitStore } from "@/lib/store/global-store";
import { usePathname } from "next/navigation";

interface SectionHeaderProps {
    title: string;
    label?: string;
    count?: number;
    suffix?: string;
    className?: string;
    alwaysFloating?: boolean;
}

export function SectionHeader({ title, label, count, suffix = "items", className, alwaysFloating }: SectionHeaderProps) {
    const { mode } = useAppMode();
    const pathname = usePathname();
    const profile = useOrbitStore(state => state.profile);
    const isMale = (profile as any)?.gender?.toLowerCase() === 'male';
    const isSettings = pathname === '/settings';

    // Theme Logic: Settings uses Identity (Blue/Rose), Others use Mode (Purple/Rose)
    const activeColor = isSettings
        ? (isMale ? 'blue' : 'rose')
        : (mode === 'moon' ? 'rose' : 'purple');

    const themeColor = activeColor;
    const accentBg = activeColor === 'blue' ? 'bg-sky-400' : (activeColor === 'rose' ? 'bg-rose-500' : 'bg-purple-500');
    const accentText = activeColor === 'blue' ? 'text-sky-300' : (activeColor === 'rose' ? 'text-rose-400' : 'text-purple-300');
    const accentShadow = activeColor === 'blue' ? 'shadow-sky-500/40' : (activeColor === 'rose' ? 'shadow-rose-500/40' : 'shadow-purple-500/40');
    const pillBorder = activeColor === 'blue' ? 'border-sky-400/30' : (activeColor === 'rose' ? 'border-rose-500/30' : 'border-purple-500/30');
    const pillBg = activeColor === 'blue' ? 'bg-sky-950/40' : (activeColor === 'rose' ? 'bg-rose-950/40' : 'bg-purple-950/40');

    const [isScrolled, setIsScrolled] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [performanceMode, setPerformanceMode] = useState<'default' | 'lite'>('default');
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
        const { detectPerformanceMode } = require('@/lib/client/performance-mode');
        setPerformanceMode(detectPerformanceMode());

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsScrolled(!entry.isIntersecting);
            },
            {
                threshold: 0,
                rootMargin: "-10px 0px 0px 0px"
            }
        );

        if (sentinelRef.current) observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div className={cn("relative z-[30]", className)}>
            {/* Precise Sentinel Div */}
            <div ref={sentinelRef} className="absolute top-10 h-1 w-full pointer-events-none z-[-1]" />

            <div className="relative">
                {/* 1. Large Header State (Normal flow, scrolls up naturally) */}
                {!alwaysFloating && (
                    <div
                        className={cn(
                            "pt-4 pb-6 bg-transparent pointer-events-auto transition-opacity duration-75 ease-out",
                            isScrolled ? "opacity-0" : "opacity-100"
                        )}
                    >
                        <div className="flex flex-col items-start gap-3 px-4 md:px-0">
                            {/* Desktop-only Branding Logo (Top Left) */}
                            <div className="hidden lg:flex items-center gap-2 mb-1 select-none pointer-events-none">
                                <div
                                    className={cn(
                                        "w-2 h-2 rounded-full shadow-lg",
                                        accentBg, accentShadow
                                    )}
                                />
                                <span className="text-[11px] font-serif italic uppercase tracking-[0.4em] text-white/30">
                                    {mode === 'moon' ? 'MoonBetweenUs' : 'Lunara Sync'}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-2 h-2 rounded-full shadow-lg lg:hidden",
                                    accentBg, accentShadow
                                )} />
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-serif italic uppercase tracking-[0.3em] text-white/40">
                                        {label || title}
                                    </span>
                                    {typeof count === "number" && (
                                        <span className="text-xs font-black text-white/20 tabular-nums">
                                            {count}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white leading-tight tracking-tighter text-left">
                                {title}
                            </h1>
                        </div>
                    </div>
                )}

                {/* 2. Floating Pill State (Fixed, Apple Music Style) */}
                <div
                    className={cn(
                        "fixed left-4 md:left-8 z-[2000] flex flex-col items-start justify-center top-[calc(env(safe-area-inset-top,0px)+2px)] md:top-0 h-16 md:h-20 pointer-events-none transition-all duration-500",
                        (isScrolled || alwaysFloating) && mounted
                            ? "visible opacity-100 translate-y-0"
                            : "invisible opacity-0 translate-y-[-10px]"
                    )}
                >
                    <div
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className={cn(
                            performanceMode === 'lite'
                                ? "bg-black !backdrop-blur-none"
                                : "backdrop-blur-md md:backdrop-blur-xl nav-blur",
                            "px-5 py-2.5 rounded-full flex items-center gap-3 transition-all duration-300 pointer-events-auto cursor-pointer active:scale-95",
                            // Match dock surface treatment exactly
                            "border shadow-2xl",
                            pillBorder,
                            performanceMode === 'lite'
                                ? "bg-black"
                                : (mode === 'moon' ? "bg-black/40" : "bg-black/40"),
                            // Monochrome exact dock match
                            "[html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-white/5"
                        )}
                    >
                        <div className="hidden lg:flex items-center gap-2 border-r border-white/10 pr-3 mr-1 select-none pointer-events-none">
                            <div
                                className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    accentBg,
                                    activeColor === 'rose' ? 'shadow-[0_0_10px_rgba(244,63,94,0.4)]' :
                                        activeColor === 'blue' ? 'shadow-[0_0_10px_rgba(56,189,248,0.4)]' :
                                            'shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                                )}
                            />
                            <span className="text-[10px] font-serif italic uppercase tracking-[0.3em] text-white/40">
                                {mode === 'moon' ? 'MoonBetweenUs' : 'Lunara Sync'}
                            </span>
                        </div>
                        <div
                            className={cn(
                                "w-2 h-2 rounded-full lg:hidden",
                                accentBg,
                                activeColor === 'blue' ? "shadow-[0_0_12px_rgba(56,189,248,0.8)]" :
                                    activeColor === 'rose' ? "shadow-[0_0_12px_rgba(244,63,94,0.8)]" :
                                        "shadow-[0_0_12px_rgba(168,85,247,0.8)]"
                            )}
                        />
                        <span
                            className={cn(
                                "text-[10px] font-black uppercase tracking-[0.25em] text-white/90 whitespace-nowrap transition-opacity duration-300 ease-out mb-[-1px]",
                                (isScrolled || alwaysFloating) ? "opacity-100" : "opacity-0"
                            )}
                        >
                            {title}
                        </span>
                        {typeof count === "number" && (
                            <>
                                <div className="w-px h-3 bg-white/10 mx-0.5" />
                                <span className="text-[11px] text-white/40 font-black tabular-nums">
                                    {count}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
