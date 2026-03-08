import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
    Canvas,
    LinearGradient,
    vec,
    RoundedRect,
} from '@shopify/react-native-skia';
import {
    useSharedValue,
    withRepeat,
    withTiming,
    useDerivedValue,
} from 'react-native-reanimated';

interface GlitterPillProps {
    color: string;
    isLunara?: boolean;
}

const CANVAS_SIZE = 40;

export const GlitterPill = React.memo(({ isLunara }: GlitterPillProps) => {
    const shimmer = useSharedValue(0);
    React.useEffect(() => {
        shimmer.value = withRepeat(withTiming(1, { duration: 3000 }), -1, false);
    }, []);

    const shimmerPos = useDerivedValue(() => {
        return (shimmer.value * 120) - 40;
    });

    const gradientColors = isLunara
        ? ['#a855f7', '#7c3aed', '#6366f1']
        : ['#f43f5e', '#e11d48', '#be123c'];

    return (
        <View style={styles.container}>
            <Canvas style={styles.canvas}>
                {/* Main Pill */}
                <RoundedRect
                    x={0}
                    y={0}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    r={CANVAS_SIZE / 2}
                >
                    <LinearGradient
                        start={vec(0, 0)}
                        end={vec(CANVAS_SIZE, CANVAS_SIZE)}
                        colors={gradientColors}
                    />
                </RoundedRect>

                {/* Subtle Metallic Sweep */}
                <RoundedRect
                    x={0}
                    y={0}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    r={CANVAS_SIZE / 2}
                >
                    <LinearGradient
                        start={useDerivedValue(() => vec(shimmerPos.value, 0))}
                        end={useDerivedValue(() => vec(shimmerPos.value + 40, 40))}
                        colors={[
                            'rgba(255,255,255,0)',
                            'rgba(255,255,255,0.12)',
                            'rgba(255,255,255,0)'
                        ]}
                        positions={[0, 0.5, 1]}
                    />
                </RoundedRect>
            </Canvas>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
    },
    canvas: {
        flex: 1,
    },
});
