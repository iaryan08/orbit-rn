import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Heart, Sparkles, Moon, Brain } from 'lucide-react-native';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { GlassCard } from '../../components/GlassCard';
import { BiologicalTimeline } from './BiologicalTimeline';
import { getTodayIST, getCycleDay, predictNextPeriod, getPhaseForDay } from '../../lib/cycle';
import { IntimacyInsightCard } from './IntimacyInsightCard';
import { useOrbitStore } from '../../lib/store';

// Android-only app: entering animations crash — set to undefined
const ANIM_A = undefined;
const ANIM_B = undefined;
const ANIM_C = undefined;
const ANIM_D = undefined;

interface MalePartnerViewProps {
    partnerProfile: any;
    partnerCycleProfile: any;
    cycleLogs: Record<string, any>;
    isActive: boolean;
    intimacyIntel?: any | null;
    isFemaleViewing?: boolean;
    femaleCycleDay?: number | null;
}

const PREGNANCY_COLOR: Record<string, string> = {
    'Very Low': '#22c55e', 'Low': '#86efac',
    'Medium': '#fbbf24', 'High': '#f97316', 'Peak': '#ef4444',
};

function MalePartnerViewBase({
    partnerProfile, partnerCycleProfile, cycleLogs, isActive,
    intimacyIntel, isFemaleViewing = false, femaleCycleDay,
}: MalePartnerViewProps) {
    const today = getTodayIST();
    // Use separate selectors — object literal selector creates new ref every render → infinite loop
    const partnerIntel = useOrbitStore(s => s.partnerIntel);
    const loadPartnerIntelligence = useOrbitStore(s => s.loadPartnerIntelligence);

    // ─── Biological Prediction ────────────────────────────────────────────────
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
    const viewerGender: 'male' | 'female' = isFemaleViewing ? 'female' : 'male';

    // Load AI partner intel once per day — use primitive deps only to avoid infinite loops
    const effectivePhaseName = effectivePhase?.name ?? null;
    useEffect(() => {
        if (!effectivePhaseName || !effectiveCycleDay) return;
        loadPartnerIntelligence(effectivePhaseName, effectiveCycleDay, viewerGender, partnerName);
    }, [effectivePhaseName, effectiveCycleDay, viewerGender]);

    // ─── FEMALE VIEWING MALE PARTNER ─────────────────────────────────────────
    if (isFemaleViewing) {
        const hisLogs = cycleLogs[partnerProfile?.uid || partnerProfile?.id]?.[today] || {};
        const hisLibido = hisLogs.sex_drive || 'low';
        const hisErection = hisLogs.erection_quality || 'Good';

        return (
            <View style={{ flex: 1, paddingBottom: 40 }}>
                <Animated.View entering={ANIM_A} style={{ marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: 24 }}>
                </Animated.View>

                {/* His Health Section */}
                <Animated.View entering={ANIM_B}>
                    <GlassCard style={[styles.adviceCard, { marginBottom: 24 }]} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Brain size={14} color="#818cf8" />
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

                {/* AI-Generated Partner Intelligence */}
                {partnerIntel && partnerIntel.viewerGender === 'female' && (
                    <Animated.View entering={ANIM_C}>
                        <GlassCard style={styles.intelCard} intensity={10}>
                            <View style={styles.adviceHeader}>
                                <Sparkles size={14} color="#c084fc" />
                                <Text style={styles.adviceHeaderText}>YOUR ENERGY TODAY</Text>
                                {partnerIntel.source === 'ai' && (
                                    <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
                                )}
                            </View>
                            <Text style={styles.intelHeadline}>{partnerIntel.headline}</Text>
                            <Text style={styles.intelAdvice}>{partnerIntel.primaryAdvice}</Text>

                            {partnerIntel.microActions.length > 0 && (
                                <View style={styles.microActionsBox}>
                                    {partnerIntel.microActions.map((a, idx) => (
                                        <View key={idx} style={[styles.actionRow, idx < partnerIntel.microActions.length - 1 && styles.actionRowBorder]}>
                                            <Text style={styles.actionEmoji}>{a.emoji}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.actionTitle}>{a.title}</Text>
                                                <Text style={styles.actionDesc}>{a.desc}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <View style={styles.intimacyNote}>
                                <Text style={styles.intimacyNoteText}>✦ {partnerIntel.intimacyNote}</Text>
                            </View>
                        </GlassCard>
                    </Animated.View>
                )}

                {/* IntimacyInsightCards — position kept same, coaching female-specific */}
                <View style={{ marginBottom: 10 }}>
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="position" />
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="self-love" />
                    <IntimacyInsightCard phaseName={effectivePhase?.name || "Follicular"} cycleDay={effectiveCycleDay} type="coaching" />
                </View>
            </View>
        );
    }

    // ─── MALE VIEWING FEMALE PARTNER ─────────────────────────────────────────
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

    return (
        <View style={{ flex: 1 }}>
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

            {/* AI-Generated Partner Intelligence */}
            {partnerIntel && partnerIntel.viewerGender === 'male' && phase && (
                <Animated.View entering={ANIM_B}>
                    <GlassCard style={styles.intelCard} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Heart size={14} color={phase.color} />
                            <Text style={styles.adviceHeaderText}>PARTNER INTELLIGENCE</Text>
                            {partnerIntel.source === 'ai' && (
                                <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
                            )}
                        </View>
                        <Text style={styles.intelHeadline}>{partnerIntel.headline}</Text>
                        <Text style={[styles.intelAdvice, { borderLeftColor: phase.color }]}>{partnerIntel.primaryAdvice}</Text>

                        {partnerIntel.microActions.length > 0 && (
                            <View style={styles.microActionsBox}>
                                {partnerIntel.microActions.map((a, idx) => (
                                    <View key={idx} style={[styles.actionRow, idx < partnerIntel.microActions.length - 1 && styles.actionRowBorder]}>
                                        <Text style={styles.actionEmoji}>{a.emoji}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.actionTitle}>{a.title}</Text>
                                            <Text style={styles.actionDesc}>{a.desc}</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={styles.intimacyNote}>
                            <Text style={styles.intimacyNoteText}>✦ {partnerIntel.intimacyNote}</Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            )}

            {/* IntimacyInsightCards — position same, coaching male-specific */}
            {effectivePhase && (
                <View style={{ marginTop: 8 }}>
                    <IntimacyInsightCard phaseName={effectivePhase.name} cycleDay={effectiveCycleDay} type="position" />
                    <IntimacyInsightCard phaseName={effectivePhase.name} cycleDay={effectiveCycleDay} type="coaching" isMale={true} />
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
        backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: Radius.xl,
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', padding: 18,
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

    // AI Intel Card
    intelCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 22, borderRadius: 24 },
    intelHeadline: { fontSize: 20, fontFamily: Typography.serifBold, color: 'white', marginBottom: 10 },
    intelAdvice: { fontSize: 15, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.8)', lineHeight: 24, marginBottom: 20, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 14 },

    microActionsBox: { marginBottom: 16 },
    actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingBottom: 14, marginBottom: 14 },
    actionRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
    actionEmoji: { fontSize: 20, width: 30 },
    actionTitle: { fontSize: 14, fontFamily: Typography.sansBold, color: 'white', marginBottom: 3 },
    actionDesc: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.45)', lineHeight: 19 },

    intimacyNote: { paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
    intimacyNoteText: { fontSize: 12, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },

    aiBadge: { marginLeft: 'auto', backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
    aiBadgeText: { fontSize: 8, fontFamily: Typography.sansBold, color: '#d8b4fe', letterSpacing: 1 },

    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1 },
    predRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, marginTop: 4, marginBottom: Spacing.md },
    predText: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)' },
});
