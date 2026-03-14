import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useOrbitStore } from '../lib/store';
import { Typography } from '../constants/Theme';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

/**
 * usePerfMonitor tracks the render count and detects "Heat" (excessive re-renders).
 */
export function usePerfMonitor(name: string) {
    // DUMMY HOOK: Returns empty stats to avoid breaking existing imports.
    // The actual tracking is now contained entirely inside <PerfChip /> to prevent parent re-renders.
    return { count: 0, fps: 0, status: 'cool' as 'cool' | 'warm' | 'hot' };
}

interface PerfChipProps {
    name: string;
    stats: { count: number; fps: number; status: 'cool' | 'warm' | 'hot' };
}

export function PerfChip({ name }: PerfChipProps) {
    const isDebugMode = useOrbitStore(s => s.isDebugMode);

    // Contained state to prevent parent screen massive re-renders
    const renderCount = useRef(0);
    const lastRenderTime = useRef(Date.now());
    const [localStats, setLocalStats] = useState({ count: 0, fps: 0, status: 'cool' as 'cool' | 'warm' | 'hot' });

    renderCount.current += 1;

    useEffect(() => {
        if (!isDebugMode) return;
        const timer = setInterval(() => {
            const now = Date.now();
            const diff = now - lastRenderTime.current;
            lastRenderTime.current = now;

            const rps = renderCount.current;
            const status = rps > 15 ? 'hot' : rps > 5 ? 'warm' : 'cool';

            setLocalStats({
                count: rps,
                fps: diff > 0 ? Math.round(1000 / diff) : 0,
                status
            });

            renderCount.current = 0;
        }, 1000);

        return () => clearInterval(timer);
    }, [isDebugMode]);

    if (!isDebugMode) return null;

    const getStatusColor = () => {
        switch (localStats.status) {
            case 'hot': return '#ef4444'; // Red
            case 'warm': return '#f59e0b'; // Amber
            default: return '#10b981'; // Emerald
        }
    };

    const entering = Platform.OS !== 'android' ? FadeIn : undefined;
    const exiting = Platform.OS !== 'android' ? FadeOut : undefined;

    return (
        <Animated.View
            entering={entering}
            exiting={exiting}
            style={[styles.container, { borderColor: getStatusColor() }]}
        >
            <View style={[styles.dot, { backgroundColor: getStatusColor() }]} />
            <Text style={styles.text}>{name}</Text>
            <View style={styles.divider} />
            <Text style={styles.val}>{localStats.count}r</Text>
            <View style={styles.divider} />
            <Text style={styles.val}>{localStats.fps}ms</Text>
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
        color: 'rgba(255,255,255,0.88)',
        fontSize: 8,
        fontFamily: Typography.sans,
    },
    divider: {
        width: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.45)',
    }
});
