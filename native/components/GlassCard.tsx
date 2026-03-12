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
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', // Semi-transparent for wallpapers
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    overlay: {
        // Layout styles applied dynamically from props
    }
});
