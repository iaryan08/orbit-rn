"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { getAtmosphereTheme, isDaytime, cn } from "@/lib/utils";
import { useBatteryOptimization } from "@/hooks/use-battery-optimization";
import { getCustomWallpaper } from "@/lib/idb";
import { applyPerformanceMode, detectPerformanceMode, type PerformanceMode } from "@/lib/client/performance-mode";
import { getPublicStorageUrl } from "@/lib/storage";
import { useOrbitStore } from "@/lib/store/global-store";
import CelestialSky from "./background/CelestialSky";

interface RomanticBackgroundProps {
    initialImage?: string | null;
}

export function RomanticBackground({ initialImage }: RomanticBackgroundProps) {
    const { isVisible } = useBatteryOptimization();
    const bgImageRef = useRef<string | null>(null);
    const [bgImage, setBgImage] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [isGrayscale, setIsGrayscale] = useState(false);
    const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('default');
    const [wallpaperMode, setWallpaperMode] = useState<'custom' | 'black' | 'shared' | 'theme'>('black');
    const [partnerCoords, setPartnerCoords] = useState<{ lat: number, lon: number } | null>(null);
    const [overlayStyle, setOverlayStyle] = useState<'default' | 'A' | 'B' | 'AB'>('default');
    const [isCustom, setIsCustom] = useState(false);

    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);

    useEffect(() => {
        setMounted(true);
        setPerformanceMode(applyPerformanceMode());

        const onPerfModeChanged = () => {
            setPerformanceMode(detectPerformanceMode());
            applyPerformanceMode();
        };

        window.addEventListener('orbit:performance-mode-changed', onPerfModeChanged as EventListener);
        return () => {
            window.removeEventListener('orbit:performance-mode-changed', onPerfModeChanged as EventListener);
        };
    }, []);

    // Primary effect: React to store changes or local persistence
    useEffect(() => {
        if (!mounted) return;

        const setBackground = (url: string | null) => {
            if (url === bgImageRef.current) return;
            bgImageRef.current = url;
            setBgImage(url);
        };

        const updateAtmosphere = async () => {
            const isExplicitlyDeleted = localStorage.getItem('orbit_deleted_wallpaper') === 'true';
            const grayscale = localStorage.getItem('orbit_global_monochrome') === 'true';
            setIsGrayscale(grayscale);

            const localMode = localStorage.getItem('orbit_wallpaper_mode') as any;
            const storeMode = profile?.wallpaper_mode;

            const mode: 'black' | 'custom' | 'shared' | 'theme' =
                (localMode === 'black' || localMode === 'custom' || localMode === 'shared') ? localMode
                    : (storeMode === 'black' || storeMode === 'custom' || storeMode === 'shared') ? storeMode
                        : 'black';

            const finalMode = mode === 'theme' ? 'black' : mode;
            document.documentElement.setAttribute('data-wallpaper-mode', finalMode);
            setWallpaperMode(finalMode);

            const ol = (localStorage.getItem('orbit:overlay_style') as any) || 'default';
            setOverlayStyle(ol);

            if (finalMode === 'black') {
                setBackground(null);
                setIsCustom(false);
            } else if (finalMode === 'custom') {
                if (isExplicitlyDeleted) {
                    setBackground(null);
                    setIsCustom(false);
                } else {
                    const localWallpaper = await getCustomWallpaper();
                    if (localWallpaper) {
                        setBackground(localWallpaper);
                        setIsCustom(true);
                    } else if (profile?.custom_wallpaper_url) {
                        setBackground(getPublicStorageUrl(profile.custom_wallpaper_url, 'avatars'));
                        setIsCustom(true);
                    } else {
                        setBackground(null);
                        setIsCustom(false);
                    }
                }
            } else if (finalMode === 'shared') {
                const sharedUrl = partnerProfile?.custom_wallpaper_url
                    ? getPublicStorageUrl(partnerProfile.custom_wallpaper_url, 'avatars')
                    : null;

                if (sharedUrl) {
                    setBackground(sharedUrl);
                    setIsCustom(true);
                } else {
                    setBackground(null);
                    setIsCustom(false);
                }
            }

            if (partnerProfile?.latitude) {
                setPartnerCoords({ lat: partnerProfile.latitude, lon: partnerProfile.longitude });
            }
        };

        updateAtmosphere();

        // Also listen for legacy events if still triggered from settings
        window.addEventListener('orbit-theme-sync', updateAtmosphere as EventListener);
        return () => {
            window.removeEventListener('orbit-theme-sync', updateAtmosphere as EventListener);
        };
    }, [mounted, profile, partnerProfile]);

    if (!mounted) return null;

    return (
        <div className="fixed top-0 left-0 w-full h-[100lvh] z-0 overflow-hidden pointer-events-none bg-black">
            <div className="absolute inset-0 bg-black">
                {wallpaperMode !== 'black' && bgImage && (
                    <div className={cn("absolute inset-0 transition-opacity duration-1000", isGrayscale && "grayscale")}>
                        <img
                            src={bgImage.replace('-m-m.webp', '-m.webp')}
                            alt="Atmosphere"
                            className={cn(
                                "absolute inset-0 w-full h-full object-cover transition-all duration-1000",
                                isGrayscale
                                    ? (isCustom ? "opacity-[0.35] contrast-[1.2] brightness-[0.7]" : "opacity-[0.25] contrast-[1.2] brightness-[0.8]")
                                    : (isCustom ? "opacity-[0.8] contrast-[1.05]" : "opacity-45 contrast-[1.05] saturate-[0.9]")
                            )}
                        />
                    </div>
                )}
            </div>

            {performanceMode !== 'lite' && (
                <CelestialSky
                    userLat={partnerCoords ? undefined : profile?.latitude}
                    userLon={partnerCoords ? undefined : profile?.longitude}
                    partnerLat={partnerCoords?.lat}
                    partnerLon={partnerCoords?.lon}
                />
            )}

            {isCustom ? (
                isGrayscale ? (
                    <div
                        className="absolute inset-0 z-[1] pointer-events-none transition-all duration-700"
                        style={{ background: 'rgba(0,0,0,0.45)', mixBlendMode: 'multiply' }}
                    />
                ) : (
                    <>
                        {(overlayStyle === 'A' || overlayStyle === 'AB') && (
                            <div
                                className="absolute inset-0 z-[1] pointer-events-none transition-all duration-700"
                                style={{
                                    backdropFilter: 'brightness(0.42) contrast(1.12) saturate(0.85)',
                                    WebkitBackdropFilter: 'brightness(0.42) contrast(1.12) saturate(0.85)'
                                }}
                            />
                        )}
                        {(overlayStyle === 'B' || overlayStyle === 'AB') && (
                            <div
                                className="absolute inset-0 z-[1] pointer-events-none transition-all duration-700"
                                style={{ background: `rgba(0,0,0,${overlayStyle === 'AB' ? 0.2 : 0.45})`, mixBlendMode: 'multiply' }}
                            />
                        )}
                        {overlayStyle === 'default' && (
                            <div
                                className="absolute inset-0 z-[1] pointer-events-none transition-colors duration-1000"
                                style={{ background: 'rgba(0,0,0,0.3)' }}
                            />
                        )}
                    </>
                )
            ) : null}

            {wallpaperMode !== 'black' && (
                <div className="absolute inset-0 z-[2] pointer-events-none">
                    <div className={cn(
                        "absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.55)_100%)]",
                        performanceMode === 'lite' ? "opacity-55" : "opacity-80"
                    )} />
                    {mounted && performanceMode !== 'lite' && typeof window !== 'undefined' && window.innerWidth >= 768 && (
                        <div
                            className="absolute inset-0 opacity-15 md:opacity-20 mix-blend-normal md:mix-blend-overlay"
                            style={{ backgroundImage: `url('/images/stardust.webp')`, backgroundRepeat: 'repeat' }}
                        />
                    )}
                </div>
            )}

            {isGrayscale && wallpaperMode !== 'black' && (
                <div
                    className="absolute inset-0 z-[10] pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.85) 100%)',
                        mixBlendMode: 'multiply'
                    }}
                />
            )}
        </div>
    );
}
