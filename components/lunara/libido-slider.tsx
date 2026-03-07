"use client";

import React, { useState, useEffect } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface LibidoSliderProps {
    defaultValue: string;
    onValueChange: (value: string) => void;
    isSyncing?: boolean;
    isSynced?: boolean;
}

const levels = ["low", "medium", "high", "very_high"];

export function LibidoSlider({ defaultValue, onValueChange, isSyncing, isSynced }: LibidoSliderProps) {
    const [value, setValue] = useState([levels.indexOf(defaultValue) === -1 ? 1 : levels.indexOf(defaultValue)]);

    // Map slider index (0-3) to level string
    const getLevel = (index: number) => levels[index] || "medium";

    // Handle slide end commit
    const handleCommit = (vals: number[]) => {
        const newLevel = getLevel(vals[0]);
        onValueChange(newLevel);
    };

    const currentLevel = getLevel(value[0]);

    return (
        <div className="w-full space-y-4 pt-2 pb-2">
            <div className="flex justify-between items-end px-1">
                <span className="text-[10px] uppercase font-black text-white/30 tracking-[0.2em]">Your Intensity</span>
                <span className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                    currentLevel === 'low' ? "text-green-400" :
                        currentLevel === 'medium' ? "text-yellow-400" :
                            currentLevel === 'high' ? "text-orange-400" :
                                "text-rose-400"
                )}>
                    {currentLevel.replace('_', ' ')}
                </span>
            </div>

            <SliderPrimitive.Root
                defaultValue={[levels.indexOf(defaultValue) === -1 ? 1 : levels.indexOf(defaultValue)]}
                max={3}
                step={1}
                className="relative flex w-full touch-none select-none items-center"
                onValueChange={(vals) => setValue(vals)}
                onValueCommit={handleCommit}
            >
                <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/5">
                    <SliderPrimitive.Range className={cn(
                        "absolute h-full transition-colors duration-300",
                        currentLevel === 'low' ? "bg-green-500/40" :
                            currentLevel === 'medium' ? "bg-gradient-to-r from-green-500/40 to-yellow-500/40" :
                                currentLevel === 'high' ? "bg-gradient-to-r from-green-500/40 via-yellow-500/40 to-orange-500/40" :
                                    "bg-gradient-to-r from-green-500/40 via-yellow-500/40 to-rose-500/40"
                    )} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white/20 bg-white transition-transform hover:scale-110 cursor-grab active:cursor-grabbing outline-none" />
            </SliderPrimitive.Root>

            <div className="h-4 mt-2">
                {isSyncing ? (
                    <div className="flex items-center gap-1.5 text-[9px] text-purple-400/80 font-black uppercase tracking-widest justify-center">
                        <span className="w-1 h-1 rounded-full bg-purple-400 animate-pulse" />
                        Syncing Pulse...
                    </div>
                ) : isSynced ? (
                    <div className="flex items-center gap-1.5 text-[9px] text-emerald-400/80 font-black uppercase tracking-widest justify-center">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" />
                        Libido Synced
                    </div>
                ) : null}
            </div>
        </div>
    );
}
