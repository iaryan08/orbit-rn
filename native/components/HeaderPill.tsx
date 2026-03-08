import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming, interpolate } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';
import { getPublicStorageUrl } from '../lib/storage';
import { ProfileAvatar } from './ProfileAvatar';

interface HeaderPillProps {
    title: string;
    scrollOffset: any;
    showAt?: number;
    count?: number;
}

import * as Haptics from 'expo-haptics';
import { TouchableOpacity } from 'react-native-gesture-handler';

export function HeaderPill({ title, scrollOffset, showAt = 60, count }: HeaderPillProps) {
    const { profile, idToken, setTabIndex } = useOrbitStore();
    const insets = useSafeAreaInsets();

    const handleProfilePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTabIndex(4); // Navigate to Settings
    };

    const avatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    return (
        <View style={styles.headerContent}>
            <View style={styles.pillContainer}>
                <BlurView intensity={30} tint="dark" style={styles.blur} experimentalBlurMethod="dimezisBlurView">
                    <View style={styles.dot} />
                    <Text style={styles.text}>{title.toUpperCase()}</Text>
                    {count !== undefined && (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.count}>{count}</Text>
                        </>
                    )}
                </BlurView>
            </View>


            <TouchableOpacity
                style={styles.profileContainer}
                onPress={handleProfilePress}
            >
                <ProfileAvatar
                    url={avatarUrl}
                    size={52}
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm, // Extreme viewport optimization
        width: '100%',
    },
    pillContainer: {
        // No flex: 1 so it wraps content
    },
    blur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.4)',
        gap: 10,
        overflow: 'hidden',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.dark.rose[500],
    },
    text: {
        color: 'white',
        fontSize: 11,
        letterSpacing: 2,
        fontFamily: Typography.sansBold,
    },
    divider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    count: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
    },
    profileContainer: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 26,
    },
});

