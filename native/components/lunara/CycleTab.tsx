import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Droplets } from 'lucide-react-native';
import { GlassCard } from '../GlassCard';
import { BiologicalTimeline } from './BiologicalTimeline';
import { PremiumTabLoader } from '../PremiumTabLoader';
import { FADE_IN, FADE_IN_DOWN_1, FADE_IN_DOWN_2, tab } from './tabStyles';

export const CycleTab = React.memo(({
    cycleDay,
    phase,
    prediction,
    timelineDays,
    selectedDay,
    onSelectDay,
    onLogPeriod,
    isLogging,
    cycleProfile,
    isFemale,
    PHASE_SYMPTOMS,
}: any) => {
    const suggestedSymptoms = phase ? (PHASE_SYMPTOMS[phase.name] || []) : [];
    const phaseColor = phase?.color || '#818cf8';
    const hasData = cycleProfile?.last_period_start;

    return (
        <View>
            {hasData ? (
                <>
                    <Animated.View entering={FADE_IN_DOWN_1}>
                        <BiologicalTimeline
                            days={timelineDays}
                            selectedDay={selectedDay || cycleDay || 1}
                            onSelectDay={onSelectDay}
                        />
                    </Animated.View>

                    <Animated.View entering={FADE_IN_DOWN_2}>
                        <GlassCard style={tab.phaseGuide} intensity={8}>
                            <Text style={tab.phaseGuideLabel}>HISTORICAL RHYTHM</Text>
                            <View style={[tab.statsRowTiny, { paddingHorizontal: 5 }]}>
                                <View style={tab.statTiny}>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                        <Text style={tab.statValTiny}>{cycleProfile?.avg_cycle_length || 28}</Text>
                                        <Text style={tab.statLabelTiny}> d</Text>
                                    </View>
                                    <Text style={tab.statLabelTiny}>AVG CYCLE</Text>
                                </View>
                                <View style={tab.statDividerTiny} />
                                <View style={tab.statTiny}>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                        <Text style={tab.statValTiny}>{cycleProfile?.avg_period_length || 5}</Text>
                                        <Text style={tab.statLabelTiny}> d</Text>
                                    </View>
                                    <Text style={tab.statLabelTiny}>AVG FLOW</Text>
                                </View>
                                <View style={tab.statDividerTiny} />
                                <View style={tab.statTiny}>
                                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                        <Text style={tab.statValTiny}>{cycleProfile?.period_history?.length || 0}</Text>
                                    </View>
                                    <Text style={tab.statLabelTiny}>LOGS</Text>
                                </View>
                            </View>
                        </GlassCard>
                    </Animated.View>

                    {prediction && prediction.predictedDate !== '—' && (
                        <Animated.View entering={FADE_IN_DOWN_2}>
                            <GlassCard style={[tab.predCard, { paddingVertical: 18 }]} intensity={8}>
                                <View style={[tab.statsRow, { width: '100%', padding: 0, backgroundColor: 'transparent', marginHorizontal: 0, marginBottom: 0 }]}>
                                    <View style={tab.stat}>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={tab.statVal}>{Math.max(0, prediction.daysUntil)}</Text>
                                            <Text style={tab.statSubVal}>d</Text>
                                        </View>
                                        <Text style={tab.statLabel}>NEXT PERIOD</Text>
                                    </View>

                                    <View style={tab.statDivider} />

                                    <View style={tab.stat}>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={[tab.statVal, { color: prediction.chanceColor }]}>
                                                {prediction.chancePercentage}
                                            </Text>
                                            <Text style={[tab.statSubVal, { color: prediction.chanceColor }]}>%</Text>
                                        </View>
                                        <Text style={tab.statLabel}>PREGNANCY</Text>
                                    </View>

                                    <View style={tab.statDivider} />

                                    <View style={tab.stat}>
                                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                            <Text style={tab.statVal}>
                                                {Math.abs(prediction.ovulationDay - (cycleDay || 0)) <= 3 ? 'Near' : prediction.ovulationDay}
                                            </Text>
                                            {Math.abs(prediction.ovulationDay - (cycleDay || 0)) > 3 && <Text style={tab.statSubVal}>d</Text>}
                                        </View>
                                        <Text style={tab.statLabel}>OVULATION</Text>
                                    </View>
                                </View>
                            </GlassCard>
                        </Animated.View>
                    )}
                </>
            ) : (
                <View style={tab.empty}>
                    <Droplets size={28} color="rgba(251,113,133,0.4)" />
                    <Text style={tab.emptyTitle}>Log your first period</Text>
                    <Text style={tab.emptySub}>Lunara needs your last period date to build your cycle map.</Text>
                </View>
            )}
        </View>
    );
});

CycleTab.displayName = 'CycleTab';
