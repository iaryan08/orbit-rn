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

    const currentAestheticOpacity = useDerivedValue(() => {
        return withTiming(mode !== 'stars' ? 1 : 0, { duration: 100 });
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
                </Canvas>
            </Animated.View>
        );
    };

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.bg]}>
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
                speed={isPaused || grayscale ? 0 : (isLiteMode ? 0.25 : 0.8)}
                maxStars={grayscale ? 30 : (isLiteMode ? 40 : 80)}
            />

            {skImagePrevious && renderWallpaperLayer(skImagePrevious, previousStyle)}
            {skImageCurrent && renderWallpaperLayer(skImageCurrent, currentStyle)}

            {mode !== 'stars' && !grayscale && (
                <Animated.View
                    style={[StyleSheet.absoluteFillObject, aestheticOverlayStyle]}
                    pointerEvents="none"
                />
            )}

            {/* Premium Monochrome Vignette */}
            {grayscale && (
                <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    <Fill>
                        <RadialGradient
                            c={vec(width / 2, height / 2)}
                            r={Math.max(width, height) * 1.1}
                            colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.95)']}
                            positions={[0.2, 0.5, 1]}
                        />
                    </Fill>
                </Canvas>
            )}

            {isLunara && vibeTintLayer && (
                <View
                    style={[StyleSheet.absoluteFillObject, { backgroundColor: vibeTintLayer, opacity: 0.2 }]}
                    pointerEvents="none"
                />
            )}

            {grayscale && (
                <View
                    style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
                    pointerEvents="none"
                />
            )}

            {mode !== 'stars' && !grayscale && (
                <View
                    style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(0,0,0,0.25)' }
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
