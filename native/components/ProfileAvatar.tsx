import React, { useEffect } from 'react';
import { View, StyleSheet, Text, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Typography } from '../constants/Theme';
import { usePersistentMedia } from '../lib/media';

interface ProfileAvatarProps {
    url: string | null | undefined;
    fallbackText?: string;
    size?: number;
    borderWidth?: number;
    borderColor?: string;
    style?: ViewStyle;
    containerStyle?: ViewStyle;
    children?: React.ReactNode;
}

export function ProfileAvatar({
    url,
    fallbackText = 'U',
    size = 48,
    borderWidth = 1,
    borderColor = 'rgba(244, 63, 94, 0.4)',
    style,
    containerStyle,
    children,
}: ProfileAvatarProps) {
    const radius = size / 2;
    // Robust URL handling: convert 'null' string or real null to undefined
    const sanitizedUrl = (url === 'null' || !url) ? undefined : url;

    // Simplified Reactivity: Use persistent media directly
    // Force isVisible=true for avatars so they remain in cache/local and update instantly
    const persistentUrl = usePersistentMedia(sanitizedUrl, sanitizedUrl, true);
    
    // Fallback logic: prefer persistent, then sanitized, then null
    const displayUrl = persistentUrl || sanitizedUrl;

    const [hasError, setHasError] = React.useState(false);

    // Reset error state if URL changes
    useEffect(() => {
        setHasError(false);
    }, [displayUrl]);

    const showImg = displayUrl && !hasError;

    return (
        <View
            style={[
                styles.container,
                {
                    width: size,
                    height: size,
                    borderRadius: radius,
                    borderWidth,
                    borderColor,
                },
                containerStyle,
                style,
            ]}
        >
            {displayUrl && !hasError ? (
                <Image
                    source={{ uri: displayUrl }}
                    style={{ width: '100%', height: '100%', borderRadius: radius }}
                    contentFit="cover"
                    transition={200}
                    onError={(e) => {
                        console.warn(`[ProfileAvatar] Error loading ${displayUrl}:`, e.error);
                        setHasError(true);
                    }}
                />
            ) : (
                <Text accessibilityLabel={fallbackText} style={styles.fallbackText}>{fallbackText.charAt(0).toUpperCase()}</Text>
            )}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'transparent', // Changed to transparent to avoid "bg behind avatar" issues
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        color: Colors.dark.foreground,
        fontSize: 20,
        fontFamily: Typography.sansBold,
    },
});
