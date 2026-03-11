import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
    useAnimatedStyle, withTiming, useSharedValue, withSequence, withDelay, useDerivedValue,
    interpolate, Extrapolate
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { ANIM_MICRO } from '../constants/Animation';

import { Colors } from '../constants/Theme';
import {
    LayoutDashboard, Image as ImageIcon, Mail, Flame,
    Search, Bell, Sparkles, Compass, Heart
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPublicStorageUrl } from '../lib/storage';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../lib/store';
import { rtdb } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
// Remove GlitterPill import


const BTN_SIZE = 40;
const BTN_GAP = 4;
const SLOT = BTN_SIZE + BTN_GAP; // 44px

/**
 * NavbarDock: Refined for "Instant fingertips" and "Unified coordinates"
 * to avoid jumping/jitter when appMode switches mid-swipe.
 */
export function NavbarDock() {
    const {
        activeTabIndex,
        setTabIndex,
        scrollOffset,
        setNotificationDrawerOpen,
        appMode,
        toggleAppMode,
        setSearchOpen,
        couple,
        profile,
        partnerProfile,
        idToken,
    } = useOrbitStore();
    const insets = useSafeAreaInsets();
    const [isPartnerActive, setIsPartnerActive] = useState(false);

    const partnerAvatarUrl = useMemo(() => {
        if (!partnerProfile?.avatar_url) return null;
        return getPublicStorageUrl(partnerProfile.avatar_url, 'avatars', idToken);
    }, [partnerProfile?.avatar_url, partnerProfile?.id, idToken]);

    useEffect(() => {
        if (!couple?.id || !profile?.partner_id) return;
        const partnerRef = ref(rtdb, `presence/${couple.id}/${profile.partner_id}`);
        const unsub = onValue(partnerRef, (snapshot) => {
            const data = snapshot.val();
            setIsPartnerActive(!!data?.is_online || !!data?.in_cinema);
        });
        return unsub;
    }, [couple?.id, profile?.partner_id]);

    const isLunara = appMode === 'lunara';

    // UI DEFINITIONS
    const moonNavItems = [
        { name: 'Dashboard', icon: LayoutDashboard, tabIndex: 1 },
        { name: 'Letters', icon: Mail, tabIndex: 2 },
        { name: 'Memories', icon: ImageIcon, tabIndex: 3 },
        { name: 'Intimacy', icon: Flame, tabIndex: 4 },
    ];
    const lunaraNavItems = [
        { name: 'Discover', icon: Compass, tabIndex: 3 },
        { name: 'Lunara', icon: Sparkles, tabIndex: 5 },
        { name: 'Partner', icon: Heart, tabIndex: 6 },
    ];
    const navItems = isLunara ? lunaraNavItems : moonNavItems;

    /**
     * UNIFIED COORDINATE SYSTEM
     * We map ALL tabs [1-6] to a virtual "Dock X" coordinate.
     * This avoids the "freeze in mid" jitter because the mapping is continuous.
     */
    const translateX = useDerivedValue(() => {
        // We define a consistent translation for each tab index regardless of current mode
        // Dashboard(1), Letters(2), Memories/Discover(3), Intimacy(4), Lunara(5), Partner(6)

        const inputRange = [1, 2, 3, 4, 5, 6];

        // Define Slot offsets relative to the start of the dock
        // In Moon mode: D(0), L(1), M(2), I(3)
        // In Lunara mode: D(0), Lu(1), P(2)  <-- Tab 3 is Slot 0 here

        // To make it SNAPPY and "FOLLOW FINGERTIPS", we calculate the SLOT based on 
        // the mode we'll be in (or are currently in).

        if (isLunara) {
            // Lunara logic: Tab 3 is 0, 5 is 1, 6 is 2.
            // We extrapolate others to keep the line moving.
            const lunaraOutput = [
                -2 * SLOT, // 1
                -1 * SLOT, // 2
                0 * SLOT,  // 3
                0.5 * SLOT, // 4 (transition)
                1 * SLOT,  // 5
                2 * SLOT   // 6
            ];
            return interpolate(scrollOffset.value, inputRange, lunaraOutput, Extrapolate.CLAMP);
        } else {
            // Moon logic: 1 is 0, 2 is 1, 3 is 2, 4 is 3.
            const moonOutput = [
                0 * SLOT, // 1
                1 * SLOT, // 2
                2 * SLOT, // 3
                3 * SLOT, // 4
                4 * SLOT, // 5
                5 * SLOT  // 6
            ];
            return interpolate(scrollOffset.value, inputRange, moonOutput, Extrapolate.CLAMP);
        }
    });

    const iconsOpacity = useSharedValue(1);
    const dockTranslationY = useSharedValue(activeTabIndex === 0 ? 150 : 0);
    const dockOpacity = useSharedValue(activeTabIndex === 0 ? 0 : 1);

    useEffect(() => {
        iconsOpacity.value = withSequence(
            withTiming(0, { duration: 80 }),
            withDelay(20, withTiming(1, { duration: 120 }))
        );
    }, [isLunara]);

    useEffect(() => {
        if (activeTabIndex === 0) {
            dockTranslationY.value = withTiming(150, ANIM_MICRO);
            dockOpacity.value = withTiming(0, ANIM_MICRO);
        } else {
            dockTranslationY.value = withTiming(0, ANIM_MICRO);
            dockOpacity.value = withTiming(1, ANIM_MICRO);
        }
    }, [activeTabIndex]);

    const animatedIndicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));
    const iconsStyle = useAnimatedStyle(() => ({
        opacity: iconsOpacity.value,
    }));
    const animatedDockContainerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: dockTranslationY.value }],
        opacity: dockOpacity.value,
    }));

    const accent = isLunara ? '#a855f7' : '#f43f5e';
    const accentBorder = isLunara ? 'rgba(168,85,247,0.4)' : 'rgba(225,29,72,0.4)';

    const activeNavIndex = navItems.findIndex(item => item.tabIndex === activeTabIndex);
    const isActiveInDock = activeNavIndex >= 0;

    return (
        <Animated.View style={[styles.dockContainer, { bottom: Math.max(insets.bottom, 12) }, animatedDockContainerStyle]} pointerEvents={activeTabIndex === 0 ? 'none' : 'box-none'}>
            <View style={styles.dockWrapper}>

                {/* Bell */}
                <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.sideCapsule, { borderColor: isPartnerActive ? '#10b981' : accentBorder }]}>
                    <TouchableOpacity style={styles.sideBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setNotificationDrawerOpen(true); }}>
                        <Bell size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                    </TouchableOpacity>
                </BlurView>

                {/* Main Navigation Capsule */}
                <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.middleCapsule, { borderColor: isPartnerActive ? '#10b981' : accentBorder }]}>
                    <View style={styles.middleContent}>
                        {isActiveInDock && (
                            <Animated.View style={[styles.pillTrack, animatedIndicatorStyle]}>
                                <View style={[styles.activeIndicator, { borderColor: accent }]} />
                            </Animated.View>
                        )}

                        <Animated.View style={[styles.navRow, iconsStyle]}>
                            {navItems.map((item) => {
                                const isActive = item.tabIndex === activeTabIndex;
                                const Icon = item.icon;
                                return (
                                    <TouchableOpacity
                                        key={item.name}
                                        style={styles.navBtn}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            setTabIndex(item.tabIndex);
                                        }}
                                        onLongPress={() => {
                                            if (item.name === 'Dashboard' || item.name === 'Lunara') {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                toggleAppMode();
                                                setTabIndex(isLunara ? 1 : 6);
                                            }
                                        }}
                                        delayLongPress={400}
                                    >
                                        <Icon
                                            size={20}
                                            color={isActive ? (isLunara ? '#d8b4fe' : '#fff') : 'rgba(255,255,255,0.4)'}
                                            strokeWidth={isActive ? 2.5 : 2}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </Animated.View>
                    </View>
                </BlurView>

                {/* Search */}
                <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.sideCapsule, { borderColor: isPartnerActive ? '#10b981' : accentBorder }]}>
                    <TouchableOpacity style={styles.sideBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSearchOpen(true); }}>
                        <Search size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                    </TouchableOpacity>
                </BlurView>

            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    dockContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
    dockWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sideCapsule: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 4 },
    sideBtn: { width: BTN_SIZE, height: BTN_SIZE, alignItems: 'center', justifyContent: 'center' },
    middleCapsule: { borderRadius: 999, overflow: 'hidden', borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    middleContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: BTN_GAP, position: 'relative' },
    navBtn: { width: BTN_SIZE, height: BTN_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: BTN_GAP },
    pillTrack: { position: 'absolute', left: 8, top: 4, width: BTN_SIZE, height: BTN_SIZE, zIndex: 0 },
    activeIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#f43f5e',
        backgroundColor: 'transparent',
        alignSelf: 'center',
        marginTop: 14,
    },
});
