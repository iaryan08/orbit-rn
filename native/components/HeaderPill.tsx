import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Typography } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';
import { getPublicStorageUrl } from '../lib/storage';
import { ProfileAvatar } from './ProfileAvatar';
import { SafeBlurView } from './SafeBlurView';

interface HeaderPillProps {
    title: string;
    scrollOffset: any;
    showAt?: number;
    count?: number;
    onPress?: () => void;
    onLongPress?: () => void;
}

export function HeaderPill({ title, scrollOffset, showAt = 60, count, onPress, onLongPress }: HeaderPillProps) {
    const profile = useOrbitStore(s => s.profile);
    const idToken = useOrbitStore(s => s.idToken);
    const setTabIndex = useOrbitStore(s => s.setTabIndex);
    const appMode = useOrbitStore(s => s.appMode);
    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const lunaraPhaseColor = useOrbitStore(s => s.lunaraPhaseColor);
    const isLunara = appMode === 'lunara';

    // Phase-driven accent — mirrors NavbarDock indicator color exactly
    const accentColor = isLunara
        ? (lunaraPhaseColor || '#a855f7')
        : Colors.dark.rose[500];
    const borderAccent = isLunara
        ? `${lunaraPhaseColor || '#a855f7'}70`
        : 'rgba(244, 63, 94, 0.4)';

    // Settings is at index 9 (PagerView: 0=cinema, 1=dashboard, 2=letters, 3=memories, 4=milestones, 5-8=lunara, 9=settings)
    const handleProfilePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTabIndex(9, 'tap');
    };

    const avatarUrl = getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken);

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
                onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    onLongPress?.();
                }}
            >
                <SafeBlurView
                    intensity={20}
                    tint="dark"
                    style={[styles.blur, { borderColor: borderAccent }]}
                    experimentalBlurMethod="dimezisBlurView"
                    fallbackBackgroundColor="rgba(5,5,10,0.92)"
                    allowAndroidBlur={!isLiteMode}
                >
                    <View style={[styles.dot, { backgroundColor: accentColor }]} />
                    <Text style={[styles.text, isLunara && styles.lunaraText]}>{title.toUpperCase()}</Text>
                    {count !== undefined && (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.count}>{count}</Text>
                        </>
                    )}
                </SafeBlurView>
            </TouchableOpacity>

            {/* Right-pinned Profile */}
            <TouchableOpacity
                style={styles.profileContainer}
                onPress={handleProfilePress}
            >
                <ProfileAvatar
                    url={avatarUrl}
                    size={48}
                />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContent: {
        width: '100%',
        height: 68,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    pillContainer: {},
    blur: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1.2,
        borderColor: 'rgba(225, 29, 72, 0.5)', // fallback, overridden via inline style
        gap: 10,
        overflow: 'hidden',
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    text: {
        color: 'white',
        fontSize: 11,
        letterSpacing: 1.5,
        fontFamily: Typography.sansBold,
    },
    lunaraText: {
        color: 'white', // Ensure text is always white as per request
        letterSpacing: 1.5,
        fontSize: 11,
    },
    divider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    count: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 14,
        fontFamily: Typography.sansBold,
    },
    profileContainer: {
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
