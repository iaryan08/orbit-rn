import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { Canvas, ColorMatrix, Blur, Group, Fill } from '@shopify/react-native-skia';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { CelestialSky } from './background/CelestialSky';

const { width, height } = Dimensions.get('window');

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
    const { partnerProfile, appMode, wallpaperConfig, idToken } = useOrbitStore();
    const { mode, grayscale, filter } = wallpaperConfig;
    const isLunara = appMode === 'lunara';
    const starColor = isLunara ? [200, 150, 255] : [255, 255, 255];

    const activeImageUrl = mode === 'custom' ? useOrbitStore.getState().profile?.custom_wallpaper_url : (mode === 'shared' ? partnerProfile?.custom_wallpaper_url : null);
    const fullUrl = activeImageUrl ? getPublicStorageUrl(activeImageUrl, 'wallpapers', idToken) : null;

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

    return (
        <View style={[StyleSheet.absoluteFillObject, styles.solidBg]}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }, imageAnimatedStyle]}>
                {fullUrl && (
                    <ExpoImage
                        source={{ uri: fullUrl || undefined }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        transition={300} // Faster image fade
                        cachePolicy="memory-disk"
                    />
                )}
            </Animated.View>

            {/* Stars layer */}
            <CelestialSky
                partnerLat={partnerProfile?.latitude || partnerProfile?.location?.latitude}
                partnerLon={partnerProfile?.longitude || partnerProfile?.location?.longitude}
                starColor={starColor}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    solidBg: {
        backgroundColor: '#000000',
    }
});
