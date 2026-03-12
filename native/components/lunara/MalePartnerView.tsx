import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withTiming, interpolate, useSharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Heart, Sparkles, Moon, BookOpen, Flower2, Activity, ChevronDown, ChevronUp } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { GlassCard } from '../../components/GlassCard';
import { PhaseSphere } from './PhaseSphere';
import { BiologicalTimeline } from './BiologicalTimeline';
import { getTodayIST, getCycleDay, predictNextPeriod, getPhaseForDay, getPhaseWindows } from '../../lib/cycle';
import { IntimacyInsightCard } from './IntimacyInsightCard';

// ─── Static animation constants (prevent "Expected static flag" crash) ────────
const ANIM_A = FadeInDown.duration(380).delay(0);
const ANIM_B = FadeInDown.duration(380).delay(100);
const ANIM_C = FadeInDown.duration(380).delay(180);
const ANIM_D = FadeInDown.duration(380).delay(260);
const ANIM_E = FadeInDown.duration(380).delay(340);

interface MalePartnerViewProps {
    partnerProfile: any;
    partnerCycleProfile: any;
    cycleLogs: Record<string, any>;
    isActive: boolean;
    intimacyIntel?: any | null;   // IntimacyIntelligence from store
    isFemaleViewing?: boolean;    // true = female user on Partner tab
    femaleCycleDay?: number | null; // Passed to ensure shared deterministic suggestions
}

const FEMALE_COMM_TIPS: Record<string, { title: string; desc: string; emoji: string }[]> = {
    Menstrual: [
        { title: 'Share your needs', desc: 'He may not know how much you hurt — tell him how he can help', emoji: '💬' },
        { title: 'Protect your peace', desc: 'It\'s okay to ask for solitude right now', emoji: '🛡️' },
    ],
    Follicular: [
        { title: 'Invite him in', desc: 'You have peak energy — plan a date that reminds him of your spark', emoji: '✨' },
        { title: 'Be clear about goals', desc: 'Your communication is at its best. Use it to align on the future', emoji: '🌱' },
    ],
    Ovulatory: [
        { title: 'Be magnetic', desc: 'Your confidence is high. Lean into the connection', emoji: '🌟' },
        { title: 'Lead the way', desc: 'Your intuition is sharp. Suggest the next big move for you two', emoji: '👁️' },
    ],
    Luteal: [
        { title: 'Managing sensitivity', desc: 'If things feel heavy, explain that it\'s the phase, not the person', emoji: '⚓' },
        { title: 'Self-soothing', desc: 'Prioritize your rest so you have more resilience for the team', emoji: '🌙' },
    ],
};

const CONNECT_WITH_HIM: Record<string, { title: string; desc: string; emoji: string }[]> = {
    Menstrual: [
        { title: 'Quality Time', desc: 'Focus on closeness and emotional bonding today', emoji: '🫂' },
        { title: 'Soft Connection', desc: 'He appreciates your presence even when energy is low', emoji: '🪷' },
    ],
    Follicular: [
        { title: 'Spontaneous Date', desc: 'Your rising energy is magnetic — suggest a new activity', emoji: '✨' },
        { title: 'Active Fun', desc: 'Great time for a workout date or a long walk together', emoji: '👟' },
    ],
    Ovulatory: [
        { title: 'Bold Attraction', desc: 'Leaning into your social peak. A night out would be perfect', emoji: '🔥' },
        { title: 'Lead the Way', desc: 'Suggest something you\'ve both wanted to try; he\'ll love the lead', emoji: '📍' },
    ],
    Luteal: [
        { title: 'Cozy Movie Night', desc: 'A comfortable home environment feels best right now', emoji: '🎬' },
        { title: 'Deep Listening', desc: 'A perfect window for heart-to-heart conversations', emoji: '🗣️' },
    ],
};

const PARTNER_ACTIONS: Record<string, { title: string; desc: string; emoji: string }[]> = {
    Menstrual: [
        { title: 'Bring warmth', desc: 'Heating pad, her favorite snacks, warm tea', emoji: '🍵' },
        { title: 'No big plans', desc: 'Cancel obligations if you can. Just exist together', emoji: '🏠' },
        { title: 'Ask, don\'t guess', desc: '"What feels good right now?" goes a long way', emoji: '💬' },
    ],
    Follicular: [
        { title: 'Plan something new', desc: 'She\'s open to adventure — suggest a new restaurant or activity', emoji: '🌱' },
        { title: 'Have the big talk', desc: 'Her cognition and mood are at a seasonal high', emoji: '🧠' },
        { title: 'Be spontaneous', desc: 'Surprise her. It lands well in this phase', emoji: '✨' },
    ],
    Ovulatory: [
        { title: 'Go social', desc: 'She\'s magnetic right now. Plan a date night out', emoji: '🌟' },
        { title: 'Compliment her', desc: 'She\'s feeling her best. Remind her why she captivates you', emoji: '💫' },
        { title: 'Be fully present', desc: 'Put the phone away. She notices everything this week', emoji: '👁' },
    ],
    Luteal: [
        { title: 'Be the calm', desc: 'Her nervous system is heightened. Your steadiness matters', emoji: '⚓️' },
        { title: 'Listen, don\'t fix', desc: 'She wants to be heard, not problem-solved', emoji: '👂' },
        { title: 'Low-key quality time', desc: 'Movies, cooking together, quiet walks beat loud nights out', emoji: '🌙' },
    ],
};

const PREGNANCY_COLOR: Record<string, string> = {
    'Very Low': '#22c55e', 'Low': '#86efac',
    'Medium': '#fbbf24', 'High': '#f97316', 'Peak': '#ef4444',
};

function MalePartnerViewBase({
    partnerProfile, partnerCycleProfile, cycleLogs, isActive,
    intimacyIntel, isFemaleViewing = false, femaleCycleDay,
}: MalePartnerViewProps) {
    const today = getTodayIST();
    // partnerName is used below for dynamic text

    // ─── FEMALE VIEWING MALE PARTNER ─────────────────────
    const [heroImg, setHeroImg] = useState<string | null>(null);
    const [isEdExpanded, setIsEdExpanded] = useState(false);

    useEffect(() => {
        if (!isFemaleViewing) return;
        let mounted = true;
        const fetchImg = async () => {
            const cacheKey = `unsplash_male_hero_${new Date().toISOString().split('T')[0]}`;
            const cached = await AsyncStorage.getItem(cacheKey);
            if (cached) { if (mounted) setHeroImg(cached); return; }

            const key = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY?.trim();
            if (!key) return;
            try {
                const res = await fetch(`https://api.unsplash.com/photos/random?query=masculine,fitness,health,energy`, { headers: { Authorization: `Client-ID ${key}` } });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.urls?.regular && mounted) {
                        setHeroImg(data.urls.regular);
                        AsyncStorage.setItem(cacheKey, data.urls.regular).catch(() => { });
                    }
                }
            } catch (e) { }
        };
        fetchImg();
        return () => { mounted = false; };
    }, [isFemaleViewing]);

    // ─── Biological Prediction (Always based on partner's cycle data) ──────────
    const prediction = useMemo(() =>
        predictNextPeriod(
            partnerCycleProfile?.period_history || [],
            partnerCycleProfile?.avg_cycle_length || 28,
            partnerCycleProfile?.avg_period_length || 5
        ),
        [partnerCycleProfile]
    );

    const cycleDay = partnerCycleProfile?.last_period_start
        ? getCycleDay(partnerCycleProfile.last_period_start, prediction.avgCycleLength) : null;

    const phase = cycleDay
        ? getPhaseForDay(cycleDay, prediction.avgCycleLength, prediction.avgPeriodLength) : null;

    const effectiveCycleDay = isFemaleViewing ? femaleCycleDay : cycleDay;
    const effectivePhase = effectiveCycleDay
        ? getPhaseForDay(effectiveCycleDay, prediction.avgCycleLength, prediction.avgPeriodLength) : null;

    const partnerName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    // Female viewing Male partner
    if (isFemaleViewing) {
        const hisLogs = cycleLogs[partnerProfile?.uid || partnerProfile?.id]?.[today] || {};
        const hisLibido = hisLogs.sex_drive || 'low';
        const hisErection = hisLogs.erection_quality || 'Good';
        const connectTips = effectivePhase ? (CONNECT_WITH_HIM[effectivePhase.name] || []) : [];

        return (
            <View style={{ flex: 1, paddingBottom: 40 }}>
                {/* Header */}
                <Animated.View entering={ANIM_A} style={{ marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: 24 }}>
                    <Text style={{ fontSize: 32, fontFamily: Typography.serifBold, color: 'white' }}>Connection</Text>
                    <Text style={{ fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                        Shared biological resonance with {partnerName}.
                    </Text>
                </Animated.View>

                {/* His Health Section */}
                <Animated.View entering={ANIM_B}>
                    <GlassCard style={[styles.adviceCard, { marginBottom: 24 }]} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Activity size={14} color="#818cf8" />
                            <Text style={styles.adviceHeaderText}>HIS BODY TODAY</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontFamily: Typography.sansBold, color: 'white' }}>{hisLibido.toUpperCase()}</Text>
                                <Text style={{ fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>DESIRE LEVEL</Text>
                            </View>
                            <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 18, fontFamily: Typography.sansBold, color: 'white' }}>{hisErection}</Text>
                                <Text style={{ fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>ERECTION QUALITY</Text>
                            </View>
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Shared Suggestion Trio (ALL 3 types for her) */}
                <View style={{ marginBottom: 10 }}>
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="position" />
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="self-love" />
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="coaching" />
                </View>

                {/* Connect with Him Tips */}
                {connectTips.length > 0 && (
                    <Animated.View entering={ANIM_C}>
                        <GlassCard style={styles.actionsCard} intensity={10}>
                            <Text style={styles.actionsTitle}>CONNECT WITH HIM ({effectivePhase?.name.toUpperCase()})</Text>
                            {connectTips.map((a, idx) => (
                                <View key={idx} style={[styles.actionRow, idx < connectTips.length - 1 && styles.actionRowBorder]}>
                                    <Text style={styles.actionEmoji}>{a.emoji}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.actionTitle}>{a.title}</Text>
                                        <Text style={styles.actionDesc}>{a.desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </GlassCard>
                    </Animated.View>
                )}

                <Animated.View entering={ANIM_D}>
                    <GlassCard style={styles.adviceCard} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Heart size={14} color="#f472b6" />
                            <Text style={styles.adviceHeaderText}>LUNARA INSIGHT</Text>
                        </View>
                        <Text style={[styles.adviceText, { borderLeftColor: '#f472b6' }]}>
                            Based on your current phase, he'll appreciate your {effectivePhase?.energy.toLowerCase()} energy approach today.
                        </Text>
                    </GlassCard>
                </Animated.View>
            </View>
        );
    }

    // ─── MALE VIEWING FEMALE PARTNER (Original logic) ────

    const actions = phase ? (PARTNER_ACTIONS[phase.name] || []) : [];

    const timelineDays = useMemo(() => {
        if (!partnerCycleProfile?.last_period_start || !cycleDay) return [];
        return Array.from({ length: prediction.avgCycleLength }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + (i - (cycleDay - 1)));
            const day = ((cycleDay - 1 + i) % prediction.avgCycleLength) + 1;
            return {
                date: d, dayOfCycle: day,
                phase: getPhaseForDay(day, prediction.avgCycleLength, prediction.avgPeriodLength),
                isToday: i === cycleDay - 1,
                isOvulation: day === prediction.ovulationDay,
                isPeriod: day <= prediction.avgPeriodLength,
                isFertile: prediction.fertilityWindow.includes(day),
            };
        });
    }, [partnerCycleProfile, cycleDay, prediction]);

    if (!partnerCycleProfile?.last_period_start) {
        return (
            <View style={styles.noDataContainer}>
                <Moon size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.noDataTitle}>Awaiting {partnerName}'s data</Text>
                <Text style={styles.noDataSub}>
                    Lunara will show partner insights once {partnerName} sets up their cycle profile.
                </Text>
            </View>
        );
    }

    const pColor = PREGNANCY_COLOR[intimacyIntel?.pregnancyChance || 'Low'] || '#86efac';

    return (
        <View style={{ flex: 1 }}>
            {/* Phase sphere removed per user request */}

            {/* Phase banner */}
            {phase && cycleDay && (
                <Animated.View entering={ANIM_A} style={[styles.phaseBanner, { borderColor: `${phase.color}40` }]}>
                    <View style={styles.phaseBannerLeft}>
                        <Text style={[styles.phaseName, { color: phase.color }]}>{phase.name} Phase</Text>
                        <Text style={styles.phaseDay}>
                            {partnerName} · Day {cycleDay} of {prediction.avgCycleLength}
                        </Text>
                    </View>
                    <View style={styles.energyPill}>
                        <Text style={styles.energyText}>{phase.energy} Energy</Text>
                    </View>
                </Animated.View>
            )}

            {/* Timeline */}
            {timelineDays.length > 0 && (
                <BiologicalTimeline
                    days={timelineDays}
                    selectedDay={cycleDay || 1}
                    onSelectDay={() => { }}
                />
            )}

            {/* Care guide + partner advice */}
            {phase && (
                <Animated.View entering={ANIM_B}>
                    <GlassCard style={styles.adviceCard} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Heart size={14} color={phase.color} />
                            <Text style={styles.adviceHeaderText}>
                                WHAT SHE NEEDS TODAY
                            </Text>
                        </View>
                        <Text style={[styles.adviceText, { borderLeftColor: phase.color }]}>
                            {intimacyIntel?.partnerIntimacyGuide || phase.partnerAdvice}
                        </Text>
                    </GlassCard>
                </Animated.View>
            )}

            {/* Micro-actions / Communication Tips */}
            {actions.length > 0 && (
                <Animated.View entering={ANIM_C}>
                    <GlassCard style={styles.actionsCard} intensity={10}>
                        <Text style={styles.actionsTitle}>YOUR MOVES TODAY</Text>
                        {actions.map((a, idx) => (
                            <View key={idx} style={[styles.actionRow, idx < actions.length - 1 && styles.actionRowBorder]}>
                                <Text style={styles.actionEmoji}>{a.emoji}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.actionTitle}>{a.title}</Text>
                                    <Text style={styles.actionDesc}>{a.desc}</Text>
                                </View>
                            </View>
                        ))}
                    </GlassCard>
                </Animated.View>
            )}

            {/* Intimacy Insights (Male viewing Female - Only Position & Coaching) */}
            {effectivePhase && (
                <View style={{ marginTop: 10 }}>
                    <IntimacyInsightCard phaseName={effectivePhase.name} cycleDay={effectiveCycleDay} type="position" />
                    <IntimacyInsightCard phaseName={effectivePhase.name} cycleDay={effectiveCycleDay} type="coaching" />
                </View>
            )}

            {/* Next period prediction */}
            {prediction.predictedDate !== '—' && (
                <Animated.View entering={ANIM_D} style={styles.predRow}>
                    <Sparkles size={12} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.predText}>
                        {partnerName}'s next period:{' '}
                        <Text style={{ color: 'white' }}>{prediction.predictedDate}</Text>
                        {'  ·  '}
                        <Text style={{ color: 'rgba(255,255,255,0.4)' }}>{Math.max(0, prediction.daysUntil)} days away</Text>
                    </Text>
                </Animated.View>
            )}
        </View>
    );
}

export const MalePartnerView = MalePartnerViewBase;

const styles = StyleSheet.create({
    noDataContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
    noDataTitle: { fontSize: 20, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.5)' },
    noDataSub: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 20 },

    phaseBanner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginHorizontal: Spacing.md, marginBottom: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.xl,
        borderWidth: 1, padding: 18,
    },
    phaseBannerLeft: { gap: 4 },
    phaseName: { fontSize: 22, fontFamily: Typography.serifBold },
    phaseDay: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)' },
    energyPill: { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
    energyText: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 },

    adviceCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 20, borderRadius: Radius.xl },
    adviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    adviceHeaderText: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, flex: 1 },
    adviceText: { fontSize: 17, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.85)', lineHeight: 28, borderLeftWidth: 2, paddingLeft: 14 },

    // Intimacy notes
    intelNote: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    intelNoteLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.25)', letterSpacing: 1.5, marginBottom: 8 },
    intelNoteText: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },

    // Fertility pill
    pregnancyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1, marginLeft: 'auto' },
    pregnancyDot: { width: 6, height: 6, borderRadius: 3 },
    pregnancyPillText: { fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 0.5 },

    // Forecast
    forecastRow: { gap: 6 },
    forecastLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.25)', letterSpacing: 1.5 },
    forecastValue: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.65)', lineHeight: 22 },

    // AI badge
    aiBadge: { marginLeft: 'auto', backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
    aiBadgeText: { fontSize: 8, fontFamily: Typography.sansBold, color: '#d8b4fe', letterSpacing: 1 },

    // Actions
    actionsCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 20, borderRadius: Radius.xl },
    actionsTitle: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 20 },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingBottom: 16, marginBottom: 16 },
    actionRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    actionEmoji: { fontSize: 22, width: 32 },
    actionTitle: { fontSize: 15, fontFamily: Typography.sansBold, color: 'white', marginBottom: 4 },
    actionDesc: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.45)', lineHeight: 20 },

    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
    },
    predRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, marginTop: 4, marginBottom: Spacing.md },
    predText: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)' },
});
