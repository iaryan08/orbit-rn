import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, useSharedValue, withSequence, withDelay } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { ANIM_MICRO, ANIM_FADE_IN, ANIM_FADE_OUT } from '../constants/Animation';

import { Colors, Spacing } from '../constants/Theme';
import {
    LayoutDashboard, Image as ImageIcon, Mail, Flame,
    Search, Bell, Sparkles, Compass, Heart
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../lib/store';
import { rtdb } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useState } from 'react';

const BTN_SIZE = 40;
const BTN_GAP = 4;
const SLOT = BTN_SIZE + BTN_GAP; // 44px

export function NavbarDock() {
    const {
        activeTabIndex,
        setTabIndex,
        setNotificationDrawerOpen,
        appMode,
        toggleAppMode,
        setSearchOpen,
        couple,
        profile,
    } = useOrbitStore();
    const insets = useSafeAreaInsets();
    const [isPartnerActive, setIsPartnerActive] = useState(false);

    // RTDB instantaneous presence instead of last_seen Firestore polling
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

    // Moon mode: 4 tabs (Dashboard, Letters, Memories, Intimacy)
    const moonNavItems = [
        { name: 'Dashboard', icon: LayoutDashboard, tabIndex: 1, unread: false },
        { name: 'Letters', icon: Mail, tabIndex: 2, unread: true },
        { name: 'Memories', icon: ImageIcon, tabIndex: 3, unread: true },
        { name: 'Intimacy', icon: Flame, tabIndex: 4, unread: true },
    ];

    // Lunara mode: 3 tabs (Lunara/Home, Discover/Memories, Partner/Heart)
    const lunaraNavItems = [
        { name: 'Lunara', icon: Sparkles, tabIndex: 6, unread: false },  // cycle screen
        { name: 'Discover', icon: Compass, tabIndex: 3, unread: false },  // memories
        { name: 'Partner', icon: Heart, tabIndex: 7, unread: false },  // partner screen (calendar)
    ];


    const navItems = isLunara ? lunaraNavItems : moonNavItems;

    // Indicator x position - pixel perfect center of the active button
    // Each button occupies BTN_SIZE px, with BTN_GAP between them
    const getIndicatorX = (idx: number) => {
        // Find active item's position index in current navItems array (0 to 3)
        const posIdx = navItems.findIndex(item => item.tabIndex === idx);
        const i = posIdx >= 0 ? posIdx : 0;
        return i * SLOT;
    };

    const translateX = useSharedValue(getIndicatorX(activeTabIndex));

    // Icons crossfade when mode switches
    const iconsOpacity = useSharedValue(1);
    const borderOpacity = useSharedValue(1);

    // Slide dock down when hidden
    const isDockHidden = activeTabIndex === 0;
    const dockTranslationY = useSharedValue(isDockHidden ? 150 : 0);
    const dockOpacity = useSharedValue(isDockHidden ? 0 : 1);

    // Animate immediately — withTiming keeps pill in sync with icon colour switch

    const animatePillTo = (posIdx: number) => {
        translateX.value = withTiming(posIdx * SLOT, ANIM_MICRO);
    };

    // Fallback sync for PagerView swipe
    useEffect(() => {
        const posIdx = navItems.findIndex(item => item.tabIndex === activeTabIndex);
        if (posIdx >= 0) {
            translateX.value = withTiming(posIdx * SLOT, ANIM_MICRO);
        }
    }, [activeTabIndex, isLunara]);

    // Smooth crossfade when dock mode changes
    useEffect(() => {
        // Fade icons out, pill snaps during invisible window, fade back in
        iconsOpacity.value = withSequence(
            withTiming(0, { duration: 80 }),
            withDelay(20, withTiming(1, { duration: 120 }))
        );
    }, [isLunara]);

    // Slide dock out when hidden (e.g. going into Cinema)
    useEffect(() => {
        if (isDockHidden) {
            dockTranslationY.value = 150; // Instant slide down
            dockOpacity.value = 0; // Instant fade out
        } else {
            dockTranslationY.value = withTiming(0, ANIM_MICRO);
            dockOpacity.value = withTiming(1, ANIM_MICRO);
        }
    }, [isDockHidden]);


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


    // Theme accent colors
    const accent = isLunara ? '#a855f7' : '#f43f5e';
    const accentSoft = isLunara ? 'rgba(168,85,247,0.2)' : 'rgba(244,63,94,0.12)';
    const accentBorder = isLunara ? 'rgba(168,85,247,0.4)' : 'rgba(225,29,72,0.4)';
    const accentGlow = isLunara ? 'rgba(168,85,247,0.07)' : 'rgba(0,0,0,0)';

    const activeNavIndex = navItems.findIndex(item => item.tabIndex === activeTabIndex);
    const isActiveInDock = activeNavIndex >= 0;

    return (
        <Animated.View style={[styles.dockContainer, { bottom: Math.max(insets.bottom, 12) }, animatedDockContainerStyle]} pointerEvents={isDockHidden ? 'none' : 'box-none'}>
            <View style={styles.dockWrapper}>


                {/* Bell (Notifications) */}
                <BlurView
                    intensity={30}
                    tint="dark"
                    experimentalBlurMethod="dimezisBlurView"
                    style={[
                        styles.sideCapsule,
                        { borderColor: isPartnerActive ? '#10b981' : accentBorder }
                    ]}
                >
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setNotificationDrawerOpen(true);
                        }}
                    >
                        <Bell size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                    </TouchableOpacity>
                </BlurView>

                {/* Middle Navigation Capsule */}
                <BlurView
                    intensity={30}
                    tint="dark"
                    experimentalBlurMethod="dimezisBlurView"
                    style={[
                        styles.middleCapsule,
                        {
                            borderColor: isPartnerActive ? '#10b981' : accentBorder,
                            backgroundColor: accentGlow
                        }
                    ]}
                >
                    <View style={styles.middleContent}>
                        {/* Sliding Active Pill */}
                        {isActiveInDock && (
                            <Animated.View style={[styles.pillTrack, animatedIndicatorStyle]}>
                                <View style={[styles.activePill, { backgroundColor: accentSoft, borderColor: accent + '55' }]} />
                            </Animated.View>
                        )}

                        {/* Nav Buttons — wrapped for crossfade on mode switch */}
                        <Animated.View style={[styles.navRow, iconsStyle]}>
                            {navItems.map((item, posIdx) => {
                                const isActive = item.tabIndex === activeTabIndex;
                                const Icon = item.icon;
                                return (
                                    <TouchableOpacity
                                        key={item.name}
                                        style={styles.navBtn}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            animatePillTo(posIdx); // immediate — no state round-trip lag
                                            setTabIndex(item.tabIndex);
                                        }}
                                        onLongPress={() => {
                                            if (item.name === 'Dashboard' || item.name === 'Lunara') {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                if (isLunara) {
                                                    // Switch back to Moon → go to Dashboard
                                                    toggleAppMode();
                                                    setTabIndex(1);
                                                } else {
                                                    // Switch to Lunara → go to Lunara screen
                                                    toggleAppMode();
                                                    setTabIndex(6);
                                                }

                                            }
                                        }}
                                        delayLongPress={400}
                                    >
                                        <Icon
                                            size={20}
                                            color={isActive
                                                ? (isLunara ? '#d8b4fe' : 'rgba(255,255,255,0.95)')
                                                : 'rgba(255,255,255,0.4)'}
                                            strokeWidth={isActive ? 2.5 : 2}
                                        />
                                        {/* Unread dot */}
                                        {!isActive && item.unread && (
                                            <View style={[styles.unreadDot, { backgroundColor: accent }]} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </Animated.View>
                    </View>
                </BlurView>

                {/* Search */}
                <BlurView
                    intensity={30}
                    tint="dark"
                    experimentalBlurMethod="dimezisBlurView"
                    style={[
                        styles.sideCapsule,
                        { borderColor: isPartnerActive ? '#10b981' : accentBorder }
                    ]}
                >
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setSearchOpen(true);
                        }}
                    >
                        <Search size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                    </TouchableOpacity>
                </BlurView>
            </View>
        </Animated.View>

    );
}


const styles = StyleSheet.create({
    dockContainer: {
        position: 'absolute',
        left: 0, right: 0,
        alignItems: 'center',
        zIndex: 100,
    },
    dockWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    // Side capsules (Bell / Search)
    sideCapsule: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: 4,
    },
    sideBtn: {
        width: BTN_SIZE,
        height: BTN_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Middle capsule
    middleCapsule: {
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    middleContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: BTN_GAP,
        position: 'relative',
    },

    // Nav button — same size as slot
    navBtn: {
        width: BTN_SIZE,
        height: BTN_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: BTN_GAP,
    },

    // Sliding pill — absolute, same size as navBtn
    pillTrack: {
        position: 'absolute',
        left: 8, // matches paddingHorizontal
        top: 4,  // matches paddingVertical
        width: BTN_SIZE,
        height: BTN_SIZE,
        zIndex: 0,
    },
    activePill: {
        flex: 1,
        borderRadius: BTN_SIZE / 2,
        borderWidth: 1,
    },

    unreadDot: {
        position: 'absolute',
        top: 8, right: 8,
        width: 6, height: 6,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: '#0a0a0f',
    },
});
