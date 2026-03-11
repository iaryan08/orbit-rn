import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOrbitStore } from '../lib/store';
import { Typography } from '../constants/Theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

/**
 * usePerfMonitor tracks the render count and detects "Heat" (excessive re-renders).
 */
export function usePerfMonitor(name: string) {
    const renderCount = useRef(0);
    const lastRenderTime = useRef(Date.now());
    const [stats, setStats] = useState({ count: 0, fps: 0, status: 'cool' as 'cool' | 'warm' | 'hot' });

    renderCount.current += 1;

    useEffect(() => {
        const timer = setInterval(() => {
            const now = Date.now();
            const diff = now - lastRenderTime.current;
            lastRenderTime.current = now;

            // STATUS: Renders Per Second (RPS)
            // 0-5 = Cool, 5-15 = Warm, 15+ = Hot
            const rps = renderCount.current;
            const status = rps > 15 ? 'hot' : rps > 5 ? 'warm' : 'cool';

            setStats({
                count: rps,
                fps: diff > 0 ? Math.round(1000 / diff) : 0,
                status
            });

            // CRITICAL: Reset the counter for the next second!
            renderCount.current = 0;
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return stats;
}

interface PerfChipProps {
    name: string;
    stats: { count: number; fps: number; status: 'cool' | 'warm' | 'hot' };
}

export function PerfChip({ name, stats }: PerfChipProps) {
    const isDebugMode = useOrbitStore(s => s.isDebugMode);

    if (!isDebugMode) return null;

    const getStatusColor = () => {
        switch (stats.status) {
            case 'hot': return '#ef4444'; // Red
            case 'warm': return '#f59e0b'; // Amber
            default: return '#10b981'; // Emerald
        }
    };

    return (
        <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[styles.container, { borderColor: getStatusColor() }]}
        >
            <View style={[styles.dot, { backgroundColor: getStatusColor() }]} />
            <Text style={styles.text}>{name}</Text>
            <View style={styles.divider} />
            <Text style={styles.val}>{stats.count}r</Text>
            <View style={styles.divider} />
            <Text style={styles.val}>{stats.fps}ms</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 4,
        right: 4,
        zIndex: 9999,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 100,
        borderWidth: 1,
        gap: 6,
        elevation: 10,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        color: 'white',
        fontSize: 8,
        fontFamily: Typography.sansBold,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    val: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 8,
        fontFamily: Typography.sans,
    },
    divider: {
        width: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
    }
});
