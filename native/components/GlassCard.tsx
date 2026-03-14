import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/Theme';

interface GlassCardProps extends ViewProps {
    children: React.ReactNode;
    intensity?: number;
    tint?: 'dark' | 'light' | 'default';
    contentStyle?: ViewStyle;
}

const GLASS_ALPHA = 0.72;
const DEFAULT_BG = `rgba(0, 0, 0, ${GLASS_ALPHA})`;

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

const normalizeHex = (hex: string) => {
    const cleaned = hex.replace('#', '').trim();
    if (cleaned.length === 3) {
        const r = parseInt(cleaned[0] + cleaned[0], 16);
        const g = parseInt(cleaned[1] + cleaned[1], 16);
        const b = parseInt(cleaned[2] + cleaned[2], 16);
        return { r, g, b, a: 1 };
    }
    if (cleaned.length === 4) {
        const r = parseInt(cleaned[0] + cleaned[0], 16);
        const g = parseInt(cleaned[1] + cleaned[1], 16);
        const b = parseInt(cleaned[2] + cleaned[2], 16);
        const a = parseInt(cleaned[3] + cleaned[3], 16) / 255;
        return { r, g, b, a };
    }
    if (cleaned.length === 6) {
        const r = parseInt(cleaned.slice(0, 2), 16);
        const g = parseInt(cleaned.slice(2, 4), 16);
        const b = parseInt(cleaned.slice(4, 6), 16);
        return { r, g, b, a: 1 };
    }
    if (cleaned.length === 8) {
        const r = parseInt(cleaned.slice(0, 2), 16);
        const g = parseInt(cleaned.slice(2, 4), 16);
        const b = parseInt(cleaned.slice(4, 6), 16);
        const a = parseInt(cleaned.slice(6, 8), 16) / 255;
        return { r, g, b, a };
    }
    return null;
};

const normalizeRgba = (color: string) => {
    const rgba = color.replace(/\s+/g, '');
    const match = rgba.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/i);
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
    return { r, g, b, a };
};

const normalizeGlassBackground = (color?: string) => {
    if (!color) return DEFAULT_BG;
    const lowered = color.trim().toLowerCase();
    if (lowered === 'transparent' || lowered === 'rgba(0,0,0,0)' || lowered === 'rgba(0, 0, 0, 0)') {
        return DEFAULT_BG;
    }
    if (lowered.startsWith('#')) {
        const parsed = normalizeHex(lowered);
        if (!parsed) return DEFAULT_BG;
        // If alpha is provided in hex (e.g. #00000000), respect it. Else use default.
        const alpha = parsed.a < 1 ? parsed.a : GLASS_ALPHA;
        return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
    }
    if (lowered.startsWith('rgb')) {
        const parsed = normalizeRgba(lowered);
        if (!parsed) return DEFAULT_BG;
        // If alpha is provided in rgba, respect it if it's not 1.0 (since solid rgb is common intent for glass)
        const alpha = parsed.a < 1 ? parsed.a : GLASS_ALPHA;
        return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
    }
    return DEFAULT_BG;
};

export const GlassCard = React.memo(({ children, style, contentStyle, ...props }: GlassCardProps) => {
    const flat = StyleSheet.flatten([style, contentStyle]) as ViewStyle | undefined;
    const normalizedBackground = normalizeGlassBackground(flat?.backgroundColor as string | undefined);
    return (
        <View
            style={[
                styles.container,
                style,
                contentStyle,
                {
                    backgroundColor: normalizedBackground,
                    borderRadius: Radius.xl,
                    borderWidth: 1,
                },
            ]}
            {...props}
        >
            {children}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', // Semi-transparent for wallpapers
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
        padding: Spacing.md, // Default padding for simpler layout
    },
});
