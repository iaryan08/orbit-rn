import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G, ForeignObject } from 'react-native-svg';
import Animated, { useAnimatedProps, withSpring, useSharedValue } from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface LibidoMeterProps {
    level: 'low' | 'medium' | 'high' | 'very_high' | string | null;
    compact?: boolean;
}

const levels = ['low', 'medium', 'high', 'very_high'];

export function LibidoMeter({ level, compact = false }: LibidoMeterProps) {
    const rotation = useSharedValue(-90);

    const getAngle = (l: string | null) => {
        switch (l) {
            case 'low': return -80;
            case 'medium': return -20;
            case 'high': return 30;
            case 'very_high': return 80;
            default: return -80; // Default to lowest edge to prevent dipping below the line
        }
    };

    const getColor = (l: string | null) => {
        switch (l) {
            case 'low': return "#22c55e";
            case 'medium': return "#eab308";
            case 'high': return "#f97316";
            case 'very_high': return "#ef4444";
            default: return "#22c55e";
        }
    };

    useEffect(() => {
        rotation.value = withSpring(getAngle(level), { stiffness: 45, damping: 12 });
    }, [level]);

    const activeColor = getColor(level);
    const isVeryHigh = level === 'very_high';

    const CX = 100;
    const CY = 100;

    const needleAnimatedProps = useAnimatedProps(() => {
        return {
            transform: [
                { translateX: CX },
                { translateY: CY },
                { rotate: `${rotation.value}deg` }
            ] as any,
        };
    });

    return (
        <View style={[styles.container, compact && { aspectRatio: 3, paddingTop: 4 }]}>
            <Svg viewBox="0 0 200 110" style={styles.svg}>
                <Defs>
                    <LinearGradient id="meterGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#22c55e" />
                        <Stop offset="50%" stopColor="#eab308" />
                        <Stop offset="100%" stopColor="#ef4444" />
                    </LinearGradient>
                </Defs>

                {/* Base Arc */}
                <Path
                    d={`M 20 ${CY} A 80 80 0 0 1 180 ${CY}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="10"
                    strokeLinecap="round"
                />

                {/* Gradient Arc */}
                <Path
                    d={`M 20 ${CY} A 80 80 0 0 1 180 ${CY}`}
                    fill="none"
                    stroke="url(#meterGradient)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    opacity={0.9}
                />

                <AnimatedG animatedProps={needleAnimatedProps}>
                    <Path
                        d="M -3 0 L 0 -75 L 3 0 Z"
                        fill={activeColor}
                    />

                    {/* Pivot Hub */}
                    <Circle cx="0" cy="0" r="7.5" fill="#1a1a1a" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />

                    {isVeryHigh ? (
                        <G transform="translate(-8, -9)">
                            <Flame size={16} color="#ef4444" fill="#ef4444" />
                        </G>
                    ) : (
                        <G>
                            <Circle cx="0" cy="0" r="4" fill={activeColor} />
                            <Circle cx="0" cy="0" r="1.5" fill="#1a1a1a" />
                        </G>
                    )}
                </AnimatedG>
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        aspectRatio: 2,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingTop: 12,
    },
    svg: {
        width: '100%',
        height: '100%',
    }
});
