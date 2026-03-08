import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, Alert
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
    interpolate, Extrapolate, withTiming, Easing, withSpring
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Moon, Sparkles, Heart, Calendar, Shield, Flame, Settings, ChevronRight, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { auth, db } from '../../lib/firebase';
import {
    doc, updateDoc, setDoc, serverTimestamp,
    collection, query, where, getDocs, orderBy, limit, onSnapshot
} from 'firebase/firestore';
import { useOrbitStore } from '../../lib/store';
import { Colors, Spacing, Typography, Radius } from '../../constants/Theme';
import { GlassCard } from '../../components/GlassCard';
import { HeaderPill } from '../../components/HeaderPill';

const { width } = Dimensions.get('window');

// ─── Cycle logic (mirrors web) ────────────────────────────────────────────────

function getTodayIST(): string {
    const now = new Date();
    // Adjust to IST (UTC+5:30)
    const offset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + offset);
    return ist.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getCycleDay(lastPeriodStart: string, avgCycleLength = 28): number {
    const last = new Date(lastPeriodStart);
    const today = new Date(getTodayIST());
    const diffMs = today.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return (diffDays % avgCycleLength) + 1;
}

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

function getDaysUntilNextPeriod(lastPeriodStart: string, avgCycleLength = 28): number {
    const currentDay = getCycleDay(lastPeriodStart, avgCycleLength);
    return avgCycleLength - currentDay + 1;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function LunaraScreen() {
    const { profile, partnerProfile, couple, cycleLogs } = useOrbitStore();
    const insets = useSafeAreaInsets();

    const [cycleProfile, setCycleProfile] = useState<any>(null);
    const [partnerCycleProfile, setPartnerCycleProfile] = useState<any>(null);
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
    const [isLogging, setIsLogging] = useState(false);
    const [supportLogs, setSupportLogs] = useState<any[]>([]);

    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (e) => { scrollOffset.value = e.contentOffset.y; }
    });

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [60, 90], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [60, 90], [10, 0], Extrapolate.CLAMP) }]
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

        // Own cycle profile
        const ownRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
        const unsubOwn = onSnapshot(ownRef, (snap) => {
            if (snap.exists()) setCycleProfile(snap.data());
        });

        // Partner cycle profile
        if (partnerId) {
            const partnerRef = doc(db, 'couples', coupleId, 'cycle_profiles', partnerId);
            const unsubPartner = onSnapshot(partnerRef, (snap) => {
                if (snap.exists()) setPartnerCycleProfile(snap.data());
            });
            return () => { unsubOwn(); unsubPartner(); };
        }

        return unsubOwn;
    }, [coupleId, user?.uid, partnerId]);

    // Load today's logged symptoms
    useEffect(() => {
        if (!coupleId || !user) return;
        const today = getTodayIST();
        const logRef = doc(db, 'couples', coupleId, 'cycle_logs', `${user.uid}_${today}`);
        const unsub = onSnapshot(logRef, (snap) => {
            if (snap.exists()) setSelectedSymptoms(snap.data().symptoms || []);
        });
        return unsub;
    }, [coupleId, user?.uid]);

    // ─── Actions ─────────────────────────────────────────────────────────────

    const handleLogPeriod = async () => {
        if (!coupleId || !user) return;
        setIsLogging(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        const today = getTodayIST();
        try {
            await setDoc(
                doc(db, 'couples', coupleId, 'cycle_profiles', user.uid),
                {
                    user_id: user.uid,
                    last_period_start: today,
                    avg_cycle_length: cycleProfile?.avg_cycle_length || 28,
                    avg_period_length: cycleProfile?.avg_period_length || 5,
                    sharing_enabled: cycleProfile?.sharing_enabled ?? true,
                    updated_at: serverTimestamp(),
                },
                { merge: true }
            );
        } catch (e) {
            console.error('[LUNARA] logPeriod error', e);
        } finally {
            setIsLogging(false);
        }
    };

    const handleToggleSymptom = useCallback(async (symptom: string) => {
        if (!coupleId || !user) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const today = getTodayIST();
        const next = selectedSymptoms.includes(symptom)
            ? selectedSymptoms.filter(s => s !== symptom)
            : [...selectedSymptoms, symptom];
        setSelectedSymptoms(next); // optimistic
        try {
            await setDoc(
                doc(db, 'couples', coupleId, 'cycle_logs', `${user.uid}_${today}`),
                {
                    user_id: user.uid,
                    log_date: today,
                    symptoms: next,
                    updated_at: serverTimestamp(),
                },
                { merge: true }
            );
        } catch (e) {
            console.error('[LUNARA] symptom log error', e);
            setSelectedSymptoms(selectedSymptoms); // revert
        }
    }, [selectedSymptoms, coupleId, user]);

    // ─── Derive display data ──────────────────────────────────────────────────

    // For female: use own cycle. For male: use partner's (if sharing enabled).
    const activeCycle = isFemale ? cycleProfile : (partnerCycleProfile?.sharing_enabled ? partnerCycleProfile : null);
    const currentDay = activeCycle?.last_period_start
        ? getCycleDay(activeCycle.last_period_start, activeCycle.avg_cycle_length)
        : null;
    const phase = currentDay ? getPhaseInfo(currentDay) : null;
    const daysUntilNext = activeCycle?.last_period_start
        ? getDaysUntilNextPeriod(activeCycle.last_period_start, activeCycle.avg_cycle_length)
        : null;
    const suggestedSymptoms = currentDay ? getSuggestedSymptoms(currentDay) : [];

    // Today's partner log (for male users seeing partner data)
    const today = getTodayIST();
    const partnerLog = cycleLogs && partnerId
        ? Object.values(cycleLogs[partnerId] || {}).find((l: any) => l.log_date === today)
        : null;

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Sticky HeaderPill */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Lunara" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 56 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero Brand Header ──────────────────────────────────── */}
                <View style={styles.hero}>
                    <View style={styles.heroBadge}>
                        <Sparkles size={10} color="#c084fc" />
                        <Text style={styles.heroBadgeText}>LUNARA SYNC</Text>
                    </View>
                    <Text style={styles.heroTitle}>
                        {isFemale ? 'Your Natural' : 'Her Natural'}
                        {'\n'}
                        <Text style={styles.heroAccent}>Flow & Rhythm</Text>
                    </Text>
                </View>

                {/* ── Main Cycle Orb ─────────────────────────────────────── */}
                <GlassCard style={styles.orbCard} intensity={12}>
                    {/* Phase accent line */}
                    <View style={[styles.phaseBar, { backgroundColor: phase?.color || '#a855f7' }]} />

                    <View style={styles.orb}>
                        <View style={[styles.orbRing, { borderColor: (phase?.color || '#a855f7') + '22' }]} />
                        <View style={[styles.orbInnerRing, { borderColor: (phase?.color || '#a855f7') + '44' }]} />
                        <View style={styles.orbContent}>
                            <Moon size={36} color={phase?.color || '#a855f7'} />
                            <Text style={styles.orbDay}>
                                {currentDay ? `Day ${currentDay}` : (isFemale ? 'Start Tracking' : 'Awaiting Sync')}
                            </Text>
                            {currentDay && (
                                <Text style={[styles.orbPhase, { color: phase?.color || '#a855f7' }]}>
                                    {phase?.name.toUpperCase()}
                                </Text>
                            )}
                            {activeCycle?.last_period_start && (
                                <Text style={styles.orbDate}>
                                    Since {activeCycle.last_period_start}
                                </Text>
                            )}
                        </View>
                    </View>

                    {/* CTA Buttons */}
                    <View style={styles.ctaRow}>
                        {isFemale ? (
                            <TouchableOpacity
                                style={[styles.ctaBtn, isLogging && styles.ctaBtnDisabled]}
                                onPress={handleLogPeriod}
                                disabled={isLogging}
                            >
                                <Calendar size={14} color="#c084fc" />
                                <Text style={styles.ctaBtnText}>
                                    {isLogging ? 'Logging...' : 'Log Period Start'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.ctaBtn}>
                                <Heart size={14} color="#fb7185" />
                                <Text style={[styles.ctaBtnText, { color: '#fb7185' }]}>
                                    {partnerCycleProfile?.sharing_enabled ? 'Partner Sync Active' : 'Sharing Paused'}
                                </Text>
                            </View>
                        )}
                    </View>
                </GlassCard>

                {/* ── Quick Stats Row ─────────────────────────────────────── */}
                <View style={styles.statsRow}>
                    <GlassCard style={styles.statCard} intensity={10}>
                        <Calendar size={18} color="#a855f7" />
                        <Text style={styles.statValue}>
                            {daysUntilNext !== null ? `${daysUntilNext}d` : '—'}
                        </Text>
                        <Text style={styles.statLabel}>Next Period</Text>
                    </GlassCard>
                    <GlassCard style={styles.statCard} intensity={10}>
                        <Moon size={18} color="#818cf8" />
                        <Text style={styles.statValue}>
                            {activeCycle?.avg_cycle_length || 28}
                        </Text>
                        <Text style={styles.statLabel}>Cycle Days</Text>
                    </GlassCard>
                    <GlassCard style={styles.statCard} intensity={10}>
                        <Sparkles size={18} color="#fb7185" />
                        <Text style={styles.statValue}>
                            {activeCycle?.avg_period_length || 5}
                        </Text>
                        <Text style={styles.statLabel}>Period Days</Text>
                    </GlassCard>
                </View>

                {/* ── Daily Insight ───────────────────────────────────────── */}
                {phase && (
                    <GlassCard style={styles.insightCard} intensity={10}>
                        <View style={styles.insightHeader}>
                            <Shield size={14} color="rgba(168,85,247,0.5)" />
                            <Text style={styles.insightLabel}>
                                {isFemale ? 'DAILY INSIGHT' : 'PARTNER ADVICE'}
                            </Text>
                        </View>
                        <Text style={styles.insightText}>
                            {isFemale ? phase.advice : phase.partnerAdvice}
                        </Text>
                    </GlassCard>
                )}

                {/* ── Symptom Tracker (female only) ───────────────────────── */}
                {isFemale && currentDay && (
                    <GlassCard style={styles.symptomsCard} intensity={10}>
                        <Text style={styles.sectionTitle}>HOW ARE YOU FEELING?</Text>
                        <View style={styles.chipGrid}>
                            {suggestedSymptoms.map(symptom => {
                                const isSelected = selectedSymptoms.includes(symptom);
                                return (
                                    <TouchableOpacity
                                        key={symptom}
                                        onPress={() => handleToggleSymptom(symptom)}
                                        style={[
                                            styles.chip,
                                            isSelected && { backgroundColor: 'rgba(168,85,247,0.25)', borderColor: '#a855f7' }
                                        ]}
                                    >
                                        <Text style={[styles.chipText, isSelected && { color: '#c084fc' }]}>
                                            {symptom}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </GlassCard>
                )}

                {/* ── Partner Symptoms (male view) ─────────────────────────── */}
                {!isFemale && partnerCycleProfile?.sharing_enabled && (
                    <GlassCard style={styles.symptomsCard} intensity={10}>
                        <Text style={styles.sectionTitle}>HER SYMPTOMS TODAY</Text>
                        <View style={styles.chipGrid}>
                            {(() => {
                                const partnerTodayLog = cycleLogs && partnerId
                                    ? cycleLogs[partnerId]?.[today]
                                    : null;
                                const symptoms = partnerTodayLog?.symptoms || [];
                                return symptoms.length > 0
                                    ? symptoms.map((s: string) => (
                                        <View key={s} style={[styles.chip, { backgroundColor: 'rgba(251,113,133,0.15)', borderColor: 'rgba(251,113,133,0.4)' }]}>
                                            <Text style={[styles.chipText, { color: '#fb7185' }]}>{s}</Text>
                                        </View>
                                    ))
                                    : <Text style={styles.emptyText}>No symptoms shared yet today</Text>;
                            })()}
                        </View>
                    </GlassCard>
                )}

                {/* ── No Data / Onboarding nudge ───────────────────────────── */}
                {isFemale && !cycleProfile?.last_period_start && (
                    <GlassCard style={styles.onboardCard} intensity={10}>
                        <Info size={20} color="#a855f7" />
                        <Text style={styles.onboardTitle}>Start Your Cycle Journal</Text>
                        <Text style={styles.onboardSub}>
                            Tap "Log Period Start" above to begin tracking your rhythm.
                            Your insights will appear here.
                        </Text>
                    </GlassCard>
                )}

                <View style={{ height: 120 }} />
            </Animated.ScrollView>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    stickyHeader: {
        position: 'absolute', left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none'
    },
    scroll: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

    // Hero
    hero: { marginBottom: Spacing.lg },
    heroBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 999, marginBottom: 12,
        backgroundColor: 'rgba(168,85,247,0.1)',
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
    },
    heroBadgeText: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: '#c084fc', letterSpacing: 2,
    },
    heroTitle: {
        fontSize: 36, fontFamily: Typography.serif,
        color: 'white', lineHeight: 42,
    },
    heroAccent: {
        fontFamily: Typography.serifItalic,
        color: '#c084fc',
    },

    // Orb card
    orbCard: {
        marginBottom: Spacing.md, borderRadius: Radius.xl,
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)',
        overflow: 'hidden', position: 'relative', padding: 0,
    },
    phaseBar: { height: 3, width: '100%', opacity: 0.7 },
    orb: {
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: Spacing.xl, position: 'relative',
    },
    orbRing: {
        position: 'absolute', width: 200, height: 200,
        borderRadius: 100, borderWidth: 3, borderStyle: 'dashed',
    },
    orbInnerRing: {
        position: 'absolute', width: 160, height: 160,
        borderRadius: 80, borderWidth: 1,
    },
    orbContent: { alignItems: 'center', gap: 6 },
    orbDay: {
        fontSize: 44, fontFamily: Typography.serif, color: 'white',
        marginTop: 8,
    },
    orbPhase: {
        fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 3,
    },
    orbDate: {
        fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.3)',
    },
    ctaRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, alignItems: 'center' },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 10,
        borderRadius: 999, borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.3)',
        backgroundColor: 'rgba(168,85,247,0.08)',
    },
    ctaBtnDisabled: { opacity: 0.5 },
    ctaBtnText: {
        color: '#c084fc', fontSize: 12, fontFamily: Typography.sansBold,
        letterSpacing: 1, textTransform: 'uppercase',
    },

    // Stats
    statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    statCard: {
        flex: 1, alignItems: 'center', padding: Spacing.md,
        borderRadius: Radius.xl, gap: 4,
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
    },
    statValue: {
        fontSize: 24, fontFamily: Typography.serif, color: 'white',
    },
    statLabel: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase',
    },

    // Insight
    insightCard: {
        marginBottom: Spacing.md, padding: Spacing.lg,
        borderRadius: Radius.xl, borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
    },
    insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    insightLabel: {
        fontSize: 9, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)', letterSpacing: 2,
    },
    insightText: {
        fontSize: 16, fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.85)', lineHeight: 26,
    },

    // Symptoms
    symptomsCard: {
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
        color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5,
    },
    emptyText: {
        fontSize: 12, fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.2)',
    },

    // Onboard nudge
    onboardCard: {
        marginBottom: Spacing.md, padding: Spacing.xl,
        borderRadius: Radius.xl, borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.15)', alignItems: 'center', gap: 12,
        borderStyle: 'dashed',
    },
    onboardTitle: {
        fontSize: 18, fontFamily: Typography.serif, color: 'white',
    },
    onboardSub: {
        fontSize: 13, fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 20,
    },
});
