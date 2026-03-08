import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { Canvas, ColorMatrix, Blur, Group, Fill } from '@shopify/react-native-skia';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { CelestialSky } from './background/CelestialSky';

import { getCycleDay } from '../lib/cycle';

const { width, height } = Dimensions.get('window');

const AURA_MAP: Record<string, string> = {
    'Lavender': 'rgba(168, 85, 247, 0.15)',
    'Soft Teal': 'rgba(45, 212, 191, 0.12)',
    'Amber Glow': 'rgba(251, 191, 36, 0.15)',
    'Dusty Rose': 'rgba(251, 113, 133, 0.12)',
    'Midnight Blue': 'rgba(30, 64, 175, 0.15)'
};

// Color Matrices for Atmosphere Filters
const MONOCHROME_MATRIX = [
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0.2126, 0.7152, 0.0722, 0, 0,
    0, 0, 0, 1, 0
];

const TINT_MATRIX = [
    1.2, 0, 0, 0, 0.1,
    0, 1.0, 0, 0, 0,
    0, 0, 1.1, 0, 0.05,
    0, 0, 0, 1, 0
];

const PRO_MATRIX = [
    1.3, 0, 0, 0, -0.1,
    0, 1.3, 0, 0, -0.1,
    0, 0, 1.3, 0, -0.1,
    0, 0, 0, 1, 0
];

interface DynamicBackgroundProps {
    mode?: 'stars' | 'custom' | 'shared' | 'theme';
    customImageUrl?: string | null;
    partnerImageUrl?: string | null;
    idToken?: string | null;
    isGrayscale?: boolean;
    filter?: 'Natural' | 'Glass' | 'Tint' | 'Pro';
    isPaused?: boolean;
}

export const DynamicBackground = React.memo(({
    isPaused = false
}: DynamicBackgroundProps) => {
    const { profile, partnerProfile, appMode, wallpaperConfig, idToken, intimacyForecast, isLiteMode } = useOrbitStore();
    const { mode, grayscale, filter } = wallpaperConfig;
    const isLunara = appMode === 'lunara';
    const starColor = isLunara ? [200, 150, 255] : [255, 255, 255];

    const activeImageUrl = mode === 'custom' ? profile?.custom_wallpaper_url : (mode === 'shared' ? partnerProfile?.custom_wallpaper_url : null);
    const fullUrl = activeImageUrl ? getPublicStorageUrl(activeImageUrl, 'wallpapers', idToken) : null;

    // Aura Sync Logic - Tints the background based on the intimacy forecast card
    const auraTint = useMemo(() => {
        if (!isLunara || !intimacyForecast || !intimacyForecast.length) return 'transparent';

        // Atmosphere follows the woman's cycle
        const activeCycle = profile?.gender === 'female' ? profile : partnerProfile;
        if (!activeCycle?.last_period_start) return 'transparent';

        const day = getCycleDay(activeCycle.last_period_start);
        const card = intimacyForecast[day - 1];
        return card ? (AURA_MAP[card.aura] || 'transparent') : 'transparent';
    }, [isLunara, intimacyForecast, profile, partnerProfile]);

    // Animation values - 300ms for a faster "snappy" feel
    const transitionConfig = { duration: 300, easing: Easing.out(Easing.exp) };
    const imageOpacity = useSharedValue(mode === 'stars' ? 0 : 1);
    const filterOpacity = useSharedValue(mode === 'stars' ? 0 : (grayscale ? 0.85 : 0.4));

    useEffect(() => {
        if (mode === 'custom' || mode === 'shared') {
            imageOpacity.value = withTiming(1, transitionConfig);
            filterOpacity.value = withTiming(grayscale ? 0.85 : 0.4, transitionConfig);
        } else {
            imageOpacity.value = withTiming(0, transitionConfig);
            filterOpacity.value = withTiming(0, transitionConfig);
        }
    }, [mode, grayscale]);

    const imageAnimatedStyle = useAnimatedStyle(() => ({
        opacity: imageOpacity.value,
    }));

    const fillColor = useDerivedValue(() => `rgba(0,0,0,${filterOpacity.value * 0.5})`);

    const matrix = useMemo(() => {
        if (grayscale) return MONOCHROME_MATRIX;
        if (filter === 'Tint') return TINT_MATRIX;
        if (filter === 'Pro') return PRO_MATRIX;
        return null;
    }, [grayscale, filter]);

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.solidBg]}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }, imageAnimatedStyle]}>
                {fullUrl && (
                    <ExpoImage
                        source={{ uri: fullUrl || undefined }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        transition={600} // Smoother image fade
                        cachePolicy="memory-disk"
                    />
                )}

                {/* Visual Filters using Skia */}
                <Canvas style={StyleSheet.absoluteFillObject}>
                    <Group>
                        {matrix ? <ColorMatrix matrix={matrix} /> : null}
                        {filter === 'Glass' ? <Blur blur={10} /> : null}
                        <Fill color={auraTint} />
                        <Fill color={fillColor} />
                    </Group>
                </Canvas>
            </Animated.View>

            {/* Stars layer - static or moving depending on isPaused */}
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
                speed={isPaused ? 0 : 1}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    solidBg: {
        backgroundColor: '#000000',
    }
});
