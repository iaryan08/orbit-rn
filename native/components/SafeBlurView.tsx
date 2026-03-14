import React from 'react';
import { View, StyleSheet, Platform, ViewProps } from 'react-native';
import { BlurView, BlurViewProps } from 'expo-blur';

interface SafeBlurViewProps extends BlurViewProps {
    fallbackBackgroundColor?: string;
    allowAndroidBlur?: boolean;
}

/**
 * A wrapper around Expo's BlurView that safely falls back to a semi-transparent
 * solid background on Android. This prevents the common "Software rendering 
 * doesn't support hardware bitmaps" crash on budget Android devices (like Redmi).
 */
export function SafeBlurView({
    fallbackBackgroundColor = 'rgba(25, 25, 25, 0.85)',
    allowAndroidBlur = false,
    style,
    children,
    ...props
}: SafeBlurViewProps) {
    if (Platform.OS === 'android' && !allowAndroidBlur) {
        return (
            <View style={[style, { backgroundColor: fallbackBackgroundColor }]}>
                {children}
            </View>
        );
    }

    return (
        <BlurView style={style} {...props}>
            {children}
        </BlurView>
    );
}
