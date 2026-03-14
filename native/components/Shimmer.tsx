import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    interpolate,
    cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useOrbitStore } from '../lib/store';

interface ShimmerProps {
    width: number | string;
    height: number;
    borderRadius?: number;
    style?: any;
}

export const Shimmer = ({ width, height, borderRadius = 8, style, isActive = true }: ShimmerProps & { isActive?: boolean }) => {
    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const shimmerProgress = useSharedValue(-1);

    useEffect(() => {
        if (isLiteMode || !isActive) {
            cancelAnimation(shimmerProgress);
            shimmerProgress.value = -1;
            return;
        }

        shimmerProgress.value = withRepeat(
            withTiming(1.2, { duration: 1200 }),
            -1,
            false
        );

        return () => { cancelAnimation(shimmerProgress); };
    }, [isLiteMode, isActive]);

    const animatedStyle = useAnimatedStyle(() => {
        if (isLiteMode) return { opacity: 0 };

        const translateX = interpolate(
            shimmerProgress.value,
            [-1, 1.2],
            [-200, 200]
        );
        return {
            transform: [{ translateX }],
        };
    });

    return (
        <View
            style={[
                styles.container,
                { width, height, borderRadius, overflow: 'hidden' },
                style,
            ]}
        >
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
            {!isLiteMode && (
                <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
                    <LinearGradient
                        colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                    />
                </Animated.View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
});
