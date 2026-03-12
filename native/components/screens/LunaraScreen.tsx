import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, Pressable,
    Alert, Platform
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
    useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
    interpolate, Extrapolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Droplets, Sparkles, Calendar, Heart, Activity, BookOpen, ShieldAlert } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useOrbitStore } from '../../lib/store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Typography, Radius } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { GlassCard } from '../../components/GlassCard';
import { HeaderPill } from '../../components/HeaderPill';
import { LibidoMeter } from '../../components/LibidoMeter';
import { LibidoSlider } from '../../components/LibidoSlider';
import { PhaseSphere } from '../lunara/PhaseSphere';
import { BiologicalTimeline } from '../lunara/BiologicalTimeline';
import { LunaraPersonalization } from '../../components/LunaraPersonalization';
import { CycleSummaryBanner } from '../lunara/CycleSummaryBanner';
import { DailyInsightCard } from '../lunara/DailyInsightCard';
import { HormonePhaseDetail } from '../lunara/HormonePhaseDetail';
import { AIHealthAssistant } from '../lunara/AIHealthAssistant';
import { MalePartnerView } from '../lunara/MalePartnerView';
import { PremiumTabLoader } from '../PremiumTabLoader';
import {
    predictNextPeriod, getCycleDay, getPhaseForDay, getTodayIST,
} from '../../lib/cycle';
import { INTIMACY_INSIGHTS } from '../../lib/sexPositionData';
import { IntimacyInsightCard } from '../lunara/IntimacyInsightCard';
import { TodayTab } from '../lunara/TodayTab';
import { CycleTab } from '../lunara/CycleTab';
import { BodyTab } from '../lunara/BodyTab';
import { LearnTab } from '../lunara/LearnTab';
import { HerCycleTab } from '../lunara/HerCycleTab';
import { tab } from '../lunara/tabStyles';
import { TabSkeleton } from '../TabSkeleton';

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_ANDROID = Platform.OS === 'android';

const PHASE_SYMPTOMS: Record<string, string[]> = {
    Menstrual: ['Cramps', 'Fatigue', 'Back pain', 'Headache', 'Low mood', 'Bloating', 'Tender breasts'],
    Follicular: ['Energetic', 'Motivated', 'Clear skin', 'Social', 'Creative', 'Focused', 'Positive'],
    Ovulatory: ['Confident', 'Peak energy', 'High libido', 'Bloating', 'Mild cramp', 'Outgoing'],
    Luteal: ['Mood swings', 'Cravings', 'Bloating', 'Anxiety', 'Fatigue', 'Insomnia', 'Brain fog'],
};

const LIBIDO_LEVELS = [
    { id: 'low', label: 'Low', color: '#22c55e' },
    { id: 'medium', label: 'Medium', color: '#eab308' },
    { id: 'high', label: 'High', color: '#f97316' },
    { id: 'very_high', label: 'Very High', color: '#ef4444' },
];

/**
 * Sweeps text to replace person-specific pronouns.
 * If isSelf = true: "You are..."
 * If isSelf = false: "She is..."
 */
function formatContextualText(text: string | undefined, isSelf: boolean) {
    if (!text) return '';
    if (isSelf) return text; // Keep original "You" orientation

    // Simple replacement logic for common patterns
    let formatted = text
        .replace(/\bYou (are|re)\b/gi, 'She is')
        .replace(/\bYour\b/gi, 'Her')
        .replace(/\byou\b/gi, 'her')
        .replace(/\byours\b/gi, 'hers');

    return formatted;
}


// Tabs are now imported from ../lunara/

// ─── Main Screen ─────────────────────────────────────────────────────────────

type LunaraTabId = 'today' | 'cycle' | 'body' | 'partner' | 'learn';

export function LunaraScreen({ isActive = true, forcedTab }: { isActive?: boolean; forcedTab?: LunaraTabId }) {
    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const couple = useOrbitStore(state => state.couple);
    const cycleLogs = useOrbitStore(state => state.cycleLogs);
    const activeTabIndex = useOrbitStore(state => state.activeTabIndex);
    const logSymptomsOptimistic = useOrbitStore(state => state.logSymptomsOptimistic);
    const logSexDriveOptimistic = useOrbitStore(state => state.logSexDriveOptimistic);
    const loadDailyInsight = useOrbitStore(state => state.loadDailyInsight);
    const dailyInsight = useOrbitStore(state => state.dailyInsight);
    const isLoadingInsight = useOrbitStore(state => state.isLoadingInsight);
    const lunaraOnboardingComplete = useOrbitStore(state => state.lunaraOnboardingComplete);
    const lunaraOnboardingLoaded = useOrbitStore(state => state.lunaraOnboardingLoaded);
    const loadLunaraOnboarding = useOrbitStore(state => state.loadLunaraOnboarding);
    const setLunaraPhaseColor = useOrbitStore(state => state.setLunaraPhaseColor);
    const lunaraTab = useOrbitStore(state => state.lunaraTab);
    const intimacyIntel = useOrbitStore(state => state.intimacyIntel);
    const loadIntimacyIntelligence = useOrbitStore(state => state.loadIntimacyIntelligence);
    const isLoadingIntimacy = useOrbitStore(state => state.isLoadingIntimacy);
    const setPartnerProfile = useOrbitStore(state => state.setPartnerProfile);
    const setProfile = useOrbitStore(state => state.setProfile);

    const isLoadingContent = isLoadingInsight || isLoadingIntimacy;

    const insets = useSafeAreaInsets();

    const [cycleProfile, setCycleProfile] = useState<any>(null);
    const [partnerCycleProfile, setPartnerCycleProfile] = useState<any>(null);
    const [isLogging, setIsLogging] = useState(false);
    const [selectedTimelineDay, setSelectedTimelineDay] = useState<number | null>(null);

    // activeTab is either forced by the Pager index or driven by NavbarDock
    const activeTab = forcedTab || lunaraTab;

    const user = auth.currentUser;
    const coupleId = profile?.couple_id || couple?.id;
    const isFemale = profile?.gender === 'female';
    const today = getTodayIST();

    // ─── Load onboarding ─────────────────────────────────────────────────────
    useEffect(() => { loadLunaraOnboarding(); }, []);

    // ─── Firestore listeners ──────────────────────────────────────────────────
    useEffect(() => {
        if (!coupleId || !user || !isActive) return;
        const partnerId = couple
            ? (couple.user1_id === user.uid ? couple.user2_id : couple.user1_id)
            : null;

        const unsubOwn = onSnapshot(
            doc(db, 'couples', coupleId, 'cycle_profiles', user.uid),
            snap => { if (snap.exists()) setCycleProfile(snap.data()); },
            err => { if (err.code !== 'permission-denied') console.warn('[Lunara] own:', err); }
        );

        let unsubPartner = () => { };
        if (partnerId) {
            unsubPartner = onSnapshot(
                doc(db, 'couples', coupleId, 'cycle_profiles', partnerId),
                snap => { if (snap.exists()) setPartnerCycleProfile(snap.data()); },
                err => { if (err.code !== 'permission-denied') console.warn('[Lunara] partner:', err); }
            );
        }
        return () => { unsubOwn(); unsubPartner(); };
    }, [coupleId, user?.uid, isActive]);

    // ─── Cycle engine (all memoized) ─────────────────────────────────────────
    const activeCycle = isFemale ? cycleProfile : partnerCycleProfile;

    const prediction = useMemo(() =>
        predictNextPeriod(
            activeCycle?.period_history || [],
            activeCycle?.avg_cycle_length || 28,
            activeCycle?.avg_period_length || 5
        ),
        [activeCycle?.period_history?.join(','), activeCycle?.avg_cycle_length]
    );

    const realCycleDay = useMemo(() =>
        activeCycle?.last_period_start
            ? getCycleDay(activeCycle.last_period_start, prediction.avgCycleLength)
            : null,
        [activeCycle?.last_period_start, prediction.avgCycleLength]
    );

    const currentDay = selectedTimelineDay || realCycleDay;

    const currentPhase = useMemo(() =>
        currentDay ? getPhaseForDay(currentDay, prediction.avgCycleLength, prediction.avgPeriodLength) : null,
        [currentDay, prediction.avgCycleLength, prediction.avgPeriodLength]
    );

    const timelineDays = useMemo(() => {
        if (!activeCycle?.last_period_start || !realCycleDay) return [];
        return Array.from({ length: prediction.avgCycleLength }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + (i - (realCycleDay - 1)));
            const day = ((realCycleDay - 1 + i) % prediction.avgCycleLength) + 1;
            return {
                date: d,
                dayOfCycle: day,
                phase: getPhaseForDay(day, prediction.avgCycleLength, prediction.avgPeriodLength),
                isToday: i === realCycleDay - 1,
                isOvulation: day === prediction.ovulationDay,
                isPeriod: day <= prediction.avgPeriodLength,
                isFertile: prediction.fertilityWindow.includes(day),
            };
        });
    }, [activeCycle?.last_period_start, realCycleDay, prediction]);

    // ─── Load AI insight when phase changes ───────────────────────────────────
    useEffect(() => {
        if (!currentPhase || !currentDay || !isActive || activeTab !== 'today') return;
        loadDailyInsight(currentPhase.name, currentDay);
    }, [currentPhase?.name, currentDay, isActive, activeTab]);

    // ─── Load intimacy intelligence when on body/partner tab ─────────────────
    useEffect(() => {
        if (!currentPhase || !currentDay || !isActive) return;
        if (activeTab !== 'body' && activeTab !== 'partner') return;
        const history = activeCycle?.period_history || [];
        loadIntimacyIntelligence(currentPhase.name, currentDay, history);
    }, [currentPhase?.name, currentDay, isActive, activeTab]);

    // ─── Write phase color to store → NavbarDock picks it up ──────────────────
    useEffect(() => {
        if (currentPhase?.color) setLunaraPhaseColor(currentPhase.color);
        return () => { setLunaraPhaseColor(null); }; // clean up on unmount
    }, [currentPhase?.color]);

    // ─── Symptom / libido handlers ────────────────────────────────────────────
    const todaySymptoms: string[] = user ? (cycleLogs[user.uid]?.[today]?.symptoms || []) : [];
    const currentLibido = user ? (cycleLogs[user.uid]?.[today]?.sex_drive || null) : null;

    // Partner's libido — visible to both
    const partnerId = couple
        ? (couple.user1_id === user?.uid ? couple.user2_id : couple.user1_id)
        : null;
    const partnerLibido = partnerId ? (cycleLogs[partnerId]?.[today]?.sex_drive || null) : null;
    const partnerSymptoms: string[] = partnerId ? (cycleLogs[partnerId]?.[today]?.symptoms || []) : [];
    const partnerFirstName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    const handleToggleSymptom = useCallback((symptom: string) => {
        if (!user) return;
        const next = todaySymptoms.includes(symptom)
            ? todaySymptoms.filter((s: string) => s !== symptom)
            : [...todaySymptoms, symptom];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        logSymptomsOptimistic(user.uid, next);
    }, [todaySymptoms, user?.uid]);

    const handleLibidoSelect = useCallback((level: string) => {
        if (!user) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        logSexDriveOptimistic(user.uid, level);
    }, [user?.uid]);

    // ─── Period logging ───────────────────────────────────────────────────────
    const handleLogPeriod = useCallback(async () => {
        if (!coupleId || !user) return;

        const isCurrentlyMenstrual = currentPhase?.name === 'Menstrual';
        const title = isCurrentlyMenstrual ? 'End Period?' : 'Log Period Start';
        const msg = isCurrentlyMenstrual
            ? 'Confirm your period has ended?'
            : `Confirm your period started today (${today})?`;

        Alert.alert(title, msg, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Confirm',
                onPress: async () => {
                    setIsLogging(true);
                    try {
                        const history = cycleProfile?.period_history || [];
                        const nextHistory = isCurrentlyMenstrual ? history : [...new Set([today, ...history])].slice(0, 24);

                        setProfile({
                            ...profile,
                            cycle_profile: {
                                ...cycleProfile,
                                ...(isCurrentlyMenstrual ? { last_period_end: today } : { last_period_start: today }),
                                period_history: nextHistory,
                                avg_cycle_length: prediction.avgCycleLength,
                                avg_period_length: cycleProfile?.avg_period_length || 5,
                                updated_at: new Date().toISOString()
                            }
                        });

                        // If the logged user is the female partner, update the global partnerProfile for the male user as well
                        if (isFemale && setPartnerProfile) {
                            setPartnerProfile({
                                ...partnerProfile,
                                cycle_profile: {
                                    ...cycleProfile,
                                    ...(isCurrentlyMenstrual ? { last_period_end: today } : { last_period_start: today }),
                                    period_history: nextHistory,
                                    updated_at: new Date().toISOString()
                                }
                            });
                        }

                        await setDoc(
                            doc(db, 'couples', coupleId, 'cycle_profiles', user.uid),
                            {
                                ...(isCurrentlyMenstrual ? { last_period_end: today } : { last_period_start: today }),
                                period_history: nextHistory,
                                avg_cycle_length: prediction.avgCycleLength,
                                avg_period_length: cycleProfile?.avg_period_length || 5,
                                updated_at: serverTimestamp(),
                            },
                            { merge: true }
                        );
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (e) { console.error('[Lunara] log period:', e); }
                    finally { setIsLogging(false); }
                }
            }
        ]);
    }, [coupleId, user?.uid, cycleProfile, prediction, today, currentPhase?.name]);

    // ─── Scroll / header animation ────────────────────────────────────────────
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({ onScroll: e => { scrollOffset.value = e.contentOffset.y; } });
    const titleStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [0, 60], [0, -8], Extrapolate.CLAMP) }],
    }));
    const pillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [40, 80], [0, 1], Extrapolate.CLAMP),
    }));

    const phaseColor = currentPhase?.color || '#818cf8';
    const screenTitle = activeTab === 'today' ? (currentPhase?.name || 'Lunara')
        : activeTab === 'cycle' ? 'Cycle Map'
            : activeTab === 'body' ? (isFemale ? 'Body Log' : 'Desire')
                : isFemale ? 'Partner' : 'Partner Intel';
    const screenSub = isFemale ? 'Biological · Intelligence' : 'Know Her · Support Her';

    // ─── Onboarding gate (female only) ───────────────────────────────────────
    if (isFemale && lunaraOnboardingLoaded && !lunaraOnboardingComplete) {
        return <LunaraPersonalization onComplete={(answers: Record<string, string>) => {
            const state = useOrbitStore.getState();

            // Map the text answer to an integer
            let periodDays = 5;
            const periodAns = answers['periodLength'];
            if (periodAns === '3-4 days') periodDays = 4;
            else if (periodAns === '5-6 days') periodDays = 5;
            else if (periodAns === '7+ days') periodDays = 7;

            state.setLunaraOnboarding({
                ...state.lunaraOnboarding,
                periodLength: periodDays,
                completed: true
            } as any);
        }} />;
    }

    return (
        <View style={styles.root}>
            <Animated.ScrollView
                style={styles.scroll}
                onScroll={scrollHandler}
                scrollEventThrottle={IS_ANDROID ? 32 : 16}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 160 }}
            >
                {/* Page title — always visible, no delay */}
                <View style={styles.heroHeader}>
                    <Animated.Text style={[styles.screenTitle, titleStyle]}>{screenTitle}</Animated.Text>
                    <Animated.Text style={[styles.screenSub, titleStyle]}>{screenSub}</Animated.Text>
                </View>

                {/* Content */}
                <View style={styles.content}>
                    {isLoadingContent ? (
                        <TabSkeleton isActive={true} count={2} />
                    ) : (
                        <View>
                            {/* Today — female sees her own phase; male sees partner cycle */}
                            {activeTab === 'today' && (
                                isFemale ? (
                                    <TodayTab
                                        cycleDay={currentDay}
                                        phase={currentPhase}
                                        prediction={activeCycle?.last_period_start ? prediction : null}
                                        isActive={isActive}
                                        activeTabIndex={activeTabIndex}
                                        dailyInsight={dailyInsight}
                                        isLoadingInsight={isLoadingInsight}
                                        todaySymptoms={todaySymptoms}
                                        timelineDays={timelineDays}
                                        selectedDay={selectedTimelineDay || realCycleDay}
                                        onSelectDay={setSelectedTimelineDay}
                                        onLogPeriod={handleLogPeriod}
                                        isLogging={isLogging}
                                        formatContextualText={formatContextualText}
                                        intimacyIntel={intimacyIntel}
                                        isFemale={isFemale}
                                        PHASE_SYMPTOMS={PHASE_SYMPTOMS}
                                    />
                                ) : (
                                    <HerCycleTab
                                        partnerPhase={currentPhase}
                                        partnerCycleDay={realCycleDay}
                                        partnerPrediction={activeCycle?.last_period_start ? prediction : null}
                                        partnerName={partnerFirstName}
                                        timelineDays={timelineDays}
                                        selectedDay={selectedTimelineDay || realCycleDay}
                                        onSelectDay={(d: number) => { setSelectedTimelineDay(d); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                        onLogPeriod={handleLogPeriod}
                                        isLogging={isLogging}
                                        formatContextualText={formatContextualText}
                                    />
                                )
                            )}
                            {/* Cycle — female only (male doesn't have a cycle tab) */}
                            {activeTab === 'cycle' && isFemale && (
                                <CycleTab
                                    cycleDay={realCycleDay}
                                    phase={currentPhase}
                                    prediction={activeCycle?.last_period_start ? prediction : null}
                                    timelineDays={timelineDays}
                                    selectedDay={selectedTimelineDay || realCycleDay}
                                    activeCycle={activeCycle}
                                    onSelectDay={(d: number) => { setSelectedTimelineDay(d); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                    cycleProfile={cycleProfile}
                                    onLogPeriod={handleLogPeriod}
                                    isLogging={isLogging}
                                    intimacyIntel={intimacyIntel}
                                    isFemale={isFemale}
                                    PHASE_SYMPTOMS={PHASE_SYMPTOMS}
                                />
                            )}
                            {/* Body — both genders, libido + partner libido + intimacy */}
                            {activeTab === 'body' && (
                                <BodyTab
                                    phase={currentPhase}
                                    todaySymptoms={todaySymptoms}
                                    partnerSymptoms={partnerSymptoms}
                                    onToggleSymptom={handleToggleSymptom}
                                    currentLibido={currentLibido}
                                    onLibidoSelect={handleLibidoSelect}
                                    partnerLibido={partnerLibido}
                                    partnerName={partnerFirstName}
                                    isFemale={isFemale}
                                    intimacyIntel={intimacyIntel}
                                    PHASE_SYMPTOMS={PHASE_SYMPTOMS}
                                />
                            )}
                            {/* Partner — female sees how to communicate phase to him; male sees care guide */}
                            {activeTab === 'partner' && (
                                <MalePartnerView
                                    partnerProfile={partnerProfile}
                                    partnerCycleProfile={partnerCycleProfile}
                                    cycleLogs={cycleLogs}
                                    isActive={isActive && activeTabIndex === 4}
                                    intimacyIntel={intimacyIntel}
                                    isFemaleViewing={isFemale}
                                    femaleCycleDay={realCycleDay} // Pass her day for shared connection
                                />
                            )}
                            {activeTab === 'learn' && !isFemale && (
                                <LearnTab
                                    intimacyIntel={intimacyIntel}
                                    phase={currentPhase}
                                    partnerName={partnerFirstName}
                                    formatContextualText={formatContextualText}
                                    onLogPeriod={handleLogPeriod}
                                    isLogging={isLogging}
                                    styles={tab}
                                />
                            )}
                        </View>
                    )}
                </View>
            </Animated.ScrollView>

            {/* Sticky pill */}
            <Animated.View style={[styles.stickyPill, { top: insets.top - 4 }, pillStyle]}>
                <HeaderPill title={screenTitle} scrollOffset={scrollOffset} />
            </Animated.View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: 'transparent' },
    scroll: { flex: 1 },
    stickyPill: { position: 'absolute', left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none' },
    heroHeader: { paddingHorizontal: Spacing.md, marginBottom: 20 },
    screenTitle: GlobalStyles.standardTitle as any,
    screenSub: GlobalStyles.standardSubtitle as any,
    content: { flex: 1, paddingBottom: 20 },
});

