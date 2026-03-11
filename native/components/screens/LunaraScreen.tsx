import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Alert, Pressable, Platform, Switch, Keyboard, PanResponder, Modal, RefreshControl
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
    interpolate, Extrapolate, withTiming, Easing, withSpring,
    FadeIn, FadeInDown, withDelay, withSequence
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Moon, Sparkles, Heart, Calendar, Shield, Flame, Settings, ChevronRight, Info, Droplets, Image as ImageIconLucide, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { auth, db, app } from '../../lib/firebase';
import {
    doc, updateDoc, setDoc, serverTimestamp,
    collection, query, where, getDocs, orderBy, limit, onSnapshot
} from 'firebase/firestore';
import { useOrbitStore } from '../../lib/store';
import { Colors, Spacing, Typography, Radius } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { GlassCard } from '../../components/GlassCard';
import { HeaderPill } from '../../components/HeaderPill';
import { predictNextPeriod, getTodayIST, getCycleDay } from '../../lib/cycle';
import { PhaseSphere } from '../lunara/PhaseSphere';
import { BiologicalTimeline } from '../lunara/BiologicalTimeline';

const { width } = Dimensions.get('window');

// ─── Phase logic ─────────────────────────────────────────────────────────────

function getPhaseInfo(day: number) {
    if (day <= 5) return { name: 'Menstrual', color: '#fb7185', advice: 'Rest and warmth are key today. Gentle comfort goes a long way.', partnerAdvice: 'She needs physical comfort — think warmth, her fave snacks, and gentle presence.' };
    if (day <= 13) return { name: 'Follicular', color: '#34d399', advice: 'Energy is rising! Great time for new experiences.', partnerAdvice: 'She\'s in her high-energy phase. Perfect for new adventures or a creative date.' };
    if (day <= 15) return { name: 'Ovulatory', color: '#fbbf24', advice: 'Peak energy and mood. You\'re radiating!', partnerAdvice: 'She\'s at her most outgoing. A fun night out or social plans would be perfect.' };
    return { name: 'Luteal', color: '#818cf8', advice: 'Slow down and practice gentle self-care. Rest is productive.', partnerAdvice: 'Extra patience and listening go a long way today. Be her calm anchor.' };
}

function getSuggestedSymptoms(day: number): string[] {
    if (day <= 5) return ['Cramps', 'Fatigue', 'Back pain', 'Headache', 'Low mood'];
    if (day <= 13) return ['Energetic', 'Positive', 'Clear skin', 'Motivated', 'Social'];
    if (day <= 15) return ['Ovulation pain', 'Bloating', 'Peak energy', 'Confident'];
    return ['Mood swings', 'Cravings', 'Bloating', 'Anxiety', 'Tired'];
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function LunaraScreen() {
    const {
        profile,
        partnerProfile,
        couple,
        cycleLogs,
        intimacyForecast,
        isRefreshingForecast,
        refreshForecast,
        lastForecastRefresh,
        activeTabIndex
    } = useOrbitStore();
    const insets = useSafeAreaInsets();

    const [cycleProfile, setCycleProfile] = useState<any>(null);
    const [partnerCycleProfile, setPartnerCycleProfile] = useState<any>(null);
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
    const [isLogging, setIsLogging] = useState(false);
    const [selectedTimelineDay, setSelectedTimelineDay] = useState<number | null>(null);
    const [isCheatCodeUnlocked, setIsCheatCodeUnlocked] = useState(false);

    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (e) => { scrollOffset.value = e.contentOffset.y; }
    });

    // Morphing: Standardized thresholds for professional overlap
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 70], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [0, 70], [1, 0.95], Extrapolate.CLAMP) },
            { translateY: interpolate(scrollOffset.value, [0, 70], [0, -12], Extrapolate.CLAMP) }
        ]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 50], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [30, 80], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [30, 80], [8, 0], Extrapolate.CLAMP) }]
    }));

    const isFemale = profile?.gender === 'female';
    const user = auth.currentUser;
    const coupleId = profile?.couple_id;
    const partnerId = couple
        ? (couple.user1_id === user?.uid ? couple.user2_id : couple.user1_id)
        : null;

    // ─── Firestore listeners ─────────────────────────────────────────────────
    useEffect(() => {
        if (!coupleId || !user) return;

        const ownRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
        const unsubOwn = onSnapshot(ownRef, (snap) => {
            if (snap.exists()) setCycleProfile(snap.data());
        }, (err) => {
            if (err.code !== 'permission-denied') {
                console.log("[LunaraScreen] Own cycle snapshot error:", err);
            }
        });

        if (partnerId) {
            const partnerRef = doc(db, 'couples', coupleId, 'cycle_profiles', partnerId);
            const unsubPartner = onSnapshot(partnerRef, (snap) => {
                if (snap.exists()) setPartnerCycleProfile(snap.data());
            }, (err) => {
                if (err.code !== 'permission-denied') {
                    console.log("[LunaraScreen] Partner cycle snapshot error:", err);
                }
            });
            return () => { unsubOwn(); unsubPartner(); };
        }
    }, [coupleId, user, partnerId]);

    useEffect(() => {
        if (!user?.uid) return;
        const today = getTodayIST();
        const symptoms = cycleLogs[user.uid]?.[today]?.symptoms || [];
        setSelectedSymptoms(symptoms);
    }, [cycleLogs, user?.uid]);

    const activeCycle = isFemale ? cycleProfile : partnerCycleProfile;

    // Predictive Engine (Flo-Style)
    const prediction = useMemo(() => {
        return predictNextPeriod(activeCycle?.period_history || [], activeCycle?.avg_cycle_length || 28);
    }, [activeCycle]);

    const realCurrentDay = activeCycle?.last_period_start
        ? getCycleDay(activeCycle.last_period_start, prediction.avgCycleLength)
        : null;

    // We favor the user-selected timeline day if they are explorative
    const currentDay = selectedTimelineDay || realCurrentDay;
    const phase = currentDay ? getPhaseInfo(currentDay) : null;
    const suggestedSymptoms = currentDay ? getSuggestedSymptoms(currentDay) : [];

    // Timeline Data Generation
    const timelineDays = useMemo(() => {
        if (!activeCycle?.last_period_start || !realCurrentDay) return [];
        const base = new Date(getTodayIST());
        const result = [];
        for (let i = 0; i < 14; i++) {
            const date = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
            const dCycle = ((realCurrentDay + i - 1) % prediction.avgCycleLength) + 1;
            result.push({
                date,
                dayOfCycle: dCycle,
                phase: getPhaseInfo(dCycle).name,
                isToday: i === 0,
                isOvulation: dCycle === prediction.ovulationDay,
                isPeriod: dCycle <= 5
            });
        }
        return result;
    }, [activeCycle, realCurrentDay, prediction]);

    const handleLogPeriod = async () => {
        if (!coupleId || !user) return;

        const todayStr = getTodayIST();
        Alert.alert(
            "Log Period Start",
            `Confirm your period started today (${todayStr})?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Confirm",
                    onPress: async () => {
                        setIsLogging(true);
                        try {
                            const profileRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
                            const history = cycleProfile?.period_history || [];
                            const nextHistory = [...new Set([todayStr, ...history])].slice(0, 12);

                            await setDoc(profileRef, {
                                last_period_start: todayStr,
                                period_history: nextHistory,
                                avg_cycle_length: prediction.avgCycleLength,
                                sharing_enabled: true,
                                updated_at: serverTimestamp()
                            }, { merge: true });

                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (e) {
                            console.error('Error logging period:', e);
                        } finally {
                            setIsLogging(false);
                        }
                    }
                }
            ]
        );
    };

    const handleToggleSymptom = (symptom: string) => {
        if (!user) return;

        const { logSymptomsOptimistic } = useOrbitStore.getState();
        const next = selectedSymptoms.includes(symptom)
            ? selectedSymptoms.filter(s => s !== symptom)
            : [...selectedSymptoms, symptom];

        setSelectedSymptoms(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        logSymptomsOptimistic(user.uid, next);
    };

    return (
        <View style={styles.container}>
            <Animated.ScrollView
                style={styles.scroll}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 140 }}
            >
                <View style={styles.hero}>
                    <View style={styles.standardHeader}>
                        <Animated.Text style={[styles.standardTitle, titleAnimatedStyle]}>
                            {phase?.name || 'Discovery'}
                        </Animated.Text>
                        <Animated.Text style={[styles.standardSubtitle, sublineAnimatedStyle]}>
                            Biological · Rhythm
                        </Animated.Text>
                    </View>

                    {phase && (
                        <PhaseSphere phase={phase.name} intensity={0.7} isActive={activeTabIndex === 4} />
                    )}

                    {isFemale && (
                        <View style={styles.centerRitualRow}>
                            <Pressable
                                onPress={handleLogPeriod}
                                disabled={isLogging}
                                style={({ pressed }) => [
                                    styles.ritualBtn,
                                    {
                                        opacity: pressed ? 0.7 : (isLogging ? 0.4 : 1),
                                        transform: [{ scale: pressed ? 0.98 : 1 }],
                                        backgroundColor: 'rgba(251,113,133,0.1)',
                                        borderColor: 'rgba(251,113,133,0.3)'
                                    }
                                ]}
                            >
                                <Droplets size={14} color="#f87171" />
                                <Text style={[styles.ritualBtnText, { color: '#f87171' }]}>
                                    {isLogging ? 'Logging...' : 'Log Period'}
                                </Text>
                            </Pressable>
                        </View>
                    )}

                    {!isFemale && partnerProfile && (
                        <View style={styles.partnerFocus}>
                            <HeaderPill
                                title={`Tracking ${partnerProfile.display_name}`}
                                scrollOffset={scrollOffset}
                            />
                        </View>
                    )}

                    {timelineDays.length > 0 && (
                        <BiologicalTimeline
                            days={timelineDays}
                            selectedDay={currentDay || 1}
                            onSelectDay={(d) => {
                                setSelectedTimelineDay(d);
                                setIsCheatCodeUnlocked(false);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        />
                    )}

                    <View style={styles.centerRitualRow}>
                        <Pressable
                            onPress={() => {
                                const COOLDOWN = 7 * 24 * 60 * 60 * 1000;
                                const lastRefresh = lastForecastRefresh || 0;
                                if (Date.now() - lastRefresh < COOLDOWN) {
                                    const daysLeft = Math.ceil((COOLDOWN - (Date.now() - lastRefresh)) / (1000 * 60 * 60 * 24));
                                    Alert.alert("Orbit Calibrating", `AI Refinement is cooling down. Next alignment available in ${daysLeft} days.`);
                                    return;
                                }

                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                refreshForecast({
                                    lastPeriodStart: activeCycle?.last_period_start,
                                    avgCycleLength: activeCycle?.avg_cycle_length || 28,
                                    periodHistory: activeCycle?.period_history || []
                                });
                            }}
                            disabled={isRefreshingForecast}
                            style={({ pressed }) => {
                                const COOLDOWN = 7 * 24 * 60 * 60 * 1000;
                                const lastRefresh = lastForecastRefresh || 0;
                                const isCoolingDown = (Date.now() - lastRefresh < COOLDOWN);
                                return [
                                    styles.ritualBtn,
                                    { opacity: pressed ? 0.7 : (isRefreshingForecast || isCoolingDown ? 0.4 : 1), transform: [{ scale: pressed ? 0.98 : 1 }] }
                                ];
                            }}
                        >
                            <Moon size={14} color="#c084fc" />
                            <Text style={styles.ritualBtnText}>
                                {isRefreshingForecast ? 'REFINING ORBIT...' : 'NEW MOON RITUAL'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* ── Fertility & Prediction (Premium Info) ──────────────────── */}
                {activeCycle?.last_period_start && (
                    <View style={styles.statsGrid}>
                        <GlassCard style={styles.predictionCard} intensity={20}>
                            <Text style={styles.predictionLabel}>Predicted Start</Text>
                            <Text style={styles.predictionValue}>{prediction.predictedDate}</Text>
                            <View style={[styles.confidenceBadge, styles[`conf${prediction.confidence}` as keyof typeof styles] as any]}>
                                <Text style={styles.confidenceText}>{prediction.confidence === 'High' ? 'Locked 🔒' : 'Learning...'}</Text>
                            </View>
                        </GlassCard>

                        <GlassCard style={styles.predictionCard} intensity={20}>
                            <Text style={styles.predictionLabel}>Pregnancy Chance</Text>
                            <Text style={[styles.predictionValue, { color: prediction.currentPregnancyChance === 'Peak' ? '#fbbf24' : '#fff' }]}>
                                {prediction.currentPregnancyChance}
                            </Text>
                            <Text style={styles.predictionSubText}>{prediction.daysUntil} days left</Text>
                        </GlassCard>
                    </View>
                )}

                {/* ── Poetic AI Insight Card ────────────────────────────── */}
                {currentDay && intimacyForecast[currentDay - 1] && (
                    <GlassCard style={styles.poeticCard} intensity={25}>
                        <View style={styles.poeticHeader}>
                            <Sparkles size={14} color="#fbbf24" />
                            <Text style={styles.poeticLabel}>Today's Alpha Insight</Text>
                        </View>
                        <Text style={styles.poeticInsight}>
                            {intimacyForecast[currentDay - 1].insight}
                        </Text>

                        <View style={styles.poeticDivider} />

                        <View style={styles.unlockableSection}>
                            <Text style={styles.unlockableLabel}>Partner Connection Key</Text>
                            {!isCheatCodeUnlocked ? (
                                <TouchableOpacity
                                    style={styles.unlockBtn}
                                    onPress={() => {
                                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                        setIsCheatCodeUnlocked(true);
                                    }}
                                >
                                    <View style={styles.blurCover}>
                                        <Shield size={20} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.unlockText}>TAP TO REVEAL</Text>
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <Animated.View entering={FadeIn.duration(500)}>
                                    <Text style={styles.cheatText}>
                                        {intimacyForecast[currentDay - 1].cheatCode}
                                    </Text>
                                </Animated.View>
                            )}
                        </View>

                        <View style={styles.connectMission}>
                            <Flame size={14} color="#fb7185" />
                            <Text style={styles.missionText}>
                                {intimacyForecast[currentDay - 1].mission}
                            </Text>
                        </View>
                    </GlassCard>
                )}

                {/* ── Routine Logs ────────────────────────────────────────── */}
                {isFemale && currentDay && (
                    <GlassCard style={styles.symptomsCard} intensity={10}>
                        <Text style={styles.sectionTitle}>Physical Resonance</Text>
                        <View style={styles.chipGrid}>
                            {suggestedSymptoms.map(symptom => {
                                const isSelected = selectedSymptoms.includes(symptom);
                                return (
                                    <Pressable
                                        key={symptom}
                                        onPress={() => handleToggleSymptom(symptom)}
                                        style={({ pressed }) => [
                                            styles.chip,
                                            isSelected && { backgroundColor: 'rgba(168,85,247,0.25)', borderColor: '#a855f7' },
                                            { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                        ]}
                                    >
                                        <Text style={[styles.chipText, isSelected && { color: '#c084fc' }]}>
                                            {symptom}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </GlassCard>
                )}

                <View style={{ height: 120 }} />
            </Animated.ScrollView>

            {/* Sticky Header Pill - Positioned AFTER Scroll for Z-Index Dominance */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title={phase?.name || "Discovery"} scrollOffset={scrollOffset} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    stickyHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: 'box-none',
    },
    standardHeader: GlobalStyles.standardHeader,
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    scroll: { flex: 1 },
    // Ritual Hero
    hero: { marginBottom: Spacing.xl, alignItems: 'flex-start' },
    ritualHeader: { alignItems: 'flex-start', marginBottom: 20 },
    ritualSubtitle: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 2.5,
        marginBottom: 8,
    },
    ritualTitle: {
        fontSize: 44, fontFamily: Typography.serif,
        color: 'white',
    },
    ritualAccent: {
        fontFamily: Typography.serifItalic,
        color: '#c084fc',
    },
    partnerFocus: { marginBottom: 20 },
    heroCtaRow: { flexDirection: 'row', gap: 12, marginTop: -10, marginBottom: 20 },
    centerRitualRow: { flexDirection: 'row', gap: 12, marginTop: 10, justifyContent: 'center' },
    ritualBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 12,
        borderRadius: 999, backgroundColor: 'rgba(168,85,247,0.1)',
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)',
    },
    ritualBtnText: {
        fontSize: 10, fontFamily: Typography.sansBold,
        color: '#c084fc', letterSpacing: 1.5,
    },

    // Prediction Stats
    statsGrid: {
        flexDirection: 'row', gap: Spacing.md,
        marginVertical: Spacing.lg,
        paddingHorizontal: Spacing.md,
    },
    predictionCard: {
        flex: 1, padding: 20, borderRadius: Radius.xl,
        alignItems: 'center', justifyContent: 'center'
    },
    predictionLabel: {
        fontSize: 8, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5,
        marginBottom: 8
    },
    predictionValue: {
        fontSize: 16, fontFamily: Typography.sansBold,
        color: '#fff', marginBottom: 4
    },
    predictionSubText: {
        fontSize: 9, color: 'rgba(255,255,255,0.5)',
        fontFamily: Typography.sans
    },
    confidenceBadge: {
        marginTop: 6, paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6
    },
    confHigh: { backgroundColor: 'rgba(52,211,153,0.15)' },
    confFair: { backgroundColor: 'rgba(251,191,36,0.15)' },
    confLearning: { backgroundColor: 'rgba(255,255,255,0.1)' },
    confidenceText: {
        fontSize: 7, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.8)'
    },

    // Poetic AI Card
    poeticCard: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.xl, padding: 24,
        borderRadius: Radius.xxl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    poeticHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    poeticLabel: {
        fontSize: 10, fontFamily: Typography.sansBold,
        color: '#fbbf24', letterSpacing: 1.5,
    },
    poeticInsight: {
        fontSize: 22, fontFamily: Typography.serifItalic,
        color: 'white', lineHeight: 34, marginBottom: 24,
    },
    poeticDivider: {
        height: 1, backgroundColor: 'rgba(255,255,255,0.1)',
        marginBottom: 24,
    },
    unlockableSection: { marginBottom: 24 },
    unlockableLabel: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 12,
    },
    unlockBtn: {
        height: 80, borderRadius: Radius.lg,
        backgroundColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    blurCover: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    unlockText: {
        fontSize: 11, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
    },
    cheatText: {
        fontSize: 16, fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.85)', lineHeight: 26,
    },
    missionText: {
        flex: 1, fontSize: 13, fontFamily: Typography.sans,
        color: '#c084fc', lineHeight: 20,
    },
    connectMission: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: Radius.lg,
        backgroundColor: 'rgba(168,85,247,0.1)',
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
    },

    // Symptoms
    symptomsCard: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md, padding: Spacing.lg,
        borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
    },
    sectionTitle: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 12,
    },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 999, borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.2)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    chipText: {
        fontSize: 11, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5,
    },
});
