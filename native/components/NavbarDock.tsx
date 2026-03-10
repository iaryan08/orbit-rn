import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
    useAnimatedStyle, withTiming, useSharedValue, withSequence, withDelay, LinearTransition, FadeIn, FadeOut
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import {
    LayoutDashboard, Image as ImageIcon, Mail, Flame,
    Search, Bell, Sparkles, Compass, Heart
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../lib/store';

const BTN_SIZE = 40;
const BTN_GAP = 6;
const SLOT = BTN_SIZE + BTN_GAP;
const DOCK_HEIGHT = 46;

/**
 * NavbarDock: Ultra-responsive with "Dock Slider" animation
 * The entire capsule slides left/right during mode transitions.
 */
export function NavbarDock() {
    const {
        activeTabIndex,
        setTabIndex,
        setNotificationDrawerOpen,
        appMode,
        toggleAppMode,
        setSearchOpen,
    } = useOrbitStore();
    const insets = useSafeAreaInsets();

    const isLunara = appMode === 'lunara';

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

    const activeNavIndex = navItems.findIndex(item => item.tabIndex === activeTabIndex);
    const isActiveInDock = activeNavIndex >= 0;

    const pillTranslateX = useSharedValue(isActiveInDock ? activeNavIndex * SLOT : 0);

    useEffect(() => {
        if (isActiveInDock) {
            pillTranslateX.value = withTiming(activeNavIndex * SLOT, { duration: 110 });
        }
    }, [activeNavIndex, isActiveInDock]);

    const shouldHideDock = activeTabIndex === 0 || activeTabIndex === 7;
    const iconsOpacity = useSharedValue(1);
    const dockHideY = useSharedValue(shouldHideDock ? 150 : 0);
    const dockOpacity = useSharedValue(shouldHideDock ? 0 : 1);

    useEffect(() => {
        iconsOpacity.value = withSequence(
            withTiming(0, { duration: 80 }),
            withDelay(20, withTiming(1, { duration: 120 }))
        );
    }, [isLunara]);

    useEffect(() => {
        if (shouldHideDock) {
            dockHideY.value = withTiming(150, { duration: 100 });
            dockOpacity.value = withTiming(0, { duration: 100 });
        } else {
            dockHideY.value = withTiming(0, { duration: 100 });
            dockOpacity.value = withTiming(1, { duration: 100 });
        }
    }, [shouldHideDock]);

    const animatedIndicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: pillTranslateX.value }],
    }));
    const iconsStyle = useAnimatedStyle(() => ({
        opacity: iconsOpacity.value,
    }));
    const animatedDockContainerStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: dockHideY.value }],
        opacity: dockOpacity.value,
    }));

    const activeBorder = isLunara ? 'rgba(168,85,247,0.45)' : 'rgba(225,29,72,0.45)';
    const activeShadow = isLunara ? '#a855f7' : '#f43f5e';

    return (
        <Animated.View
            style={[styles.dockContainer, { bottom: Math.max(insets.bottom, 12) }, animatedDockContainerStyle]}
            pointerEvents={shouldHideDock ? 'none' : 'box-none'}
        >
            <View style={styles.dockWrapper}>
                {/* Bell Capsule */}
                <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.sideCapsule, { borderColor: activeBorder }]}>
                    <TouchableOpacity style={styles.sideBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setNotificationDrawerOpen(true); }}>
                        <Bell size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                    </TouchableOpacity>
                </BlurView>

                {/* Main Navigation Capsule */}
                <BlurView intensity={45} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.middleCapsule, { borderColor: activeBorder }]}>
                    <View style={styles.middleContent}>
                        {isActiveInDock && (
                            <Animated.View style={[styles.pillTrack, animatedIndicatorStyle]}>
                                <View style={[styles.activePill, { borderColor: activeBorder, shadowColor: activeShadow }]} />
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
                                            setTabIndex(item.tabIndex, 'tap');
                                        }}
                                        onLongPress={() => {
                                            if (item.name === 'Dashboard' || item.name === 'Lunara' || item.name === 'Discover') {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                toggleAppMode();
                                            }
                                        }}
                                        delayLongPress={400}
                                    >
                                        <Icon
                                            size={20}
                                            color={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                                            strokeWidth={isActive ? 2.5 : 2}
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </Animated.View>
                    </View>
                </BlurView>

                {/* Search Capsule */}
                <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={[styles.sideCapsule, { borderColor: activeBorder }]}>
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
    sideCapsule: { borderRadius: 999, overflow: 'hidden', borderWidth: 1.2, backgroundColor: 'rgba(0,0,0,0.5)', height: DOCK_HEIGHT, justifyContent: 'center' },
    sideBtn: { width: DOCK_HEIGHT, height: DOCK_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    middleCapsule: { borderRadius: 999, overflow: 'hidden', borderWidth: 1.2, backgroundColor: 'rgba(0,0,0,0.5)', height: DOCK_HEIGHT, justifyContent: 'center' },
    middleContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: BTN_GAP, position: 'relative' },
    navBtn: { width: BTN_SIZE, height: BTN_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: BTN_GAP },
    pillTrack: {
        position: 'absolute',
        left: 10,
        top: 0, // Match the top of the navBtn within middleContent
        width: BTN_SIZE,
        height: BTN_SIZE, // Match the height of the navBtn
        zIndex: 0
    },
    activePill: {
        flex: 1,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
});
