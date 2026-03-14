import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Canvas, Group, Skia, Image, useImage, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

const GRAYSCALE_MATRIX = [
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0, 0, 0, 1, 0
];

const IDENTITY_MATRIX = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0
];

const multiplyMatrices = (a: number[], b: number[]): number[] => {
    const to5 = (m: number[]) => ({
        m: [
            [m[0], m[1], m[2], m[3], m[4]],
            [m[5], m[6], m[7], m[8], m[9]],
            [m[10], m[11], m[12], m[13], m[14]],
            [m[15], m[16], m[17], m[18], m[19]],
            [0, 0, 0, 0, 1],
        ]
    });
    const A = to5(a).m;
    const B = to5(b).m;
    const R = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (let i = 0; i < 5; i += 1) {
        for (let j = 0; j < 5; j += 1) {
            let sum = 0;
            for (let k = 0; k < 5; k += 1) sum += A[i][k] * B[k][j];
            R[i][j] = sum;
        }
    }
    return [
        R[0][0], R[0][1], R[0][2], R[0][3], R[0][4],
        R[1][0], R[1][1], R[1][2], R[1][3], R[1][4],
        R[2][0], R[2][1], R[2][2], R[2][3], R[2][4],
        R[3][0], R[3][1], R[3][2], R[3][3], R[3][4],
    ];
};

const composeMatrices = (matrices: number[][]) =>
    matrices.reduce((acc, m) => multiplyMatrices(m, acc), IDENTITY_MATRIX);

const contrastMatrix = (c: number) => [
    c, 0, 0, 0, 0.5 * (1 - c),
    0, c, 0, 0, 0.5 * (1 - c),
    0, 0, c, 0, 0.5 * (1 - c),
    0, 0, 0, 1, 0,
];

const brightnessMatrix = (b: number) => [
    b, 0, 0, 0, 0,
    0, b, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
];

const saturationMatrix = (s: number) => {
    const ir = 0.2126;
    const ig = 0.7152;
    const ib = 0.0722;
    const a = (1 - s);
    return [
        ir * a + s, ig * a, ib * a, 0, 0,
        ir * a, ig * a + s, ib * a, 0, 0,
        ir * a, ig * a, ib * a + s, 0, 0,
        0, 0, 0, 1, 0
    ];
};

interface DynamicBackgroundProps {
    isPaused?: boolean;
}

export function DynamicBackground({ isPaused = false }: DynamicBackgroundProps) {
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const appMode = useOrbitStore(s => s.appMode);
    const wallpaperConfig = useOrbitStore(s => s.wallpaperConfig);
    const idToken = useOrbitStore(s => s.idToken);
    const intimacyForecast = useOrbitStore(s => s.intimacyForecast);
    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const isDebugMode = useOrbitStore(s => s.isDebugMode);
    const { width, height } = useWindowDimensions();
    const { mode, grayscale, aesthetic, overlayStyle } = wallpaperConfig;
    const isLunara = appMode === 'lunara';
    const starColor = isLunara ? [200, 150, 255] : [255, 255, 255];
    const isCustom = mode === 'custom' || mode === 'shared';

    const activeImageUrl = useMemo(() => {
        if (mode === 'custom') return profile?.custom_wallpaper_url;
        if (mode === 'shared') return partnerProfile?.custom_wallpaper_url || partnerProfile?.wallpaper_url;
        return null;
    }, [mode, profile?.custom_wallpaper_url, partnerProfile?.custom_wallpaper_url, partnerProfile?.wallpaper_url]);

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

    const filterPreset = useMemo(() => {
        if (grayscale) {
            return { overlay: 'rgba(0,0,0,0.45)', tint: 'rgba(0,0,0,0.12)' };
        }
        switch (aesthetic) {
            case 'Obsidian':
                return { overlay: 'rgba(0,0,0,0.6)', tint: 'rgba(10, 5, 25, 0.18)' };
            case 'Glass':
                return { overlay: 'rgba(0,0,0,0.35)', tint: 'rgba(120, 180, 255, 0.12)' };
            case 'Cinema':
                return { overlay: 'rgba(0,0,0,0.48)', tint: 'rgba(255, 160, 120, 0.12)' };
            case 'Natural':
            default:
                return { overlay: 'rgba(0,0,0,0.4)', tint: 'rgba(20, 35, 60, 0.1)' };
        }
    }, [aesthetic, grayscale]);

    const monoAdjust = useMemo(() => {
        if (!grayscale) return null;
        if (mode === 'shared') {
            return { opacity: 0.4, contrast: 1.15, brightness: 0.9 };
        }
        // custom or other
        return { opacity: 0.45, contrast: 1.15, brightness: 0.85 };
    }, [grayscale, mode]);

    const imageMatrix = useMemo(() => {
        const matrices: number[][] = [];
        if (grayscale) {
            matrices.push(GRAYSCALE_MATRIX);
            if (monoAdjust) {
                matrices.push(contrastMatrix(monoAdjust.contrast));
                matrices.push(brightnessMatrix(monoAdjust.brightness));
            }
        }

        const applyOverlayA = !grayscale && (overlayStyle === 'A' || overlayStyle === 'AB');
        if (applyOverlayA) {
            matrices.push(brightnessMatrix(0.42));
            matrices.push(contrastMatrix(1.12));
            matrices.push(saturationMatrix(0.85));
        }

        if (matrices.length === 0) return null;
        return composeMatrices(matrices);
    }, [grayscale, overlayStyle, monoAdjust]);

    const imagePaint = useMemo(() => {
        if (!imageMatrix) return null;
        const p = Skia.Paint();
        p.setColorFilter(Skia.ColorFilter.MakeMatrix(imageMatrix));
        return p;
    }, [imageMatrix]);

    const vibeTintLayer = useMemo(() => {
        if (!isLunara || !intimacyForecast?.length || grayscale) return null;
        const activeCycle = profile?.gender === 'female' ? profile : partnerProfile;
        if (!activeCycle?.last_period_start) return null;
        const day = getCycleDay(activeCycle.last_period_start);
        const card = intimacyForecast[day - 1];
        if (!card || !VIBE_MAP[card.vibe]) return null;
        return VIBE_MAP[card.vibe];
    }, [isLunara, intimacyForecast, profile, partnerProfile, grayscale]);

    const useSkiaWallpaper = grayscale;
    const shouldRenderWallpaperCanvas = !isPaused && useSkiaWallpaper && mode !== 'stars' && !!skImageCurrent;
    const shouldRenderExpoFallback = !isPaused && !!displayUrls.current && !useSkiaWallpaper;
    const showCelestialSky = !isLiteMode;
    const debugUrl = displayUrls.current || '';
    const debugForceImage = isDebugMode && !!displayUrls.current;

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.bg]}>
            {showCelestialSky && (
                <CelestialSky
                    userLat={profile?.latitude || profile?.location?.latitude}
                    userLon={profile?.longitude || profile?.location?.longitude}
                    partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                    partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                    starColor={starColor}
                    speed={0}
                    maxStars={grayscale ? 20 : (isLiteMode ? 10 : 50)}
                />
            )}

            {shouldRenderExpoFallback && (
                <ExpoImage
                    source={{ uri: displayUrls.current || undefined }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="disk"
                />
            )}

            {shouldRenderExpoFallback && (
                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFillObject,
                        styles.readabilityOverlay,
                        { backgroundColor: filterPreset.overlay }
                    ]}
                />
            )}

            {shouldRenderExpoFallback && filterPreset.tint && (
                <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFillObject, { backgroundColor: filterPreset.tint }]}
                />
            )}

            {shouldRenderExpoFallback && grayscale && (
                <>
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(0,0,0,0.75)', 'transparent']}
                        style={[StyleSheet.absoluteFillObject, styles.vignetteTop]}
                    />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['transparent', 'rgba(0,0,0,0.75)']}
                        style={[StyleSheet.absoluteFillObject, styles.vignetteBottom]}
                    />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(0,0,0,0.7)', 'transparent']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[StyleSheet.absoluteFillObject, styles.vignetteLeft]}
                    />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['transparent', 'rgba(0,0,0,0.7)']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={[StyleSheet.absoluteFillObject, styles.vignetteRight]}
                    />
                </>
            )}

            {shouldRenderWallpaperCanvas && (
                <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    {skImageCurrent && (
                        <Group
                            opacity={monoAdjust?.opacity || 0.3}
                            transform={[{ scale: 1.05 }]}
                            origin={vec(width / 2, height / 2)}
                            layer={imagePaint || undefined}
                        >
                            <Image
                                image={skImageCurrent}
                                x={0} y={0} width={width} height={height}
                                fit="cover"
                            />
                        </Group>
                    )}

                    {grayscale && (
                        <>
                            <Group blendMode="multiply">
                                <Fill color="rgba(0,0,0,0.28)" />
                            </Group>
                            <Group blendMode="multiply">
                                <Fill>
                                    <RadialGradient
                                        c={vec(width / 2, height / 2)}
                                        r={Math.max(width, height)}
                                        colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.65)']}
                                        positions={[0.0, 0.55, 1]}
                                    />
                                </Fill>
                            </Group>
                        </>
                    )}
                </Canvas>
            )}

            {debugForceImage && (
                <ExpoImage
                    source={{ uri: displayUrls.current || undefined }}
                    style={[StyleSheet.absoluteFillObject, styles.debugImage]}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="disk"
                />
            )}

            {isDebugMode && (
                <View style={styles.debugOverlay} pointerEvents="none">
                    <Text style={styles.debugText}>mode: {mode}</Text>
                    <Text style={styles.debugText}>url: {debugUrl ? 'set' : 'empty'}</Text>
                    <Text style={styles.debugText}>skia: {skImageCurrent ? 'ok' : 'none'}</Text>
                    <Text style={styles.debugText}>expo: {shouldRenderExpoFallback ? 'on' : 'off'}</Text>
                    <Text style={styles.debugText}>gray: {grayscale ? 'on' : 'off'}</Text>
                    <Text style={styles.debugText}>filter: {aesthetic}</Text>
                    <Text style={styles.debugText}>overlay: {overlayStyle}</Text>
                </View>
            )}
            {!isDebugMode && (
                <Pressable
                    style={styles.debugToggle}
                    onLongPress={() => useOrbitStore.getState().toggleDebugMode()}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    bg: {
        backgroundColor: '#000000',
        zIndex: 0,
    },
    debugOverlay: {
        position: 'absolute',
        top: 8,
        left: 8,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 6,
        zIndex: 10,
    },
    debugText: {
        color: 'white',
        fontSize: 14,
    }
    ,
    debugImage: {
        opacity: 1,
        zIndex: 9,
    },
    readabilityOverlay: {
        zIndex: 2,
    },
    debugToggle: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 80,
        height: 80,
        zIndex: 20,
    }
    ,
    vignetteTop: {
        height: '35%',
        top: 0,
    },
    vignetteBottom: {
        height: '40%',
        bottom: 0,
    },
    vignetteLeft: {
        width: '30%',
        left: 0,
    },
    vignetteRight: {
        width: '30%',
        right: 0,
    }
});
