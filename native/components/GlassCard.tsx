import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle } from 'react-native';
import { Colors, Radius } from '../constants/Theme';

interface GlassCardProps extends ViewProps {
    children: React.ReactNode;
    intensity?: number;
    tint?: 'dark' | 'light' | 'default';
    contentStyle?: ViewStyle;
}

export const GlassCard = React.memo(({ children, style, contentStyle, ...props }: GlassCardProps) => {
    // Split layout styles from container styles to ensure children honor row/column correctly
    const {
        flexDirection,
        justifyContent,
        alignItems,
        flexWrap,
        padding,
        paddingHorizontal,
        paddingVertical,
        paddingTop,
        paddingBottom,
        ...containerStyle
    } = StyleSheet.flatten(style || {}) as any;

    const layoutStyle: ViewStyle = {
        flexDirection,
        justifyContent,
        alignItems,
        flexWrap,
        padding: padding ?? 0,
        paddingHorizontal, paddingVertical, paddingTop, paddingBottom
    };

    return (
        <View style={[styles.container, containerStyle]} {...props}>
            <View style={[styles.overlay, layoutStyle, contentStyle]}>
                {children}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
        borderWidth: 1.2, // Slightly thicker for contrast
        borderColor: 'rgba(255, 255, 255, 0.15)', // Brighter border
        backgroundColor: '#000000', // OLED black for maximum contrast (Instagram Style)
    },
    overlay: {
        // Layout styles applied dynamically from props
    }
});
