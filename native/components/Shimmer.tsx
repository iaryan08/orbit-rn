import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    interpolate,
    LinearTransition
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface ShimmerProps {
    width: number | string;
    height: number;
    borderRadius?: number;
    style?: any;
}

export const Shimmer = ({ width, height, borderRadius = 8, style }: ShimmerProps) => {
    const shimmerProgress = useSharedValue(-1);

    useEffect(() => {
        shimmerProgress.value = withRepeat(
            withTiming(1.2, { duration: 1200 }),
            -1,
            false
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
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
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.08)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
});
