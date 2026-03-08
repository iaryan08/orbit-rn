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
    return (
        <View style={[styles.container, style]} {...props}>
            <View style={[styles.overlay, contentStyle]}>
                {children}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        borderRadius: Radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.dark.border,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    overlay: {
        // Remove flex: 1 to allow hugging content
    }
});
