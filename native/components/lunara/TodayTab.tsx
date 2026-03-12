import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldAlert } from 'lucide-react-native';
import { GlassCard } from '../GlassCard';
import { DailyInsightCard } from './DailyInsightCard';
import { AIHealthAssistant } from './AIHealthAssistant';
import { IntimacyInsightCard } from './IntimacyInsightCard';
import { Spacing, Radius } from '../../constants/Theme';
import { PhaseSphere } from './PhaseSphere';
import { BiologicalTimeline } from './BiologicalTimeline';
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
}: any) => {
    if (!phase) {
        return (
            <View style={tab.empty}>
                <Text style={tab.emptyTitle}>No cycle data yet</Text>
                <Text style={tab.emptySub}>Visit the Cycle tab to log your last period and start tracking.</Text>
            </View>
        );
    }

    return (
        <View>
            <View style={tab.phaseHero}>
                <PhaseSphere phase={phase.name} intensity={0.8} isActive={true} />
                <Text style={[tab.phaseTitle, { color: phase.color }]}>{phase.name} Phase</Text>
                <Text style={tab.phaseDay}>Day {cycleDay} · {phase.energy} Energy</Text>
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

            <DailyInsightCard insight={dailyInsight} isLoading={isLoadingInsight} phaseColor={phase.color} />

            {/* Today's Prediction Stats */}
            {prediction && (
                <Animated.View entering={FADE_IN_DOWN_2}>
                    <GlassCard style={tab.statsRow} intensity={10}>
                        <View style={tab.stat}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <Text style={tab.statVal}>{Math.max(0, prediction.daysUntil)}</Text>
                                <Text style={tab.statSubVal}>d</Text>
                            </View>
                            <Text style={tab.statLabel}>UNTIL{'\n'}PERIOD</Text>
                        </View>

                        <View style={tab.statDivider} />

                        <View style={tab.stat}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <Text style={[tab.statVal, { color: prediction.chanceColor || '#FFFFFF' }]}>
                                    {prediction.chancePercentage}
                                </Text>
                                <Text style={[tab.statSubVal, { color: prediction.chanceColor || '#FFFFFF' }]}>%</Text>
                            </View>
                            <Text style={tab.statLabel}>FERTILITY{'\n'}CHANCE</Text>
                        </View>

                        <View style={tab.statDivider} />

                        <View style={tab.stat}>
                            <Text style={[tab.statVal, { fontSize: 13, textTransform: 'uppercase' }]}>
                                {prediction.currentPregnancyChance === 'Peak' ? 'OVULATION' : prediction.confidence}
                            </Text>
                            <Text style={tab.statLabel}>
                                {prediction.currentPregnancyChance === 'Peak' ? 'TODAY!' : 'PREDICTION'}
                            </Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            )}

            {phase && (
                <Animated.View entering={FADE_IN_DOWN_3}>
                    <GlassCard style={tab.adviceCard} intensity={8}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={tab.adviceLabel}>WHAT YOUR BODY NEEDS</Text>
                            {intimacyIntel?.source === 'ai' && <View style={tab.aiBadge}><Text style={tab.aiBadgeText}>AI</Text></View>}
                        </View>
                        <Text style={[tab.adviceText, { borderLeftColor: phase.color }]}>
                            {formatContextualText(intimacyIntel?.intimacyTip || phase.advice, true)}
                        </Text>
                        <View style={tab.hormoneBox}>
                            <Text style={tab.hormoneLabel}>HORMONES NOW</Text>
                            <Text style={tab.hormoneText}>
                                {formatContextualText(intimacyIntel?.hormoneContext || phase.hormones, true)}
                            </Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            )}

            <AIHealthAssistant
                symptoms={todaySymptoms}
                phase={phase.name}
                advice={dailyInsight?.recommendation}
                isLoading={isLoadingInsight}
            />

        </View>
    );
});

TodayTab.displayName = 'TodayTab';
