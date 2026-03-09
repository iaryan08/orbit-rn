import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G, ForeignObject } from 'react-native-svg';
import Animated, { useAnimatedProps, withSpring, useSharedValue } from 'react-native-reanimated';
import { Flame } from 'lucide-react-native';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface LibidoMeterProps {
    level: 'low' | 'medium' | 'high' | 'very_high' | string | null;
}

const levels = ['low', 'medium', 'high', 'very_high'];

export function LibidoMeter({ level }: LibidoMeterProps) {
    const rotation = useSharedValue(-88);

    const getAngle = (l: string | null) => {
        switch (l) {
            case 'low': return -88;
            case 'medium': return -30;
            case 'high': return 30;
            case 'very_high': return 88;
            default: return -30;
        }
    };

    const getColor = (l: string | null) => {
        switch (l) {
            case 'low': return "#22c55e";
            case 'medium': return "#eab308";
            case 'high': return "#f97316";
            case 'very_high': return "#ef4444";
            default: return "#eab308";
        }
    };

    useEffect(() => {
        rotation.value = withSpring(getAngle(level), { stiffness: 45, damping: 12 });
    }, [level]);

    const activeColor = getColor(level);
    const isVeryHigh = level === 'very_high';

    const CX = 100;
    const CY = 108;

    const needleAnimatedProps = useAnimatedProps(() => ({
        transform: [{ rotate: `${rotation.value}deg` }]
    }));

    return (
        <View style={styles.container}>
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

                <G transform={`translate(${CX}, ${CY})`}>
                    <AnimatedG animatedProps={needleAnimatedProps}>
                        <Path
                            d="M -4 0 L 0 -90 L 4 0 Z"
                            fill={activeColor}
                        />
                    </AnimatedG>

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
                </G>
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
