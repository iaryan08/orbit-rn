import React from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { ShieldAlert } from 'lucide-react-native';
import { GlassCard } from '../GlassCard';
import { DailyInsightCard } from './DailyInsightCard';
import { AIHealthAssistant } from './AIHealthAssistant';
import { IntimacyInsightCard } from './IntimacyInsightCard';
import { Spacing, Radius } from '../../constants/Theme';
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
    isLogging,
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
            <CycleSummaryBanner
                cycleDay={cycleDay}
                phase={phase}
                prediction={prediction}
                onLogPeriod={onLogPeriod}
                isLogging={isLogging}
            />

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
