import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing, useDerivedValue } from 'react-native-reanimated';
import { Canvas, ColorMatrix, Group, Skia, Image, useImage, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import { BlurView } from 'expo-blur';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { CelestialSky } from './background/CelestialSky';
import { getCycleDay } from '../lib/cycle';
import { Animations } from '../constants/Theme';

const AURA_MAP: Record<string, string> = {
    'Lavender': 'rgba(168, 85, 247, 0.12)',
    'Soft Teal': 'rgba(45, 212, 191, 0.10)',
    'Amber Glow': 'rgba(251, 191, 36, 0.12)',
    'Dusty Rose': 'rgba(251, 113, 133, 0.10)',
    'Midnight Blue': 'rgba(30, 64, 175, 0.12)'
};

const MATRIX_IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0
];

// Premium Monochrome: Professional Luma weights (0.21, 0.72, 0.07) + slight contrast lift
const MONOCHROME_MATRIX = [
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0, 0, 0, 1, 0
];

// Cinema Matrix: Teal & Orange production look, high contrast, warm highlights
const CINEMA_MATRIX = [
    1.25, 0, 0, 0, -0.1,
    0, 1.15, 0, 0, -0.1,
    0, 0, 1.35, 0, -0.05,
    0, 0, 0, 1, 0
];

// Obsidian Matrix: Deep crushed blacks, subtle indigo tint, high drama
const OBSIDIAN_MATRIX = [
    0.8, 0, 0, 0, -0.2,
    0, 0.8, 0, 0, -0.25,
    0, 0, 1.0, 0, -0.15,
    0, 0, 0, 1, 0
];

// Ethereal Matrix: Dreamy, desaturated, low contrast, soft pastel lift
const ETHEREAL_MATRIX = [
    0.85, 0.1, 0.05, 0, 0.1,
    0.1, 0.85, 0.05, 0, 0.1,
    0.05, 0.05, 0.9, 0, 0.15,
    0, 0, 0, 1, 0
];

interface DynamicBackgroundProps {
    isPaused?: boolean;
}

export function DynamicBackground({ isPaused = false }: DynamicBackgroundProps) {
    const { width, height } = useWindowDimensions();
    const { profile, partnerProfile, appMode, wallpaperConfig, idToken, intimacyForecast, isLiteMode } = useOrbitStore();
    const { mode, grayscale, aesthetic } = wallpaperConfig;
    const isLunara = appMode === 'lunara';
    const starColor = isLunara ? [200, 150, 255] : [255, 255, 255];

    const activeImageUrl = useMemo(() => {
        if (mode === 'custom') return profile?.custom_wallpaper_url;
        if (mode === 'shared') return partnerProfile?.custom_wallpaper_url;
        return null;
    }, [mode, profile?.custom_wallpaper_url, partnerProfile?.custom_wallpaper_url]);

    const fullUrl = useMemo(() =>
        activeImageUrl ? getPublicStorageUrl(activeImageUrl, 'wallpapers', idToken) : null,
        [activeImageUrl, idToken]);

    // Cross-fade State
    const [displayUrls, setDisplayUrls] = useState<{ current: string | null; previous: string | null }>({
        current: fullUrl,
        previous: null,
    });
    const transition = useSharedValue(fullUrl ? 1 : 0);
    const lastUrl = useRef(fullUrl);

    // Filter Animation Logic
    const filterLerp = useSharedValue(1);
    const targetMatrix = useRef(MATRIX_IDENTITY);
    const prevMatrix = useRef(MATRIX_IDENTITY);

    const currentMatrixArray = useMemo(() => {
        if (grayscale) return MONOCHROME_MATRIX;
        if (mode === 'stars') return MATRIX_IDENTITY;

        switch (aesthetic) {
            case 'Ethereal': return ETHEREAL_MATRIX;
            case 'Cinema': return CINEMA_MATRIX;
            case 'Obsidian': return OBSIDIAN_MATRIX;
            default: return MATRIX_IDENTITY;
        }
    }, [grayscale, mode, aesthetic]);

    useEffect(() => {
        if (fullUrl !== lastUrl.current) {
            if (!fullUrl) {
                transition.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });
            } else if (!lastUrl.current) {
                setDisplayUrls({ current: fullUrl, previous: null });
                transition.value = 0;
                transition.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
            } else {
                setDisplayUrls({ current: fullUrl, previous: lastUrl.current });
                transition.value = 0;
                transition.value = withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) });
            }
            lastUrl.current = fullUrl;
        }
    }, [fullUrl]);

    const currentStyle = useAnimatedStyle(() => ({
        opacity: transition.value,
        transform: [{ scale: (grayscale || isLiteMode) ? 1 : interpolate(transition.value, [0, 1], [1.08, 1]) }]
    }));

    const previousStyle = useAnimatedStyle(() => ({
        opacity: interpolate(transition.value, [0, 1], [1, 0]),
        transform: [{ scale: (grayscale || isLiteMode) ? 1 : interpolate(transition.value, [0, 1], [1, 1.05]) }]
    }));

    const monochromePaint = useMemo(() => {
        const p = Skia.Paint();
        p.setColorFilter(Skia.ColorFilter.MakeMatrix(MONOCHROME_MATRIX));
        return p;
    }, []);

    const auraTintLayer = useMemo(() => {
        if (!isLunara || !intimacyForecast?.length || grayscale) return null;
        const activeCycle = profile?.gender === 'female' ? profile : partnerProfile;
        if (!activeCycle?.last_period_start) return null;
        const day = getCycleDay(activeCycle.last_period_start);
        const card = intimacyForecast[day - 1];
        if (!card || !AURA_MAP[card.aura]) return null;
        return AURA_MAP[card.aura];
    }, [isLunara, intimacyForecast, profile, partnerProfile, grayscale]);

    // Zero-cost Filter Opacity Transitions
    const currentAestheticOpacity = useDerivedValue(() => {
        return withTiming(mode !== 'stars' ? 1 : 0, { duration: 400 });
    });

    const aestheticOverlayStyle = useAnimatedStyle(() => ({
        opacity: currentAestheticOpacity.value,
        backgroundColor: grayscale ? 'rgba(0,0,0,0.5)' :
            (aesthetic as string) === 'Solid' ? 'rgba(0,0,0,0.85)' :
                aesthetic === 'Obsidian' ? 'rgba(10, 5, 25, 0.58)' :
                    aesthetic === 'Cinema' ? 'rgba(25, 12, 0, 0.42)' :
                        aesthetic === 'Ethereal' ? 'rgba(255, 255, 255, 0.08)' :
                            'rgba(0,0,0,0.42)'
    }));

    const skImageCurrent = useImage(displayUrls.current);
    const skImagePrevious = useImage(displayUrls.previous);

    const renderWallpaperLayer = (skImage: any, style: any) => {
        if (!skImage || mode === 'stars') return null;
        return (
            <Animated.View style={[StyleSheet.absoluteFillObject, style]}>
                <Canvas style={StyleSheet.absoluteFillObject}>
                    <Group layer={grayscale ? monochromePaint : undefined}>
                        <Image
                            image={skImage}
                            x={0}
                            y={0}
                            width={width}
                            height={height}
                            fit="cover"
                        />
                    </Group>
                    {/* Romance-Style Vignette Overlay for Grayscale */}
                    {grayscale && (
                        <Fill>
                            <RadialGradient
                                c={vec(width / 2, height / 2)}
                                r={Math.max(width, height) * 0.98}
                                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                            />
                        </Fill>
                    )}
                </Canvas>
            </Animated.View>
        );
    };

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.bg]}>
            {/* Stars Layer */}
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
                speed={isPaused || grayscale ? 0 : (isLiteMode ? 0.25 : 0.8)}
                maxStars={grayscale ? 30 : (isLiteMode ? 40 : 80)}
            />

            {/* PREVIOUS Wallpaper Layer */}
            {skImagePrevious && renderWallpaperLayer(skImagePrevious, previousStyle)}

            {/* CURRENT Wallpaper Layer */}
            {skImageCurrent && renderWallpaperLayer(skImageCurrent, currentStyle)}

            {/* ZERO-COST OVERLAYS: Avoid overlapping filters when Monochrome is active */}
            {mode !== 'stars' && !grayscale && (
                <Animated.View
                    style={[StyleSheet.absoluteFillObject, aestheticOverlayStyle]}
                    pointerEvents="none"
                />
            )}

            {/* Aura Tint Layer */}
            {isLunara && auraTintLayer && (
                <View
                    style={[StyleSheet.absoluteFillObject, { backgroundColor: auraTintLayer, opacity: 0.2 }]}
                    pointerEvents="none"
                />
            )}

            {/* Global Readability Dimmers: Ensures white text/UI elements are always readable on bright wallpapers */}
            {mode !== 'stars' && (
                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(0,0,0,0.25)' } // Strong base dim for all wallpapers
                    ]}
                    pointerEvents="none"
                />
            )}

            {grayscale && (
                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(0,0,0,0.25)' } // Deeper wash for Monochrome/Bedtime readability
                    ]}
                    pointerEvents="none"
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    bg: {
        backgroundColor: '#000000',
    }
});
