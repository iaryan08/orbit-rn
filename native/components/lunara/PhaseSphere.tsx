import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Canvas, Group, Circle, Mask, Rect, LinearGradient, RadialGradient, vec, Blur, Shadow, BoxShadow, Fill, mix } from '@shopify/react-native-skia';
import Animated, { useSharedValue, withRepeat, withTiming, Easing, useDerivedValue, interpolateColor } from 'react-native-reanimated';
import { useOrbitStore } from '../../lib/store';

const { width } = Dimensions.get('window');
const SPHERE_SIZE = width * 0.7;

interface PhaseSphereProps {
    phase: string; // 'Menstrual' | 'Follicular' | 'Ovulatory' | 'Luteal'
    intensity?: number; // 0 to 1
    isActive?: boolean;
}

export const PhaseSphere = React.memo(({ phase, intensity = 0.5, isActive = true }: PhaseSphereProps) => {
    const { isLiteMode } = useOrbitStore();
    const pulse = useSharedValue(0);
    const rotation = useSharedValue(0);

    useEffect(() => {
        if (isLiteMode || !isActive) {
            pulse.value = 0.5; // Static mid-state
            rotation.value = 0;
            return;
        }

        pulse.value = withRepeat(
            withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
        rotation.value = withRepeat(
            withTiming(1, { duration: 10000, easing: Easing.linear }),
            -1,
            false
        );

        return () => {
            // Cleanup on unmount/inactive
            pulse.value = 0.5;
            rotation.value = 0;
        };
    }, [isLiteMode, isActive]);

    const colors = useMemo(() => {
        switch (phase) {
            case 'Menstrual':
                return { primary: '#6d28d9', secondary: '#4c1d95', glow: '#a78bfa', halo: 'rgba(109, 40, 217, 0.2)' };
            case 'Follicular':
                return { primary: '#0d9488', secondary: '#0f766e', glow: '#2dd4bf', halo: 'rgba(13, 148, 136, 0.2)' };
            case 'Ovulatory':
                return { primary: '#d97706', secondary: '#b45309', glow: '#fbbf24', halo: 'rgba(217, 119, 6, 0.3)' };
            case 'Luteal':
                return { primary: '#be123c', secondary: '#9f1239', glow: '#fb7185', halo: 'rgba(190, 18, 60, 0.2)' };
            default:
                return { primary: '#4b5563', secondary: '#374151', glow: '#9ca3af', halo: 'rgba(75, 85, 99, 0.1)' };
        }
    }, [phase]);

    // Derived values for Skia
    const innerPulse = useDerivedValue(() => 0.95 + pulse.value * 0.05);
    const glowOpacity = useDerivedValue(() => 0.3 + pulse.value * 0.4);

    // Lite Mode or Inactive: COMPLETELY bypass Skia to preserve RAM and GPU
    if (isLiteMode || !isActive) {
        return (
            <View style={styles.container}>
                <View style={{
                    width: SPHERE_SIZE,
                    height: SPHERE_SIZE,
                    borderRadius: SPHERE_SIZE / 2,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: colors.glow,
                    shadowColor: colors.glow,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 20,
                    elevation: 10,
                }} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Canvas style={{ width: width, height: width }}>
                {/* External Halo Glow - 100% Hardware Safe (No Blur) */}
                <Circle cx={width / 2} cy={width / 2} r={SPHERE_SIZE / 1.3}>
                    <RadialGradient
                        c={vec(width / 2, width / 2)}
                        r={SPHERE_SIZE / 1.3}
                        colors={[colors.halo, 'transparent']}
                    />
                </Circle>

                <Group origin={vec(width / 2, width / 2)}>
                    {/* Glow Effect (Replaces Blur to fix OnePlus Nord 5 square bug) */}
                    <Circle cx={width / 2} cy={width / 2} r={(SPHERE_SIZE / 2 + 30) * innerPulse.value}>
                        <RadialGradient
                            c={vec(width / 2, width / 2)}
                            r={(SPHERE_SIZE / 2 + 30) * innerPulse.value}
                            colors={[colors.glow, 'transparent']}
                        />
                    </Circle>

                    {/* Main Sphere Body */}
                    <Circle cx={width / 2} cy={width / 2} r={(SPHERE_SIZE / 2) * innerPulse.value}>
                        <LinearGradient
                            start={vec(width / 2 - SPHERE_SIZE / 2, width / 2 - SPHERE_SIZE / 2)}
                            end={vec(width / 2 + SPHERE_SIZE / 2, width / 2 + SPHERE_SIZE / 2)}
                            colors={[colors.primary, colors.secondary]}
                        />
                    </Circle>

                    {/* Glossy Overlay - Radial fallback */}
                    <Circle cx={width / 2 - 15} cy={width / 2 - 15} r={SPHERE_SIZE / 3}>
                        <RadialGradient
                            c={vec(width / 2 - 15, width / 2 - 15)}
                            r={SPHERE_SIZE / 3}
                            colors={['rgba(255,255,255,0.25)', 'transparent']}
                        />
                    </Circle>
                </Group>
            </Canvas>

        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 20,
    },
});
