import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { ShieldAlert, TrendingUp, Droplets, Sparkles, Heart } from 'lucide-react-native';
import { GlassCard } from '../GlassCard';
import { DailyInsightCard } from './DailyInsightCard';
import { AIHealthAssistant } from './AIHealthAssistant';
import { IntimacyInsightCard } from './IntimacyInsightCard';
import { Spacing, Radius, Typography } from '../../constants/Theme';
import { PhaseSphere } from './PhaseSphere';
import { BiologicalTimeline } from './BiologicalTimeline';
import { CycleSummaryBanner } from './CycleSummaryBanner';
import { FADE_IN, FADE_IN_DOWN_1, FADE_IN_DOWN_2, FADE_IN_DOWN_3, tab } from './tabStyles';

export const TodayTab = React.memo(({
    cycleDay,
    phase,
    prediction,
    dailyInsight,
    isLoadingInsight,
    intimacyIntel,
    todaySymptoms,
    formatContextualText,
    timelineDays,
    selectedDay,
    onSelectDay,
    onLogPeriod,
    onAddCustomSymptom,
    isLogging,
    coupleId,
}: any) => {
    if (!phase) {
        return (
            <View style={tab.empty}>
                <Text style={tab.emptyTitle}>No cycle data yet</Text>
                <Text style={tab.emptySub}>Log your period to unlock cycle tracking & daily insights.</Text>
                <TouchableOpacity 
                    activeOpacity={0.7}
                    style={tab.emptyBtn} 
                    onPress={onLogPeriod}
                >
                    <Text style={tab.emptyBtnText}>Log Period Started Today</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View>
            <View style={tab.phaseHero}>
                <PhaseSphere phase={phase.name} intensity={0.8} isActive={true} />
                <Text style={[tab.phaseTitle, { color: phase.color }]}>{phase.name} Phase</Text>
                <Text style={tab.phaseDay}>Day {cycleDay} · {phase.energy} Energy</Text>

                {/* Sub-hero metadata row (Reintegrated) */}
                <View style={tab.dataRow}>
                    <View style={[tab.confidenceBadge, { borderColor: prediction?.confidence === 'High' ? '#34d399' : '#fbbf24' }]}>
                        <TrendingUp size={10} color={prediction?.confidence === 'High' ? '#34d399' : '#fbbf24'} />
                        <Text style={[tab.confidenceText, { color: prediction?.confidence === 'High' ? '#34d399' : '#fbbf24' }]}>
                            {prediction?.confidence === 'High' ? 'LOCKED' : 'CALIBRATING'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onLogPeriod}
                        disabled={isLogging}
                        style={[
                            tab.miniLogBtn,
                            { opacity: isLogging ? 0.6 : 1 }
                        ]}
                    >
                        <Droplets size={12} color="#fb7185" />
                        <Text style={tab.miniLogText}>
                            {isLogging ? 'LOGGING...' : (phase?.name === 'Menstrual' ? 'END PERIOD' : 'LOG PERIOD')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <BiologicalTimeline
                days={timelineDays}
                selectedDay={selectedDay || cycleDay || 1}
                onSelectDay={onSelectDay}
            />

            {/* PMS Alert Banner */}
            {phase.name === 'Luteal' && prediction && prediction.daysUntil <= 4 && (
                <View style={tab.pmsBanner}>
                    <ShieldAlert size={14} color="#fcd34d" />
                    <Text style={tab.pmsText}>Upcoming PMS window predicted. Prioritize rest.</Text>
                </View>
            )}

            {/* Logged Today Quick View */}
            <Animated.View entering={FADE_IN_DOWN_1}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.md, gap: 10, marginBottom: 16 }}>
                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {todaySymptoms.length > 0 ? (
                            todaySymptoms.slice(0, 3).map((s: string) => (
                                <View key={s} style={tab.miniChip}>
                                    <Text style={tab.miniChipText}>{s}</Text>
                                </View>
                            ))
                        ) : (
                            <Text style={[tab.emptySub, { marginBottom: 0 }]}>No feelings logged yet</Text>
                        )}
                        {todaySymptoms.length > 3 && (
                            <View style={tab.miniChip}>
                                <Text style={tab.miniChipText}>+{todaySymptoms.length - 3}</Text>
                            </View>
                        )}
                    </View>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onAddCustomSymptom}
                        style={tab.miniAddBtn}
                    >
                        <Heart size={12} color="#fb7185" />
                        <Text style={tab.miniAddBtnText}>ADD</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>

            <DailyInsightCard insight={dailyInsight} isLoading={isLoadingInsight} phaseColor={phase.color} />

            {/* AI-Generated Energy/Partner Intelligence (Female viewer info moved here) */}
            {intimacyIntel && intimacyIntel.viewerGender === 'female' && (
                <Animated.View entering={FADE_IN_DOWN_2}>
                    <GlassCard style={styles.intelCard} intensity={10}>
                        <View style={styles.adviceHeader}>
                            <Sparkles size={14} color="#c084fc" />
                            <Text style={styles.adviceHeaderText}>YOUR ENERGY TODAY</Text>
                            {intimacyIntel.source === 'ai' && (
                                <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
                            )}
                        </View>
                        <Text style={styles.intelHeadline}>{intimacyIntel.headline}</Text>
                        <Text style={[styles.intelAdvice, { borderLeftColor: phase.color }]}>{intimacyIntel.primaryAdvice}</Text>

                        <View style={styles.microActionGrid}>
                            {intimacyIntel.microActions.map((a: any, idx: number) => (
                                <View key={idx} style={styles.microActionCard}>
                                    <View style={styles.microActionSparkle}>
                                        <Sparkles size={10} color={phase.color} />
                                    </View>
                                    <Text style={styles.microActionEmoji}>{a.emoji}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.microActionTitle}>{a.title}</Text>
                                        <Text style={styles.microActionDesc}>{a.desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <View style={styles.intimacyNote}>
                            <Text style={styles.intimacyNoteText}>✧ {intimacyIntel.intimacyNote}</Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            )}

            <AIHealthAssistant
                symptoms={todaySymptoms}
                phase={phase.name}
                conditionAssessment={intimacyIntel?.conditionAssessment}
                advice={dailyInsight?.recommendation}
                isLoading={isLoadingInsight}
            />

            {/* Quick Connect Rituals (Flo-inspired Quick Win) */}
            <Animated.View entering={FADE_IN_DOWN_3}>
                <GlassCard style={[styles.intelCard, { marginTop: 10 }]} intensity={10}>
                    <View style={styles.adviceHeader}>
                        <Heart size={14} color="#fb7185" />
                        <Text style={styles.adviceHeaderText}>QUICK CONNECT RITUAL</Text>
                    </View>

                    {(() => {
                        const rituals = [
                            { title: 'The 6-Second Kiss', desc: 'A long enough kiss to release oxytocin and reset your nervous systems together.', emoji: '💋' },
                            { title: 'Synchronized Breathing', desc: 'Sit back-to-back and try to align your breath for 2 minutes.', emoji: '🪷' },
                            { title: 'Soul Gazing', desc: 'Set a timer for 60 seconds and simply look into each other\'s eyes without speaking.', emoji: '👁️' },
                            { title: 'Appreciation Swap', desc: 'Tell your partner 3 specific things you appreciated about them today.', emoji: '🙏' },
                            { title: 'The 20-Second Hug', desc: 'A long, full-body embrace to signal safety to your lizard brains.', emoji: '🫂' }
                        ];
                        const daySeed = new Date().getDate() % rituals.length;
                        const ritual = rituals[daySeed];

                        return (
                            <View style={tab.foodRow}>
                                <Text style={tab.foodEmoji}>{ritual.emoji}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={tab.foodName}>{ritual.title}</Text>
                                    <Text style={tab.foodBenefit}>{ritual.desc}</Text>
                                </View>
                            </View>
                        );
                    })()}

                    <View style={[styles.intimacyNote, { marginTop: 12 }]}>
                        <Text style={styles.intimacyNoteText}>
                            ✦ Small moments of intentional connection prevent relationship "drift" during busy weeks.
                        </Text>
                    </View>
                </GlassCard>
            </Animated.View>

        </View>
    );
});

import { StyleSheet } from 'react-native';
const styles = StyleSheet.create({
    intelCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.xl, padding: 20, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    adviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    adviceHeaderText: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, flex: 1 },
    intelHeadline: { fontSize: 20, fontFamily: Typography.display, color: 'white', marginBottom: 10 },
    intelAdvice: { fontSize: 16, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.92)', lineHeight: 26, marginBottom: 20, borderLeftWidth: 2, paddingLeft: 14 },
    microActionGrid: { flexDirection: 'column', gap: 12, marginBottom: 20 },
    microActionCard: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 20, paddingLeft: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
    microActionSparkle: { position: 'absolute', top: 10, left: 10, opacity: 0.5 },
    microActionEmoji: { fontSize: 28 },
    microActionTitle: { fontSize: 16, fontFamily: Typography.sansBold, color: '#FFFFFF', marginBottom: 4 },
    microActionDesc: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
    intimacyNote: { paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
    intimacyNoteText: { fontSize: 13, fontFamily: Typography.italic, color: 'rgba(255,255,255,0.82)', lineHeight: 20 },
    aiBadge: { marginLeft: 'auto', backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
    aiBadgeText: { fontSize: 12, fontFamily: Typography.sansBold, color: '#d8b4fe', letterSpacing: 1 },
});

TodayTab.displayName = 'TodayTab';
