import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    Easing,
    FadeIn,
    cancelAnimation,
} from 'react-native-reanimated';
import { Typography } from '../constants/Theme';

interface PremiumTabLoaderProps {
    color?: string;
    message?: string;
    isActive?: boolean;
}

const LAYOUT_ANIM_INC = Platform.OS !== 'android' ? FadeIn.duration(400) : undefined;

/**
 * PremiumTabLoader: A highly optimized, low-resource loading indicator.
 * Uses Reanimated UI-thread animations for zero CPU overhead on the JS thread.
 */
export const PremiumTabLoader = ({
    color = '#f43f5e',
    message = 'Harmonizing Rhythm...',
    isActive = true,
}: PremiumTabLoaderProps) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.2);
    const rotation = useSharedValue(0);

    useEffect(() => {
        if (!isActive) {
            cancelAnimation(scale);
            cancelAnimation(opacity);
            cancelAnimation(rotation);
            return;
        }

        scale.value = withRepeat(
            withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
        opacity.value = withRepeat(
            withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
        rotation.value = withRepeat(
            withTiming(360, { duration: 8000, easing: Easing.linear }),
            -1,
            false
        );

        return () => {
            cancelAnimation(scale);
            cancelAnimation(opacity);
            cancelAnimation(rotation);
        };
    }, [isActive]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { rotate: `${rotation.value}deg` }
        ],
        opacity: opacity.value,
    }));

    return (
        <Animated.View entering={LAYOUT_ANIM_INC} style={styles.container}>
            <View style={styles.indicatorWrapper}>
                {/* Orbital Ring */}
                <Animated.View style={[styles.orbital, { borderColor: color }, pulseStyle]} />
                {/* Center Core */}
                <View style={[styles.core, { backgroundColor: color }]} />
            </View>
            <Text style={styles.text}>{message}</Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 280,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicatorWrapper: {
        width: 60,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    orbital: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    core: {
        width: 8,
        height: 8,
        borderRadius: 4,
        opacity: 0.8,
    },
    text: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
});
