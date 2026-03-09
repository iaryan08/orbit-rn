import React from 'react';
import { View, StyleSheet, Text, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Typography } from '../constants/Theme';

interface ProfileAvatarProps {
    url: string | null | undefined;
    fallbackText?: string;
    size?: number;
    borderWidth?: number;
    borderColor?: string;
    style?: ViewStyle;
    children?: React.ReactNode;
}

export function ProfileAvatar({
    url,
    fallbackText = 'U',
    size = 48, // Increased default size (was 44 in HeaderPill)
    borderWidth = 1, // Reduced border thickness for sync
    borderColor = 'rgba(244, 63, 94, 0.4)', // Synced with NavbarDock/HeaderPill rose
    style,
    children,
}: ProfileAvatarProps) {
    const radius = size / 2;
    const [imgUrl, setImgUrl] = React.useState<string | undefined>(url ?? undefined);

    React.useEffect(() => {
        setImgUrl(url ?? undefined);
    }, [url]);

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
                style,
            ]}
        >
            {imgUrl ? (
                <Image
                    source={{ uri: imgUrl }}
                    style={{ width: '100%', height: '100%', borderRadius: radius }}
                    contentFit="cover"
                    transition={0}
                    cachePolicy="memory-disk"
                    onError={(e) => {
                        console.warn(`[ProfileAvatar] Error loading image:`, e.error);
                        // If the cached image is a corrupted 401, force bypass the disk cache once
                        if (url && imgUrl === url) {
                            console.log(`[ProfileAvatar] Bypassing corrupted cache for avatar`);
                            setImgUrl(`${url}${url.includes('?') ? '&' : '?'}reload=${Date.now()}`);
                        }
                    }}
                />
            ) : (
                <Text style={styles.fallbackText}>{fallbackText.charAt(0).toUpperCase()}</Text>
            )}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#171717',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fallbackText: {
        color: Colors.dark.foreground,
        fontSize: 20,
        fontFamily: Typography.sansBold,
    },
});
