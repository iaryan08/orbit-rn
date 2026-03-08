"use client";

import { useEffect, useRef, useState } from "react";
import { BRIGHT_STARS } from "@/lib/astronomy/stars";
import { useBatteryOptimization } from "@/hooks/use-battery-optimization";
import { detectPerformanceMode } from "@/lib/client/performance-mode";

interface CelestialSkyProps {
    userLat?: number;
    userLon?: number;
    partnerLat?: number;
    partnerLon?: number;
}

/**
 * Celestial Atmosphere Engine
 * Renders a real-time astronomical star map based on partner-first location.
 * Fallback is self location when partner location is unavailable.
 * Optimized for high performance and low battery impact on Android/iOS.
 */
export default function CelestialSky({
    userLat,
    userLon,
    partnerLat,
    partnerLon,
}: CelestialSkyProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { isVisible } = useBatteryOptimization();
    const [mounted, setMounted] = useState(false);

    // Partner-first mode: use partner sky when available, otherwise self.
    const fallbackLat = Number.isFinite(userLat as number) ? (userLat as number) : 28.61;
    const fallbackLon = Number.isFinite(userLon as number) ? (userLon as number) : 77.21;
    const skyLat = Number.isFinite(partnerLat as number) ? (partnerLat as number) : fallbackLat;
    const skyLon = Number.isFinite(partnerLon as number) ? (partnerLon as number) : fallbackLon;

    const drawSky = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Set canvas dimensions with DPR scaling for crispness
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const now = new Date();
        // Julian Date calculation
        const JD = now.getTime() / 86400000 + 2440587.5;
        const D = JD - 2451545.0;

        // GMST (Greenwich Mean Sidereal Time)
        let GMST = (18.697374558 + 24.06570982441908 * D) % 24;
        if (GMST < 0) GMST += 24;

        // LST (Local Sidereal Time)
        let LST = (GMST + skyLon / 15) % 24;
        if (LST < 0) LST += 24;

        const phi = skyLat * (Math.PI / 180);
        const lstRad = LST * 15 * (Math.PI / 180);

        ctx.clearRect(0, 0, width, height);

        // Performance Mode: Limit star count if device is weak
        const perfMode = detectPerformanceMode();
        const starLimit = perfMode === 'lite' ? 300 : 1000;
        const starsToRender = BRIGHT_STARS.slice(0, starLimit);

        starsToRender.forEach(([ra, dec, mag]) => {
            const raRad = ra * 15 * (Math.PI / 180);
            const decRad = dec * (Math.PI / 180);
            const ha = lstRad - raRad;

            // Alt/Az Formula
            const sinH = Math.sin(phi) * Math.sin(decRad) + Math.cos(phi) * Math.cos(decRad) * Math.cos(ha);
            const h = Math.asin(sinH);

            // Only render stars above the horizon (+ a small buffer for atmospheric refraction look)
            if (h < -0.1) return;

            const cosA = (Math.sin(decRad) - Math.sin(phi) * sinH) / (Math.cos(phi) * Math.cos(h));
            let A = Math.acos(Math.max(-1, Math.min(1, cosA)));
            if (Math.sin(ha) > 0) A = 2 * Math.PI - A;

            // Stereographic-like circular projection for a "dome" feel
            const r = (Math.PI / 2 - h) / (Math.PI / 2);
            const centerX = width / 2;
            const centerY = height / 2;
            const spread = Math.max(width, height) * 0.9;

            const x = centerX + Math.sin(A) * r * spread;
            const y = centerY - Math.cos(A) * r * spread;

            // Brightness and size variation
            const brightness = Math.max(0.1, 1 - (mag + 1.5) / 6.5);
            const size = Math.max(0.5, (5.0 - mag) * 0.6);
            const opacity = brightness * (h > 0 ? 1 : (h + 0.1) / 0.1);

            // Subtle glow for brighter stars
            if (mag < 2.0 && perfMode !== 'lite') {
                const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
                glow.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.4})`);
                glow.addColorStop(1, "rgba(255, 255, 255, 0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(x, y, size * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.beginPath();
            ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    useEffect(() => {
        setMounted(true);

        // Initial draw
        const timer = setTimeout(drawSky, 100);

        // 1. Hourly Update (1 hour = 3,600,000 ms)
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') drawSky();
        }, 3600000);

        // 2. Visibility Handling (Pause when app is hidden)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') drawSky();
        };
        document.addEventListener("visibilitychange", handleVisibility);

        // 3. Resize Handling (Debounced)
        let resizeTimer: any;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(drawSky, 500);
        };
        window.addEventListener("resize", handleResize);

        // 4. IntersectionObserver (Pause when background is covered)
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) drawSky();
            },
            { threshold: 0.1 }
        );
        if (containerRef.current) observer.observe(containerRef.current);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("resize", handleResize);
            observer.disconnect();
        };
    }, [skyLat, skyLon]);

    if (!mounted) return null;

    return (
        <div ref={containerRef} className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 block transition-opacity duration-1000"
            />
        </div>
    );
}
