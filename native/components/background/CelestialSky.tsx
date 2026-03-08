import React, { useMemo, useEffect } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, withTiming, Easing, interpolateColor, SharedValue } from 'react-native-reanimated';
import { BRIGHT_STARS } from '../../lib/astronomy/stars';

interface CelestialSkyProps {
    userLat?: number;
    userLon?: number;
    partnerLat?: number;
    partnerLon?: number;
    starColor?: number[]; // [r, g, b]
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

const Star = React.memo(({ star, starColor }: StarProps) => {
    return (
        <Circle
            cx={star.x}
            cy={star.y}
            r={star.size * 0.5}
            fill={`rgba(${starColor[0]}, ${starColor[1]}, ${starColor[2]}, ${star.opacity})`}
        />
    );
});

export function CelestialSky({
    userLat,
    userLon,
    partnerLat,
    partnerLon,
    starColor = [255, 255, 255],
}: CelestialSkyProps) {
    const fallbackLat = Number.isFinite(userLat) ? userLat! : 28.61;
    const fallbackLon = Number.isFinite(userLon) ? userLon! : 77.21;
    const skyLat = Number.isFinite(partnerLat) ? partnerLat! : fallbackLat;
    const skyLon = Number.isFinite(partnerLon) ? partnerLon! : fallbackLon;
    const stars = useMemo(() => {
        const now = new Date();
        const JD = now.getTime() / 86400000 + 2440587.5;
        const D = JD - 2451545.0;

        let GMST = (18.697374558 + 24.06570982441908 * D) % 24;
        if (GMST < 0) GMST += 24;

        let LST = (GMST + skyLon / 15) % 24;
        if (LST < 0) LST += 24;

        const phi = skyLat * (Math.PI / 180);
        const lstRad = LST * 15 * (Math.PI / 180);

        // Limit to 80 for mobile performance
        const starsToRender = BRIGHT_STARS.slice(0, 80);
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
    }, [skyLat, skyLon]);

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Svg width="100%" height="100%">
                {stars.map(star => (
                    <Star key={star.id} star={star} starColor={starColor} />
                ))}
            </Svg>
        </View>
    );
}
