import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import Animated, {
    useAnimatedStyle, withTiming, useSharedValue, withSequence, withDelay,
    useDerivedValue, interpolate, Extrapolate, runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { ANIM_MICRO } from '../constants/Animation';
import { Colors, Typography } from '../constants/Theme';
import {
    LayoutDashboard, Image as ImageIcon, Mail, Flame,
    Search, Bell, Sparkles, Calendar, Activity, Heart, Moon, BookHeart,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../lib/store';
import { rtdb } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { SafeBlurView } from './SafeBlurView';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BTN_SIZE = 40;
const BTN_GAP = 4;
const SLOT = BTN_SIZE + BTN_GAP;

// ─── Tab definitions ────────────────────────────────────────────────────────

const MOON_TABS = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, tabIndex: 1 },
    { id: 'letters', label: 'Letters', icon: Mail, tabIndex: 2 },
    { id: 'memories', label: 'Memories', icon: ImageIcon, tabIndex: 3 },
    { id: 'milestones', label: 'Milestones', icon: Flame, tabIndex: 4 },
];

const LUNARA_FEMALE_TABS = [
    { id: 'today', label: 'Cycle', icon: Calendar },
    { id: 'body', label: 'Body', icon: Activity },
    { id: 'partner', label: 'Partner', icon: Heart },
    { id: 'learn', label: 'Intimacy', icon: Sparkles },
] as const;

const LUNARA_MALE_TABS = [
    { id: 'today', label: 'Her Cycle', icon: Moon },
    { id: 'body', label: 'Desire', icon: Flame },
    { id: 'partner', label: 'Care', icon: BookHeart },
    { id: 'learn', label: 'Intimacy', icon: Sparkles },
] as const;

type LunaraTabId = 'today' | 'cycle' | 'body' | 'partner' | 'learn';

export function NavbarDock() {
    const activeTabIndex = useOrbitStore(s => s.activeTabIndex);
    const setTabIndex = useOrbitStore(s => s.setTabIndex);
    const scrollOffset = useOrbitStore(s => s.scrollOffset);
    const setNotificationDrawerOpen = useOrbitStore(s => s.setNotificationDrawerOpen);
    const appMode = useOrbitStore(s => s.appMode);
    const toggleAppMode = useOrbitStore(s => s.toggleAppMode);
    const setSearchOpen = useOrbitStore(s => s.setSearchOpen);
    const couple = useOrbitStore(s => s.couple);
    const profile = useOrbitStore(s => s.profile);
    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const notifications = useOrbitStore(s => s.notifications);
    const lunaraPhaseColor = useOrbitStore(s => s.lunaraPhaseColor);
    const lunaraTab = useOrbitStore(s => s.lunaraTab);
    const setLunaraTab = useOrbitStore(s => s.setLunaraTab);

    const insets = useSafeAreaInsets();
    const [isPartnerActive, setIsPartnerActive] = useState(false);
    const isDockVisible = activeTabIndex !== 0;

    useEffect(() => {
        if (!isDockVisible || !couple?.id || !profile?.id) { setIsPartnerActive(false); return; }
        const partnerRef = ref(rtdb, `presence/${couple.id}`);
        const unsub = onValue(partnerRef, (snapshot) => {
            const allPresence = snapshot.val() || {};
            const partnerEntry = Object.entries(allPresence).find(([uid]) => uid !== profile.id);
            const data = partnerEntry?.[1] as any;
            const isOnline = !!data?.is_online || !!data?.in_cinema;
            const lastChanged = typeof data?.last_changed === 'number' ? data.last_changed : (isOnline ? Date.now() : 0);
            setIsPartnerActive((Date.now() - lastChanged < 300000) && isOnline);
        });
        return unsub;
    }, [couple?.id, isDockVisible, profile?.id]);

    const isLunara = activeTabIndex >= 5;
    const isFemale = profile?.gender === 'female';
    const lunaraTabs = isFemale ? LUNARA_FEMALE_TABS : LUNARA_MALE_TABS;

    const moonRowSlide = useDerivedValue(() => {
        return interpolate(scrollOffset.value, [4, 5], [0, -SCREEN_WIDTH], Extrapolate.CLAMP);
    });

    const lunaraRowSlide = useDerivedValue(() => {
        return interpolate(scrollOffset.value, [4, 5], [SCREEN_WIDTH, 0], Extrapolate.CLAMP);
    });

    const moonRowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: moonRowSlide.value }] }));
    const lunaraRowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lunaraRowSlide.value }] }));

    const moonIndicatorX = useDerivedValue(() => {
        const inputRange = [1, 2, 3, 4];
        const outputRange = [0, 1, 2, 3].map(s => s * SLOT);
        return interpolate(scrollOffset.value, inputRange, outputRange, Extrapolate.CLAMP);
    });
    const moonIndicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: moonIndicatorX.value }] }));

    const lunaraIndicatorX = useDerivedValue(() => {
        const slots = lunaraTabs.length;
        const inputRange = Array.from({ length: slots }, (_, i) => 5 + i);
        const outputRange = Array.from({ length: slots }, (_, i) => i * SLOT);
        return interpolate(scrollOffset.value, inputRange, outputRange, Extrapolate.CLAMP);
    });
    const lunaraIndicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lunaraIndicatorX.value }] }));

    const MAX_INDEX = isFemale ? 10 : 9;
    const dockOpacity = useDerivedValue(() => {
        return interpolate(scrollOffset.value, [0, 0.5, 1, MAX_INDEX, MAX_INDEX + 0.5], [0, 0, 1, 1, 0], Extrapolate.CLAMP);
    });
    const dockTranslationY = useDerivedValue(() => {
        return interpolate(scrollOffset.value, [0, 0.5, 1, MAX_INDEX, MAX_INDEX + 0.5], [100, 100, 0, 0, 100], Extrapolate.CLAMP);
    });

    const animatedDockStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: dockTranslationY.value }],
        opacity: dockOpacity.value,
    }));

    const rawAccent = isLunara && lunaraPhaseColor ? lunaraPhaseColor : '#f43f5e';
    const accent = rawAccent;
    const accentBorder = `${accent}66`;

    const unreadCount = notifications.filter(n => !n?.is_read).length;

    const handleLunaraTab = useCallback((id: LunaraTabId) => {
        const idx = lunaraTabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setLunaraTab(id);
        setTabIndex(5 + idx, 'tap');
    }, [lunaraTabs, setLunaraTab, setTabIndex]);

    // ─── Swipe Mode Switch ──────────────────────────────────────────────────
    const panGesture = Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onEnd((event) => {
            const swipeThreshold = 50;
            if (Math.abs(event.translationX) > swipeThreshold) {
                runOnJS(() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    toggleAppMode();
                    // Go to dashboard (1) or Lunara Today (5) based on current mode (will be toggled)
                    setTabIndex(appMode === 'moon' ? 5 : 1, 'tap');
                })();
            }
        });

    return (
        <GestureHandlerRootView>
            <Animated.View
                style={[styles.dockContainer, { bottom: Math.max(insets.bottom, 12) }, animatedDockStyle]}
                pointerEvents={activeTabIndex === 0 ? 'none' : 'box-none'}
            >
                <GestureDetector gesture={panGesture}>
                    <View style={styles.dockWrapper}>

                    {/* Bell */}
                    <SafeBlurView intensity={18} tint="dark" experimentalBlurMethod="dimezisBlurView"
                        fallbackBackgroundColor="rgba(5,5,10,0.92)" allowAndroidBlur={!isLiteMode}
                        style={[styles.sideCapsule, { borderColor: accentBorder }]}
                    >
                        <TouchableOpacity style={styles.sideBtn} onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setNotificationDrawerOpen(true);
                        }}>
                            <Bell size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                            {unreadCount > 0 && <View style={styles.unreadBadge} />}
                        </TouchableOpacity>
                    </SafeBlurView>

                    {/* Main capsule with sliding rows */}
                    <SafeBlurView intensity={18} tint="dark" experimentalBlurMethod="dimezisBlurView"
                        fallbackBackgroundColor="rgba(5,5,10,0.92)" allowAndroidBlur={!isLiteMode}
                        style={[styles.middleCapsule, { borderColor: accentBorder }]}
                    >
                        <View style={[styles.rowClip, { width: (isLunara ? lunaraTabs.length : MOON_TABS.length) * SLOT + 16 }]}>

                            {/* ── Moon row ──────────────────────────────────────── */}
                            <Animated.View style={[styles.middleContent, StyleSheet.absoluteFillObject, moonRowStyle]}>
                                <Animated.View style={[styles.activeIndicator, moonIndicatorStyle, { backgroundColor: accent }]} />
                                <View style={styles.navRow}>
                                    {MOON_TABS.map(item => {
                                        const IconComponent = item.icon;
                                        const isActive = item.tabIndex === activeTabIndex;
                                        const iconActiveColor = accent;
                                        const iconInactiveColor = "rgba(255,255,255,0.35)";

                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={styles.navBtn}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                    setTabIndex(item.tabIndex, 'tap');
                                                }}
                                                onLongPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                    toggleAppMode();
                                                    setTabIndex(5, 'tap');
                                                }}
                                                delayLongPress={400}
                                            >
                                                <IconComponent
                                                    size={18}
                                                    color={isActive ? iconActiveColor : iconInactiveColor}
                                                    strokeWidth={isActive ? 2.5 : 2}
                                                />
                                                <Text
                                                    style={[
                                                        styles.tabLabel,
                                                        { color: isActive ? iconActiveColor : "rgba(255,255,255,0.3)" }
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {item.label.toUpperCase()}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </Animated.View>

                            {/* ── Lunara row ─────────────────────────────────────── */}
                            <Animated.View style={[styles.middleContent, StyleSheet.absoluteFillObject, lunaraRowStyle]}>
                                <Animated.View style={[styles.activeIndicator, lunaraIndicatorStyle, { backgroundColor: accent }]} />
                                <View style={styles.navRow}>
                                    {lunaraTabs.map((tab, idx) => {
                                        const IconComponent = tab.icon;
                                        const tabIndex = 5 + idx;
                                        const isActive = activeTabIndex === tabIndex;
                                        const iconActiveColor = accent;
                                        const iconInactiveColor = "rgba(255,255,255,0.35)";

                                        return (
                                            <TouchableOpacity
                                                key={tab.id}
                                                style={[styles.navBtn, { width: SLOT }]}
                                                onPress={() => handleLunaraTab(tab.id as LunaraTabId)}
                                                onLongPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                    toggleAppMode();
                                                    setTabIndex(1, 'tap');
                                                }}
                                                delayLongPress={400}
                                            >
                                                <IconComponent
                                                    size={18}
                                                    color={isActive ? iconActiveColor : iconInactiveColor}
                                                    strokeWidth={isActive ? 2.5 : 2}
                                                />
                                                <Text
                                                    style={[
                                                        styles.tabLabel,
                                                        { color: isActive ? iconActiveColor : "rgba(255,255,255,0.3)" }
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {tab.label.toUpperCase()}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </Animated.View>

                        </View>
                    </SafeBlurView>

                    {/* Search */}
                    <SafeBlurView intensity={18} tint="dark" experimentalBlurMethod="dimezisBlurView"
                        fallbackBackgroundColor="rgba(5,5,10,0.92)" allowAndroidBlur={!isLiteMode}
                        style={[styles.sideCapsule, { borderColor: accentBorder }]}
                    >
                        <TouchableOpacity style={styles.sideBtn} onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setSearchOpen(true);
                        }}>
                            <Search size={20} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                        </TouchableOpacity>
                    </SafeBlurView>

                    </View>
                </GestureDetector>
            </Animated.View>
        </GestureHandlerRootView>
    );
}

const ROW_HEIGHT = BTN_SIZE + SLOT / 2;

const styles = StyleSheet.create({
    dockContainer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
    dockWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sideCapsule: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.55)', padding: 4 },
    sideBtn: { width: BTN_SIZE, height: BTN_SIZE, alignItems: 'center', justifyContent: 'center', position: 'relative' },

    // Main capsule clips both sliding rows
    middleCapsule: { borderRadius: 999, overflow: 'hidden', borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    rowClip: { height: ROW_HEIGHT, overflow: 'hidden', position: 'relative' },

    middleContent: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 8, paddingVertical: 4,
        gap: BTN_GAP, position: 'relative',
    },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: BTN_GAP },
    navBtn: { width: BTN_SIZE, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 1, gap: 1 },
    tabLabel: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        marginTop: 4,
        letterSpacing: 1,
    },
    activeIndicator: {
        position: 'absolute',
        top: 4,
        left: 8,
        width: BTN_SIZE,
        height: BTN_SIZE,
        borderRadius: BTN_SIZE / 2,
        opacity: 0.1,
    },
    unreadBadge: {
        position: 'absolute', top: 8, right: 8,
        width: 7, height: 7, borderRadius: 4,
        backgroundColor: Colors.dark.rose[500],
        borderWidth: 1, borderColor: 'rgba(5,5,10,0.9)',
    },
});
