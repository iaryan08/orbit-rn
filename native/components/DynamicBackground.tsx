import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Easing,
    useDerivedValue,
    Extrapolate
} from 'react-native-reanimated';
import { Canvas, Group, Skia, Image, useImage, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { CelestialSky } from './background/CelestialSky';
import { getCycleDay } from '../lib/cycle';

const VIBE_MAP: Record<string, string> = {
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

const MONOCHROME_MATRIX = [
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0, 0, 0, 1, 0
];

interface DynamicBackgroundProps {
    isPaused?: boolean;
}

export function DynamicBackground({ isPaused = false }: DynamicBackgroundProps) {
    const { scrollOffset, profile, partnerProfile, appMode, wallpaperConfig, idToken, intimacyForecast, isLiteMode } = useOrbitStore();
    const { width, height } = useWindowDimensions();
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

    useEffect(() => {
        if (fullUrl !== lastUrl.current) {
            if (!fullUrl) {
                transition.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });
                setDisplayUrls({ current: null, previous: lastUrl.current });
            } else if (!lastUrl.current) {
                setDisplayUrls({ current: fullUrl, previous: null });
            } else {
                setDisplayUrls({ current: fullUrl, previous: lastUrl.current });
                transition.value = 0;
            }
            lastUrl.current = fullUrl;
        }
    }, [fullUrl]);

    const skImageCurrent = useImage(displayUrls.current);
    const skImagePrevious = useImage(displayUrls.previous);

    // Sync transition with Skia image readiness to prevent blinking
    useEffect(() => {
        if (skImageCurrent && displayUrls.current) {
            transition.value = withTiming(1, { duration: 400, easing: Easing.inOut(Easing.quad) });
        }
    }, [skImageCurrent, displayUrls.current]);

    const currentStyle = useAnimatedStyle(() => {
        const parallaxY = interpolate(scrollOffset?.value || 0, [0, 800], [0, -30], Extrapolate.CLAMP);
        return {
            opacity: transition.value,
            transform: [
                { scale: (grayscale || isLiteMode) ? 1.05 : interpolate(transition.value, [0, 1], [1.1, 1.05]) },
                { translateY: parallaxY }
            ]
        };
    });

    const previousStyle = useAnimatedStyle(() => {
        const parallaxY = interpolate(scrollOffset?.value || 0, [0, 800], [0, -30], Extrapolate.CLAMP);
        return {
            opacity: interpolate(transition.value, [0, 1], [1, 0]),
            transform: [
                { scale: (grayscale || isLiteMode) ? 1.05 : interpolate(transition.value, [0, 1], [1.05, 1.1]) },
                { translateY: parallaxY }
            ]
        };
    });

    // Unified Skia Parallax & Transition
    const parallaxY = useDerivedValue(() => {
        return interpolate(scrollOffset?.value || 0, [0, 800], [0, -30], Extrapolate.CLAMP);
    });

    const currentImgScale = useDerivedValue(() => {
        if (grayscale || isLiteMode) return 1.05;
        return interpolate(transition.value, [0, 1], [1.1, 1.05]);
    });

    const previousImgScale = useDerivedValue(() => {
        if (grayscale || isLiteMode) return 1.05;
        return interpolate(transition.value, [0, 1], [1.05, 1.1]);
    });

    const monochromePaint = useMemo(() => {
        const p = Skia.Paint();
        p.setColorFilter(Skia.ColorFilter.MakeMatrix(MONOCHROME_MATRIX));
        return p;
    }, []);

    const vibeTintLayer = useMemo(() => {
        if (!isLunara || !intimacyForecast?.length || grayscale) return null;
        const activeCycle = profile?.gender === 'female' ? profile : partnerProfile;
        if (!activeCycle?.last_period_start) return null;
        const day = getCycleDay(activeCycle.last_period_start);
        const card = intimacyForecast[day - 1];
        if (!card || !VIBE_MAP[card.vibe]) return null;
        return VIBE_MAP[card.vibe];
    }, [isLunara, intimacyForecast, profile, partnerProfile, grayscale]);

    const overlayOpacity = useDerivedValue(() => {
        return withTiming(mode !== 'stars' ? 1 : 0, { duration: 100 });
    });

    const overlayColor = useMemo(() => {
        if (grayscale) return 'rgba(0,0,0,0.6)';
        if ((aesthetic as string) === 'Solid') return '#000000';
        if (aesthetic === 'Obsidian') return 'rgba(10, 5, 25, 0.72)';
        if (aesthetic === 'Cinema') return 'rgba(25, 12, 0, 0.42)';
        if (aesthetic === 'Ethereal') return 'rgba(255, 255, 255, 0.08)';
        return 'rgba(0,0,0,0.08)';
    }, [grayscale, aesthetic]);

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.bg]}>
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
                speed={isPaused || grayscale || isLiteMode || (scrollOffset?.value || 0) > 400 ? 0 : 0.8}
                maxStars={grayscale ? 20 : (isLiteMode ? 10 : 50)}
            />

            <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
                {/* Previous Image Layer */}
                {skImagePrevious && mode !== 'stars' && (
                    <Group
                        opacity={interpolate(transition.value, [0, 1], [1, 0])}
                        transform={[{ translateY: parallaxY.value }, { scale: previousImgScale.value }]}
                        origin={vec(width / 2, height / 2)}
                        layer={grayscale ? monochromePaint : undefined}
                    >
                        <Image
                            image={skImagePrevious}
                            x={0} y={0} width={width} height={height}
                            fit="cover"
                        />
                    </Group>
                )}

                {/* Current Image Layer */}
                {skImageCurrent && mode !== 'stars' && (
                    <Group
                        opacity={transition.value}
                        transform={[{ translateY: parallaxY.value }, { scale: currentImgScale.value }]}
                        origin={vec(width / 2, height / 2)}
                        layer={grayscale ? monochromePaint : undefined}
                    >
                        <Image
                            image={skImageCurrent}
                            x={0} y={0} width={width} height={height}
                            fit="cover"
                        />
                    </Group>
                )}

                {/* Unified Tint & Vignette Layer */}
                <Group opacity={overlayOpacity.value}>
                    <Fill color={overlayColor} />

                    {/* Persistent Readability Vignette (Top & Edge Darkening for Status Bar) */}
                    <Fill>
                        <RadialGradient
                            c={vec(width / 2, height / 2)}
                            r={Math.max(width, height) * 1.2}
                            colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)']}
                            positions={[0.3, 0.6, 1]}
                        />
                    </Fill>
                </Group>

                {/* Partner Vibe Overlays (Computed in-canvas) */}
                {isLunara && vibeTintLayer && (
                    <Fill color={vibeTintLayer} opacity={0.15} />
                )}

                {/* Final Pass Safety Darkening for White Wallpapers */}
                {mode !== 'stars' && (
                    <Fill color="rgba(0,0,0,0.05)" />
                )}
            </Canvas>
        </View>
    );
}

const styles = StyleSheet.create({
    bg: {
        backgroundColor: '#000000',
    }
});
