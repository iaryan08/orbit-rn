import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';
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
    const { profile, partnerProfile, appMode, wallpaperConfig, idToken, intimacyForecast, isLiteMode } = useOrbitStore();
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

    const previousOpacity = useDerivedValue(() => 1 - transition.value);

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

    const overlayColor = useMemo(() => {
        if (grayscale) return 'rgba(0,0,0,0.6)';
        if ((aesthetic as string) === 'Solid') return '#000000';
        if (aesthetic === 'Obsidian') return 'rgba(10, 5, 25, 0.72)';
        if (aesthetic === 'Cinema') return 'rgba(25, 12, 0, 0.42)';
        if (aesthetic === 'Ethereal') return 'rgba(255, 255, 255, 0.08)';
        return 'rgba(0,0,0,0.08)';
    }, [grayscale, aesthetic]);

    const shouldRenderWallpaperCanvas = mode !== 'stars' && (!!skImageCurrent || !!skImagePrevious || !!vibeTintLayer);

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.bg]}>
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
                speed={0}
                maxStars={grayscale ? 20 : (isLiteMode ? 10 : 50)}
            />

            {shouldRenderWallpaperCanvas && (
                <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    {skImagePrevious && (
                        <Group
                            opacity={previousOpacity}
                            transform={[{ scale: 1.05 }]}
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

                    {skImageCurrent && (
                        <Group
                            opacity={transition.value}
                            transform={[{ scale: 1.05 }]}
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

                    <Group>
                        <Fill color={overlayColor} />
                        <Fill>
                            <RadialGradient
                                c={vec(width / 2, height / 2)}
                                r={Math.max(width, height) * 1.2}
                                colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.75)']}
                                positions={[0.3, 0.6, 1]}
                            />
                        </Fill>
                    </Group>

                    {isLunara && vibeTintLayer && (
                        <Fill color={vibeTintLayer} opacity={0.15} />
                    )}

                    <Fill color="rgba(0,0,0,0.05)" />
                </Canvas>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    bg: {
        backgroundColor: '#000000',
    }
});
