import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet, Pressable,
    Alert, Platform, TouchableOpacity, Modal, TextInput
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
    useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
    interpolate, Extrapolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Droplets, Sparkles, Calendar, Heart, Activity, BookOpen, ShieldAlert } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
import { getTodayIST, getCycleDay, predictNextPeriod, getPhaseForDay, getRolling24hLogs } from '../../lib/cycle';
import { stringToHash } from '../../lib/utils';
import { INTIMACY_INSIGHTS } from '../../lib/sexPositionData';
import { IntimacyInsightCard } from '../lunara/IntimacyInsightCard';
import { TodayTab } from '../lunara/TodayTab';
import { CycleTab } from '../lunara/CycleTab';
import { BodyTab } from '../lunara/BodyTab';
import { LearnTab } from '../lunara/LearnTab';
import { HerCycleTab } from '../lunara/HerCycleTab';
import { tab } from '../lunara/tabStyles';
import { TabSkeleton } from '../TabSkeleton';
import { Settings } from 'lucide-react-native';
import { LunaraSettingsModal } from '../lunara/LunaraSettingsModal';
import { BlurView } from 'expo-blur';

// --- Custom Symptom Modal ---
function SymptomModal({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (val: string) => void }) {
    const [text, setText] = useState('');
    const insets = useSafeAreaInsets();

    const handleAdd = () => {
        if (text.trim()) {
            onAdd(text.trim());
            setText('');
            onClose();
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
                <BlurView intensity={20} tint="dark" style={[StyleSheet.absoluteFillObject]} />
                <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFillObject} onPress={onClose} />
                <GlassCard style={{ padding: 24, borderRadius: 28 }} intensity={20}>
                    <Text style={{ fontSize: 20, fontFamily: Typography.serifBold, color: 'white', marginBottom: 8 }}>Log Feeling</Text>
                    <Text style={{ fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>How are you feeling right now?</Text>
                    
                    <TextInput
                        autoFocus
                        value={text}
                        onChangeText={setText}
                        placeholder="e.g. Sharp cramps, High energy..."
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderRadius: 16,
                            padding: 16,
                            color: 'white',
                            fontSize: 16,
                            fontFamily: Typography.sans,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.1)',
                            marginBottom: 24
                        }}
                    />

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                        <TouchableOpacity 
                            onPress={onClose}
                            style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' }}
                        >
                            <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: Typography.sansBold }}>CANCEL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={handleAdd}
                            style={{ flex: 2, paddingVertical: 14, borderRadius: 16, backgroundColor: Colors.dark?.rose?.[500] || '#fb7185', alignItems: 'center' }}
                        >
                            <Text style={{ color: 'white', fontFamily: Typography.sansBold }}>ADD LOG</Text>
                        </TouchableOpacity>
                    </View>
                </GlassCard>
            </View>
        </Modal>
    );
}

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

    const isCurrentTab = useOrbitStore(state => state.activeTabIndex >= 5 && state.activeTabIndex <= 8);
    const isFocused = isCurrentTab && isActive;

    const logSymptomsOptimistic = useOrbitStore(state => state.logSymptomsOptimistic);
    const logSexDriveOptimistic = useOrbitStore(state => state.logSexDriveOptimistic);
    const loadDailyInsight = useOrbitStore(state => state.loadDailyInsight);
    const dailyInsight = useOrbitStore(state => state.dailyInsight);
    const isLoadingInsight = useOrbitStore(state => state.isLoadingInsight);
    const toggleTabListener = useOrbitStore(state => state.toggleTabListener);
    const lastForegroundTime = useOrbitStore(state => state.lastForegroundTime);
    const lunaraOnboardingComplete = useOrbitStore(state => state.lunaraOnboardingComplete);
    const lunaraOnboardingLoaded = useOrbitStore(state => state.lunaraOnboardingLoaded);
    const loadLunaraOnboarding = useOrbitStore(state => state.loadLunaraOnboarding);
    const setLunaraPhaseColor = useOrbitStore(state => state.setLunaraPhaseColor);
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);
    const setLunaraOnboarding = useOrbitStore(state => state.setLunaraOnboarding);
    const lunaraTab = useOrbitStore(state => state.lunaraTab);
    const intimacyIntel = useOrbitStore(state => state.intimacyIntel);
    const loadIntimacyIntelligence = useOrbitStore(state => state.loadIntimacyIntelligence);
    const isLoadingIntimacy = useOrbitStore(state => state.isLoadingIntimacy);
    const setPartnerProfile = useOrbitStore(state => state.setPartnerProfile);
    const setProfile = useOrbitStore(state => state.setProfile);

    const isLoadingContent = isLoadingInsight || isLoadingIntimacy;

    const insets = useSafeAreaInsets();

    const [isLogging, setIsLogging] = useState(false);
    const [isSymptomModalVisible, setIsSymptomModalVisible] = useState(false);
    const [selectedTimelineDay, setSelectedTimelineDay] = useState<number | null>(null);

    const user = auth.currentUser;
    const coupleId = profile?.couple_id || couple?.id;

    // 🚀 Phase 7: Selective Listener Lifecycle
    useEffect(() => {
        if (isActive && coupleId) {
            toggleTabListener('lunara', true);
            return () => {
                toggleTabListener('lunara', false);
            };
        }
    }, [isActive, coupleId, lastForegroundTime]);
    // activeTab is either forced by the Pager index or driven by NavbarDock
    const activeTab = forcedTab || lunaraTab;

    const isFemale = profile?.gender?.toLowerCase() === 'female';
    const today = getTodayIST();
    const aiCooldownRef = useRef<number>(0);
    const coupleHash = useMemo(() => coupleId ? stringToHash(coupleId) : 0, [coupleId]);

    // ─── Load onboarding ─────────────────────────────────────────────────────
    useEffect(() => { loadLunaraOnboarding(); }, []);

    // ðŸš€ Phase 7: Redundant Firestore listeners removed. 
    // We now use profile.cycle_profile and partnerProfile.cycle_profile directly from the store.
    const cycleProfile = isFemale ? profile?.cycle_profile : partnerProfile?.cycle_profile;
    const partnerCycleProfile = isFemale ? partnerProfile?.cycle_profile : profile?.cycle_profile;

    // ─── Cycle engine (all memoized) ─────────────────────────────────────────
    const activeCycle = cycleProfile;

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

    // ─── Symptom / libido handlers (Rolling 24h Visibility) ──────────────────
    const myLogs = useMemo(() => user ? getRolling24hLogs(user.uid, cycleLogs) : {}, [user?.uid, cycleLogs, today]);
    const todaySymptoms: string[] = useMemo(() => myLogs.symptoms || [], [myLogs]);
    const currentLibido = useMemo(() => myLogs.sex_drive || null, [myLogs]);

    const currentPhase = useMemo(() =>
        currentDay ? getPhaseForDay(
            currentDay,
            prediction.avgCycleLength,
            prediction.avgPeriodLength,
            activeCycle?.last_period_start,
            activeCycle?.last_period_end,
            todaySymptoms // 🚀 Pass symptoms for real-time accuracy
        ) : null,
        [currentDay, prediction.avgCycleLength, prediction.avgPeriodLength, activeCycle?.last_period_start, activeCycle?.last_period_end, todaySymptoms.join(',')]
    );

    const timelineDays = useMemo(() => {
        if (!activeCycle?.last_period_start || !realCycleDay) return [];
        return Array.from({ length: prediction.avgCycleLength }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + (i - (realCycleDay - 1)));
            const day = ((realCycleDay - 1 + i) % prediction.avgCycleLength) + 1;

            // For timeline, we only have symptoms for "today"
            const symptomsToPass = (i === realCycleDay - 1) ? todaySymptoms : [];

            return {
                date: d,
                dayOfCycle: day,
                phase: getPhaseForDay(
                    day,
                    prediction.avgCycleLength,
                    prediction.avgPeriodLength,
                    activeCycle?.last_period_start,
                    activeCycle?.last_period_end,
                    symptomsToPass
                ),
                isToday: i === realCycleDay - 1,
                isOvulation: day === prediction.ovulationDay,
                isPeriod: day <= (activeCycle?.last_period_end && activeCycle?.last_period_start && activeCycle.last_period_end >= activeCycle.last_period_start
                    ? Math.floor((new Date(activeCycle.last_period_end).getTime() - new Date(activeCycle.last_period_start).getTime()) / (1000 * 60 * 60 * 24)) + 1
                    : prediction.avgPeriodLength),
                isFertile: prediction.fertilityWindow.includes(day),
            };
        });
    }, [activeCycle?.last_period_start, realCycleDay, prediction, todaySymptoms.join(',')]);

    // ─── Symptom / libido handlers (Rolling 24h Visibility) re-declared above for memo stability

    // ─── Load AI insight when phase changes (Include Symptoms/Libido) ────────
    useEffect(() => {
        if (!currentPhase || !currentDay || !isActive) return;

        // Use an authentic cooldown to prevent excessive AI regenerations
        const now = Date.now();
        if (now - aiCooldownRef.current < 120000) return; // 🚀 2min authentic cooldown

        const history = activeCycle?.period_history || [];
        loadIntimacyIntelligence(currentPhase.name, currentDay, history, coupleId, todaySymptoms, currentLibido);
        aiCooldownRef.current = now;
    }, [currentPhase?.name, currentDay, isActive, activeTab, todaySymptoms.join(','), currentLibido]);

    // ─── Write phase color to store â†’ NavbarDock picks it up ──────────────────
    useEffect(() => {
        if (currentPhase?.color) setLunaraPhaseColor(currentPhase.color);
        return () => { setLunaraPhaseColor(null); }; // clean up on unmount
    }, [currentPhase?.color]);


    // Partner's libido — visible to both
    const partnerId = couple
        ? (couple.user1_id === user?.uid ? couple.user2_id : couple.user1_id)
        : null;

    const partnerLogs = useMemo(() => partnerId ? getRolling24hLogs(partnerId, cycleLogs) : {}, [partnerId, cycleLogs, today]);
    const partnerLibido = partnerLogs.sex_drive || null;
    const partnerSymptoms: string[] = partnerLogs.symptoms || [];
    const partnerFirstName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    const handleToggleSymptom = useCallback((symptom: string) => {
        if (!user) return;
        const next = todaySymptoms.includes(symptom)
            ? todaySymptoms.filter((s: string) => s !== symptom)
            : [...todaySymptoms, symptom];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        logSymptomsOptimistic(user.uid, next);

        // 🚀 Recalculate AI context after symptom log
        loadIntimacyIntelligence(currentPhase?.name || 'Follicular', currentDay || 1, activeCycle?.period_history || [], coupleId, next, currentLibido);
    }, [todaySymptoms, user?.uid, currentPhase, currentDay, activeCycle, coupleId, currentLibido]);

    const [isCustomSymptomLoading, setIsCustomSymptomLoading] = useState(false);
    const handleAddCustomSymptom = useCallback(async () => {
        console.log("[Lunara] Add Custom Symptom pressed. Profile ID:", profile?.id);
        if (!profile?.id) {
            Alert.alert("Sync Required", "Please wait for your profile to load.");
            return;
        }
        setIsSymptomModalVisible(true);
    }, [profile?.id]);

    const handleModalAddSymptom = useCallback((val: string) => {
        const userId = profile?.id;
        if (!userId || !val.trim()) return;
        
        console.log("[Lunara] Modal adding symptom:", val);
        const next = [...todaySymptoms, val.trim()];
        logSymptomsOptimistic(userId, next);
        
        // Refresh intelligence with new symptoms
        if (coupleId) {
            loadIntimacyIntelligence(currentPhase?.name || 'Follicular', currentDay || 1, activeCycle?.period_history || [], coupleId, next, currentLibido);
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [profile?.id, todaySymptoms, currentPhase, currentDay, activeCycle, coupleId, currentLibido]);

    const handleLibidoSelect = useCallback((level: string) => {
        if (!user) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        logSexDriveOptimistic(user.uid, level);
    }, [user?.uid]);

    // ─── Period logging ───────────────────────────────────────────────────────
    const handleLogPeriod = useCallback(async () => {
        if (!coupleId || !user) return;
        const { logPeriodStart, logPeriodEnd } = await import('../../lib/auth');

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
                        const result = isCurrentlyMenstrual
                            ? await logPeriodEnd(today)
                            : await logPeriodStart(today);

                        if (result?.success) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            // Force AI refresh after period update
                            aiCooldownRef.current = 0;
                            loadIntimacyIntelligence(currentPhase?.name || 'Follicular', currentDay || 1, activeCycle?.period_history || [], coupleId, todaySymptoms, currentLibido);
                        } else {
                            Alert.alert('Error', result?.error || 'Failed to update period.');
                        }
                    } catch (e) {
                        console.error('[Lunara] Error logging period:', e);
                    } finally {
                        setIsLogging(false);
                    }
                }
            }
        ]);
    }, [coupleId, user?.uid, cycleProfile, prediction, today, currentPhase?.name, profile, setProfile]);

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
                : activeTab === 'learn' ? 'Intimacy'
                    : isFemale ? 'Partner' : 'Care';
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View>
                            <Animated.Text style={[styles.screenTitle, titleStyle]}>{screenTitle}</Animated.Text>
                            <Animated.Text style={[styles.screenSub, titleStyle]}>{screenSub}</Animated.Text>
                        </View>
                        {isFemale && (
                            <TouchableOpacity
                                onPress={() => setIsSettingsVisible(true)}
                                style={styles.settingsBtn}
                            >
                                <Settings size={22} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                        )}
                    </View>
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
                                        onAddCustomSymptom={handleAddCustomSymptom}
                                        isLogging={isLogging}
                                        formatContextualText={formatContextualText}
                                        intimacyIntel={intimacyIntel}
                                        isFemale={isFemale}
                                        PHASE_SYMPTOMS={PHASE_SYMPTOMS}
                                        coupleId={coupleId}
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
                                        coupleId={coupleId}
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
                                    coupleId={coupleId}
                                />
                            )}
                            {/* Body — both genders, libido + partner libido + intimacy */}
                            {activeTab === 'body' && (
                                <BodyTab
                                    phase={currentPhase}
                                    todaySymptoms={todaySymptoms}
                                    partnerSymptoms={partnerSymptoms}
                                    onToggleSymptom={handleToggleSymptom}
                                    onAddCustomSymptom={handleAddCustomSymptom}
                                    currentLibido={currentLibido}
                                    onLibidoSelect={handleLibidoSelect}
                                    partnerLibido={partnerLibido}
                                    partnerName={partnerFirstName}
                                    isFemale={isFemale}
                                    intimacyIntel={intimacyIntel}
                                    PHASE_SYMPTOMS={PHASE_SYMPTOMS}
                                    coupleId={coupleId}
                                />
                            )}
                            {/* Partner — female sees how to communicate phase to him; male sees care guide */}
                            {activeTab === 'partner' && (
                                <MalePartnerView
                                    partnerProfile={partnerProfile}
                                    partnerCycleProfile={cycleProfile}
                                    cycleLogs={cycleLogs}
                                    isActive={isActive && activeTabIndex === 4}
                                    intimacyIntel={intimacyIntel}
                                    isFemaleViewing={isFemale}
                                    femaleCycleDay={realCycleDay} // Pass her day for shared connection
                                    coupleId={coupleId}
                                />
                            )}
                            {activeTab === 'learn' && (
                                <LearnTab
                                    intimacyIntel={intimacyIntel}
                                    phase={currentPhase}
                                    cycleDay={realCycleDay}
                                    partnerName={partnerFirstName}
                                    formatContextualText={formatContextualText}
                                    onLogPeriod={handleLogPeriod}
                                    isLogging={isLogging}
                                    styles={tab}
                                    coupleId={coupleId}
                                    isFemale={isFemale}
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

            {isFemale && (
                <LunaraSettingsModal
                    visible={isSettingsVisible}
                    onClose={() => setIsSettingsVisible(false)}
                    onResetPersonalization={() => {
                        setIsSettingsVisible(false);
                        setLunaraOnboarding({ completed: false } as any);
                    }}
                />
            )}

            <SymptomModal 
                visible={isSymptomModalVisible}
                onClose={() => setIsSymptomModalVisible(false)}
                onAdd={handleModalAddSymptom}
            />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    settingsBtn: {
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    scroll: { flex: 1 },
    stickyPill: { position: 'absolute', left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none' },
    heroHeader: { paddingHorizontal: Spacing.md, marginBottom: 20 },
    screenTitle: GlobalStyles.standardTitle as any,
    screenSub: GlobalStyles.standardSubtitle as any,
    content: { flex: 1, paddingBottom: 20 },
});

