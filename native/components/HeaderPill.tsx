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
    onPress?: () => void;
}

import * as Haptics from 'expo-haptics';
import { TouchableOpacity } from 'react-native-gesture-handler';

export function HeaderPill({ title, scrollOffset, showAt = 60, count, onPress }: HeaderPillProps) {
    const { profile, idToken, setTabIndex, activeTabIndex, appMode } = useOrbitStore();
    const insets = useSafeAreaInsets();
    const isLunara = appMode === 'lunara';

    const handleProfilePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTabIndex(7, 'tap');
    };

    const avatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    return (
        <View style={styles.headerContent}>
            {/* Left-pinned Pill */}
            <TouchableOpacity
                style={styles.pillContainer}
                activeOpacity={0.7}
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPress?.();
                }}
            >
                <BlurView
                    intensity={35}
                    tint="dark"
                    style={[styles.blur, isLunara && styles.lunaraBlur]}
                    experimentalBlurMethod="dimezisBlurView"
                >
                    <View style={[styles.dot, isLunara ? { backgroundColor: '#a855f7' } : { backgroundColor: Colors.dark.rose[500] }]} />
                    <Text style={[styles.text, isLunara && styles.lunaraText]}>{title.toUpperCase()}</Text>
                    {count !== undefined && (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.count}>{count}</Text>
                        </>
                    )}
                </BlurView>
            </TouchableOpacity>

            {/* Right-pinned Profile */}
            <TouchableOpacity
                style={styles.profileContainer}
                onPress={handleProfilePress}
            >
                <ProfileAvatar
                    url={avatarUrl}
                    size={48} // Balanced premium size
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContent: {
        width: '100%',
        height: 68, // Precision height as requested
        flexDirection: 'row',
        alignItems: 'center', // Vertical centering for both elements
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    pillContainer: {
        // Naturally centered by flex row
    },
    blur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1.2,
        borderColor: 'rgba(225, 29, 72, 0.4)',
        gap: 10,
        overflow: 'hidden',
    },
    lunaraBlur: {
        borderColor: 'rgba(168, 85, 247, 0.45)',
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
        letterSpacing: 1.5,
        fontFamily: Typography.sansBold,
    },
    lunaraText: {
        color: '#d8b4fe',
        letterSpacing: 1.5,
        fontSize: 11,
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
        borderWidth: 1.2,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
