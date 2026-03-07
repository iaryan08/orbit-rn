"use client";

import React, { useState, useEffect, useRef } from "react";
import { m, useScroll, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { safeImpact } from "@/lib/client/haptics";
import { ImpactStyle } from "@capacitor/haptics";

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullProgress, setPullProgress] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const currentY = useRef(0);
    const isPulling = useRef(false);

    const pullThreshold = 80;

    const handleTouchStart = (e: React.TouchEvent) => {
        // Only pull if we are at the top of the container
        if (window.scrollY > 0) return;
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPulling.current || isRefreshing) return;

        currentY.current = e.touches[0].clientY;
        const diff = currentY.current - startY.current;

        if (diff > 0 && window.scrollY <= 0) {
            // Prevent browser default pull-to-refresh if possible
            if (e.cancelable) e.preventDefault();

            const progress = Math.min(diff / pullThreshold, 1.5);
            setPullProgress(progress);

            // Haptic feedback at threshold
            if (progress >= 1 && pullProgress < 1) {
                safeImpact(ImpactStyle.Light);
            }
        } else {
            setPullProgress(0);
            isPulling.current = false;
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current || isRefreshing) return;
        isPulling.current = false;

        if (pullProgress >= 1) {
            await startRefresh();
        } else {
            setPullProgress(0);
        }
    };

    const startRefresh = async () => {
        setIsRefreshing(true);
        setPullProgress(1); // Lock at 1 while refreshing
        safeImpact(ImpactStyle.Medium);

        try {
            await onRefresh();
        } finally {
            setTimeout(() => {
                setIsRefreshing(false);
                setPullProgress(0);
            }, 500);
        }
    };

    return (
        <div
            className="relative w-full h-full overscroll-y-contain"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-50 pt-4"
                style={{
                    opacity: pullProgress > 0 ? 1 : 0,
                    transform: `translateY(${Math.min(pullProgress * 40, 60)}px)`
                }}
            >
                <m.div
                    className="bg-black/95 border border-white/10 rounded-full p-2.5 shadow-2xl flex items-center justify-center"
                    animate={{
                        rotate: isRefreshing ? 360 : pullProgress * 180,
                        scale: pullProgress > 0 ? 1 : 0.5
                    }}
                    transition={isRefreshing ? { repeat: Infinity, duration: 1, ease: "linear" } : { type: "spring", stiffness: 200, damping: 20 }}
                >
                    <RefreshCw className={`w-5 h-5 ${isRefreshing ? "text-rose-400" : "text-white/60"}`} />
                </m.div>
            </div>

            <m.div
                animate={{
                    y: isRefreshing ? 60 : (pullProgress > 0 ? pullProgress * 40 : 0)
                }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
            >
                {children}
            </m.div>
        </div>
    );
}
