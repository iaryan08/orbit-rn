"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame } from "lucide-react";

interface LibidoMeterProps {
    level: string | null;
}

export function LibidoMeter({ level }: LibidoMeterProps) {
    // Map levels to angles (-90 is left, 0 is top, 90 is right)
    const getAngle = (l: string | null) => {
        switch (l) {
            case "low":
                return -88;
            case "medium":
                return -30;
            case "high":
                return 30;
            case "very_high":
                return 88;
            default:
                return -30;
        }
    };

    // Dynamic colors based on level
    const getColor = (l: string | null) => {
        switch (l) {
            case "low":
                return "#22c55e"; // Green
            case "medium":
                return "#eab308"; // Yellow
            case "high":
                return "#f97316"; // Orange
            case "very_high":
                return "#ef4444"; // Red
            default:
                return "#eab308"; // Default
        }
    };

    const angle = getAngle(level);
    const activeColor = getColor(level);
    const isVeryHigh = level === "very_high";

    // Measurements
    const CX = 100;
    const CY = 108; // Pivot Point

    return (
        <div className="relative w-full max-w-[280px] aspect-[2/1] mx-auto flex items-end justify-center overflow-visible">

            {/* Visual Alignment Landmark */}
            <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.05)] blur-[2px] pointer-events-none z-0" />

            <svg
                viewBox="0 0 200 110"
                className="w-full h-full overflow-visible z-10"
                preserveAspectRatio="xMidYMax meet"
            >
                <defs>
                    <linearGradient id="meterGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#22c55e" />
                        <stop offset="50%" stopColor="#eab308" />
                        <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>

                    {/* Creative Hub Gradient */}
                    <radialGradient id="hubGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                        <stop offset="0%" stopColor="#4a4a4a" />
                        <stop offset="100%" stopColor="#1a1a1a" />
                    </radialGradient>
                </defs>

                {/* 1. Base Arc */}
                <path
                    d={`M 20 ${CY} A 80 80 0 0 1 180 ${CY}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="10"
                    strokeLinecap="round"
                />

                {/* 2. Gradient Arc */}
                <path
                    d={`M 20 ${CY} A 80 80 0 0 1 180 ${CY}`}
                    fill="none"
                    stroke="url(#meterGradient)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    className="opacity-90"
                />

                {/* 3. PIVOT GROUP Translated to Center */}
                <g transform={`translate(${CX}, ${CY})`}>

                    {/* 4. ROTATING NEEDLE */}
                    <motion.g
                        animate={{ rotate: angle }}
                        transition={{ type: "spring", stiffness: 45, damping: 12 }}
                        style={{ originY: 1, originX: 0.5 }}
                    >
                        <motion.path
                            d="M -4 0 L 0 -90 L 4 0 Z"
                            animate={{ fill: activeColor }}
                            transition={{ duration: 0.5 }}
                            style={{ filter: `drop-shadow(0 0 4px ${activeColor}80)` }}
                        />
                    </motion.g>

                    {/* 5. STATIC CREATIVE HUB */}

                    {/* Outer Ring - Changed from thick black to creative dark grey gradient */}
                    <circle cx="0" cy="0" r="7.5" fill="url(#hubGradient)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />

                    {/* Center Display: Dot OR Fire */}
                    <AnimatePresence mode="wait">
                        {!isVeryHigh ? (
                            <motion.g
                                key="dot"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <circle cx="0" cy="0" r="4" fill={activeColor} className="drop-shadow-sm" />
                                <circle cx="0" cy="0" r="1.5" fill="#1a1a1a" />
                            </motion.g>
                        ) : (
                            <motion.g
                                key="fire"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                transition={{ type: "spring", stiffness: 200, damping: 12 }}
                            >
                                {/* Circular Glow behind Fire */}
                                <circle cx="0" cy="0" r="6" fill="rgba(244, 63, 94, 0.6)" filter="blur(4px)" />

                                {/* HTML Icon inside SVG via foreignObject for full CSS capabilities */}
                                <foreignObject x="-8" y="-9" width="16" height="18">
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Flame
                                            className="w-4 h-4 text-rose-500 fill-rose-500 animate-pulse"
                                        />
                                    </div>
                                </foreignObject>
                            </motion.g>
                        )}
                    </AnimatePresence>

                </g>

            </svg>

            {/* Labels */}
            <div className="absolute bottom-1 left-[15px] right-[15px] flex justify-between pointer-events-none">
                <span className="text-[9px] uppercase font-black text-white/10 tracking-[0.4em]">Low</span>
                <span className="text-[9px] uppercase font-black text-white/10 tracking-[0.4em]">High</span>
            </div>
        </div>
    );
}
