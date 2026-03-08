import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { Sparkles, Image as ImageIcon, Camera, Lock, Plus, Flame, Heart, Zap, Activity, Smile, Thermometer, Moon } from 'lucide-react-native';
import { PolaroidStack } from '../../components/PolaroidStack';
import { PartnerHeader } from '../../components/PartnerHeader';
import {
    RelationshipStats,
    IntimacyAlert,
    AuraBoard,
    ImportantDatesCountdown,
    LocationWidget,
    DailyInspirationWidget,
    MenstrualPhaseWidget,
    BucketListWidget,
    LetterPreviewWidget
} from '../../components/DashboardWidgets';
import { GlassCard } from '../../components/GlassCard';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, withDelay, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { getPublicStorageUrl } from '../../lib/storage';
import { SharedCanvas } from '../../components/SharedCanvas';
import { getTodayIST } from '../../lib/utils';

const { width } = Dimensions.get('window');

export function DashboardScreen() {
    const { profile, partnerProfile, couple, fetchData, polaroids, letters, memories, moods, milestones, cycleLogs, idToken, setTabIndex } = useOrbitStore();
    // Use auth.currentUser as immediate fallback to avoid blank flash on mount
    const [user, setUser] = useState<any>(auth.currentUser);
    const insets = useSafeAreaInsets();

    const isFemale = profile?.gender === 'female';
    const today = getTodayIST();
    const partnerId = partnerProfile?.id;
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;

    // Period detection for widget visibility
    const userLogsToday = (profile?.id && cycleLogs[profile.id]) ? cycleLogs[profile.id][today] : null;
    const isOnPeriod = userLogsToday?.is_period === true || userLogsToday?.flow;

    const [refreshing, setRefreshing] = useState(false);

    // Local scroll tracking
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    const onRefresh = useCallback(async () => {
        if (!user?.uid) return;
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await fetchData(user.uid);
        } finally {
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        // Initial user sync
        if (auth.currentUser) {
            setUser(auth.currentUser);
        }
    }, []);

    // Morphing: Title fades and scales down
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [10, 60], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [10, 60], [1, 0.9], Extrapolate.CLAMP) }
        ]
    }));

    // Subline fading (e.g. Partner header/subtitle)
    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [20, 100], [1, 0], Extrapolate.CLAMP),
    }));

    // Morphing: HeaderPill fades and slides up (Swipe up effect)
    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [65, 110], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [65, 110], [10, 0], Extrapolate.CLAMP) }]
    }));

    // Entry Animations for Widgets
    const widgetOpacity = useSharedValue(0);
    const widgetTranslateY = useSharedValue(20);

    useEffect(() => {
        const config = { duration: 300, easing: Easing.out(Easing.exp) };
        widgetOpacity.value = withDelay(300, withTiming(1, config));
        widgetTranslateY.value = withDelay(300, withTiming(0, config));
    }, []);

    const widgetEntryStyle = useAnimatedStyle(() => ({
        opacity: widgetOpacity.value,
        transform: [{ translateY: widgetTranslateY.value }]
    }));

    // Don't block render — if no user after auth check, parent layout handles redirect
    if (!user) return <View style={styles.container} />;

    const myPolaroid = polaroids.find(p => p.user_id === user.uid) || null;
    const partnerPolaroid = polaroids.find(p => p.user_id !== user.uid) || null;

    const supportHistory = [
        { id: '1', text: isFemale ? "HE BROUGHT FLOWERS" : "YOU BROUGHT FLOWERS", type: 'gift' },
        { id: '2', text: isFemale ? "HE COOKED DINNER" : "YOU COOKED DINNER", type: 'act' },
        { id: '3', text: "GENTLE MASSAGE", type: 'touch' },
    ];

    const handleSwipe = (translationX: number) => {
        if (translationX < -100) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setTabIndex(1); // Open Sync-Cinema
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
        >
            {/* Sticky Header Pill - FIXED PINNING */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Space" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.md }]}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="white"
                        colors={[Colors.dark.rose[400]]}
                        progressViewOffset={insets.top + 20}
                    />
                }
            >
                <View
                    style={styles.feedScroll}
                >
                    <View style={styles.feedSection}>
                        <View style={styles.headerTitleContainer}>
                            <Animated.View style={sublineAnimatedStyle}>
                                <PartnerHeader
                                    profile={profile}
                                    partnerProfile={partnerProfile}
                                    coupleId={couple?.id}
                                />
                            </Animated.View>
                        </View>

                        <Animated.View style={[styles.widgetsGrid, widgetEntryStyle]}>
                            {/* Passion Alert - Immersive Glass Card */}
                            {partnerLogsToday?.sex_drive === 'very_high' && (
                                <TouchableOpacity activeOpacity={0.9} style={styles.passionAlertWrapper} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
                                    <GlassCard style={styles.passionAlertCard} intensity={25}>
                                        <View style={styles.passionIconBox}>
                                            <Flame size={24} color="#f97316" fill="#f97316" />
                                        </View>
                                        <View style={styles.passionTextContent}>
                                            <Text style={styles.passionAlertTitle}>Intense Passion</Text>
                                            <Text style={styles.passionAlertSub}>
                                                {isFemale ? "He's feeling a deep desire for you right now." : "She's feeling a deep desire for you right now."}
                                            </Text>
                                        </View>
                                    </GlassCard>
                                </TouchableOpacity>
                            )}

                            {/* Quick Actions at the very top */}
                            <View style={styles.quickActionsContainer}>
                                <TouchableOpacity style={styles.quickActionGlass} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                    <Lock size={20} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.quickActionGlass} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                    <Plus size={22} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.quickActionGlass} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                    <Camera size={22} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.quickActionGlass} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                    <Sparkles size={20} color="white" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <RelationshipStats
                                    couple={couple}
                                    lettersCount={letters.length}
                                    memoriesCount={memories.length}
                                />
                            </View>

                            {/* Quick Logging - ONLY ON PERIOD DAYS FOR MAIN DASHBOARD */}
                            {isFemale && isOnPeriod && (
                                <View style={styles.borderBottomWrapper}>
                                    <View style={styles.quickLoggingSection}>
                                        <View style={styles.supportHeader}>
                                            <Plus size={16} color={Colors.dark.indigo[400]} />
                                            <Text style={styles.supportTitle}>QUICK LOG</Text>
                                        </View>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Smile size={14} color="white" />
                                                <Text style={styles.logChipText}>HAPPY</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Thermometer size={14} color="white" />
                                                <Text style={styles.logChipText}>CRAMPS</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Moon size={14} color="white" />
                                                <Text style={styles.logChipText}>TIRED</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Activity size={14} color="white" />
                                                <Text style={styles.logChipText}>BLOATED</Text>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    </View>
                                </View>
                            )}

                            {/* Recent Support History - ONLY ON PERIOD DAYS FOR MAIN DASHBOARD */}
                            {isOnPeriod && (
                                <View style={styles.borderBottomWrapper}>
                                    <View style={styles.supportHistorySection}>
                                        <View style={styles.supportHeader}>
                                            <Heart size={16} color={Colors.dark.rose[400]} />
                                            <Text style={styles.supportTitle}>SUPPORT HISTORY</Text>
                                        </View>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                            {supportHistory.map(item => (
                                                <View key={item.id} style={styles.supportChip}>
                                                    <Text style={styles.supportChipText}>{item.text}</Text>
                                                </View>
                                            ))}
                                        </ScrollView>
                                    </View>
                                </View>
                            )}


                            <View style={styles.borderBottomWrapper}>
                                <LetterPreviewWidget />
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <ImportantDatesCountdown
                                    milestones={milestones}
                                    partnerProfile={partnerProfile}
                                />
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <AuraBoard
                                    profile={profile}
                                    partnerProfile={partnerProfile}
                                    cycleLogs={cycleLogs}
                                />
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <GlassCard style={[styles.placeholderCard, { padding: 0 }]} intensity={10}>
                                    <View style={styles.polaroidHeader}>
                                        <View style={styles.polaroidTitleRow}>
                                            <Camera size={20} color={Colors.dark.indigo[400]} />
                                            <Text style={styles.polaroidTitle}>Daily Polaroid</Text>
                                        </View>
                                        <View style={styles.momentBadge}>
                                            <Text style={styles.momentBadgeText}>MOMENT</Text>
                                        </View>
                                    </View>
                                    <View style={styles.stackSection}>
                                        <PolaroidStack
                                            userPolaroid={myPolaroid}
                                            partnerPolaroid={partnerPolaroid}
                                            partnerName={partnerProfile?.display_name || 'Partner'}
                                            onUploadPress={() => { }}
                                            onPress={() => { }}
                                            authToken={idToken}
                                        />
                                    </View>
                                </GlassCard>
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <LocationWidget
                                    profile={profile}
                                    partnerProfile={partnerProfile}
                                />
                            </View>
                        </Animated.View>
                    </View>

                    {/* Full Width Shared Canvas */}
                    <SharedCanvas />

                    <Animated.View style={styles.feedSection}>
                        <View style={styles.borderBottomWrapper}>
                            <DailyInspirationWidget />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <MenstrualPhaseWidget />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <BucketListWidget />
                        </View>
                    </Animated.View>
                </View>
            </Animated.ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    stickyHeader: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000, // Elevated zIndex
        pointerEvents: 'box-none',
        // Removed alignItems: center to allow HeaderPill internal alignment
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 40, // Extreme push to top
        paddingBottom: 160,
    },
    feedSection: {
        width: '100%',
        maxWidth: 480,
        alignSelf: 'center',
    },
    headerTitleContainer: {
        paddingHorizontal: Spacing.sm,
        paddingTop: 40,
        paddingBottom: 2, // Tightened gap with quick actions
    },
    headerTitle: {
        fontSize: 40,
        fontFamily: Typography.serif,
        color: Colors.dark.foreground,
        letterSpacing: -0.5,
        marginBottom: Spacing.xs,
        display: 'none',
    },
    quickActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        paddingTop: 8,
        paddingBottom: Spacing.xl,
    },
    quickActionGlass: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.08)', // Slightly more opaque for better visibility without elevation
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', // Ensure no overflow from children or artifacts
    },
    widgetsGrid: {
        flexDirection: 'column',
    },
    borderBottomWrapper: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
        width: '100%',
    },
    stackSection: {
        height: 380,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    placeholderCard: {
        margin: Spacing.sm, // Reduced margin
        borderRadius: Radius.xl,
        padding: Spacing.md, // Tightened
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    polaroidHeader: {
        padding: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    polaroidTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    polaroidTitle: {
        color: Colors.dark.foreground,
        fontSize: 20,
        fontFamily: Typography.serif,
    },
    momentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    momentBadgeText: {
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    canvasArea: {
        height: 240,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomLeftRadius: Radius.xl,
        borderBottomRightRadius: Radius.xl,
        overflow: 'hidden',
    },
    artStroke: {
        position: 'absolute',
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
    },
    canvasArt: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    canvasText: {
        color: 'rgba(255,255,255,0.25)',
        marginTop: Spacing.md,
        fontSize: 13,
        fontFamily: Typography.serifItalic,
    },
    passionAlertWrapper: {
        margin: Spacing.sm,
        marginBottom: Spacing.xs,
    },
    passionAlertCard: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    passionIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    passionTextContent: {
        flex: 1,
    },
    passionAlertTitle: {
        color: 'white',
        fontSize: 16,
        fontFamily: Typography.serif,
    },
    passionAlertSub: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontFamily: Typography.serifItalic,
    },
    supportHistorySection: {
        paddingVertical: 20,
        paddingHorizontal: Spacing.sm,
    },
    supportHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    supportTitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
    },
    supportScroll: {
        gap: 12,
    },
    supportChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    supportChipText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },
    quickLoggingSection: {
        paddingVertical: 20,
        paddingHorizontal: Spacing.sm,
    },
    logChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginRight: 8,
    },
    logChipText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
    },
    feedScroll: {
        flex: 1,
    },
});
