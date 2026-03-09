import React from 'react';
import { StyleSheet, View } from 'react-native';

interface GlitterPillProps {
    color: string;
    isLunara?: boolean;
}

/**
 * Minimalistic & Instant Pill: Pure React Native View.
 * Provides a clean glass-like premium feel with zero latency.
 */
export const GlitterPill = React.memo(({ isLunara }: GlitterPillProps) => {
    const bgColor = isLunara
        ? 'rgba(168,85,247,0.4)'
        : 'rgba(244,63,94,0.4)';

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            {/* Soft inner highlight */}
            <View style={styles.highlight} />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    highlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40%',
        backgroundColor: 'rgba(255,255,255,0.15)',
    }
});
