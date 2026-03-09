import React, { useMemo, useEffect } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, withTiming, withRepeat, withSequence, useAnimatedStyle, SharedValue, useAnimatedProps } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { BRIGHT_STARS } from '../../lib/astronomy/stars';

interface CelestialSkyProps {
    userLat?: number;
    userLon?: number;
    partnerLat?: number;
    partnerLon?: number;
    starColor?: number[]; // [r, g, b]
    speed?: number;
    maxStars?: number;
}

const { width, height } = Dimensions.get('window');

/**
 * Premium Celestial Sky for Redmi 12.
 * Uses crisp SVG circles and Reanimated for smooth atmosphere morphs.
 */
interface StarProps {
    star: any;
    starColor: number[];
}

const Star = React.memo(({ star, starColor, shimmer }: { star: any, starColor: number[], shimmer: SharedValue<number> }) => {
    const animatedProps = useAnimatedProps(() => ({
        opacity: star.opacity * (0.6 + shimmer.value * 0.4),
    }));

    return (
        <AnimatedCircle
            cx={star.x}
            cy={star.y}
            r={star.size * 0.5}
            fill={`rgba(${starColor[0]}, ${starColor[1]}, ${starColor[2]}, 1)`}
            animatedProps={animatedProps}
        />
    );
});

export function CelestialSky({
    partnerLat,
    partnerLon,
    starColor = [255, 255, 255],
    speed = 1,
    maxStars = 80
}: CelestialSkyProps) {
    const shimmer = useSharedValue(0.5);

    useEffect(() => {
        if (speed > 0) {
            shimmer.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 2000 }),
                    withTiming(0.2, { duration: 3000 })
                ),
                -1,
                true
            );
        } else {
            shimmer.value = withTiming(0.8);
        }
    }, [speed]);

    const stars = useMemo(() => {
        if (!Number.isFinite(partnerLat) || !Number.isFinite(partnerLon)) {
            return [];
        }
        const skyLat = partnerLat!;
        const skyLon = partnerLon!;
        const now = new Date();
        const JD = now.getTime() / 86400000 + 2440587.5;
        const D = JD - 2451545.0;

        let GMST = (18.697374558 + 24.06570982441908 * D) % 24;
        if (GMST < 0) GMST += 24;

        let LST = (GMST + skyLon / 15) % 24;
        if (LST < 0) LST += 24;

        const phi = skyLat * (Math.PI / 180);
        const lstRad = LST * 15 * (Math.PI / 180);

        const starsToRender = BRIGHT_STARS.slice(0, maxStars);
        const visibleStars: any[] = [];

        starsToRender.forEach(([ra, dec, mag], index) => {
            const raRad = ra * 15 * (Math.PI / 180);
            const decRad = dec * (Math.PI / 180);
            const ha = lstRad - raRad;

            const sinH = Math.sin(phi) * Math.sin(decRad) + Math.cos(phi) * Math.cos(decRad) * Math.cos(ha);
            const h = Math.asin(sinH);

            if (h < -0.1) return;

            const cosA = (Math.sin(decRad) - Math.sin(phi) * sinH) / (Math.cos(phi) * Math.cos(h));
            let A = Math.acos(Math.max(-1, Math.min(1, cosA)));
            if (Math.sin(ha) > 0) A = 2 * Math.PI - A;

            const radius = (Math.PI / 2 - h) / (Math.PI / 2);
            const centerX = width / 2;
            const centerY = height / 2;
            const spread = Math.max(width, height) * 0.9;

            const x = centerX + Math.sin(A) * radius * spread;
            const y = centerY - Math.cos(A) * radius * spread;

            const brightness = Math.max(0.1, 1 - (mag + 1.5) / 6.5);
            const size = Math.max(0.5, (5.0 - mag) * 0.6);
            const opacity = brightness * (h > 0 ? 1 : (h + 0.1) / 0.1);

            visibleStars.push({
                id: `star-${index}`,
                x,
                y,
                size,
                opacity,
                mag
            });
        });

        return visibleStars;
    }, [partnerLat, partnerLon]);

    if (!Number.isFinite(partnerLat) || !Number.isFinite(partnerLon)) {
        return null;
    }

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Svg width="100%" height="100%">
                {stars.map(star => (
                    <Star key={star.id} star={star} starColor={starColor} shimmer={shimmer} />
                ))}
            </Svg>
        </View>
    );
}
