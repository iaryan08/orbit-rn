import React from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { GlassCard } from '../GlassCard';
import { PhaseSphere } from './PhaseSphere';
import { BiologicalTimeline } from './BiologicalTimeline';
import { CycleSummaryBanner } from './CycleSummaryBanner';
import { FADE_IN, FADE_IN_DOWN_1, FADE_IN_DOWN_2, FADE_IN_DOWN_3, tab } from './tabStyles';

interface HerCycleTabProps {
    partnerPhase: any;
    partnerCycleDay: number | null;
    partnerPrediction: any;
    partnerName: string;
    timelineDays: any[];
    selectedDay: number | null;
    onSelectDay: (day: number) => void;
    onLogPeriod?: () => void;
    isLogging?: boolean;
    formatContextualText: (text: string, isFemale: boolean) => string;
}

export function HerCycleTab({
    partnerPhase, partnerCycleDay, partnerPrediction, partnerName,
    timelineDays, selectedDay, onSelectDay, onLogPeriod, isLogging, formatContextualText
}: HerCycleTabProps) {
    const name = partnerName || 'Your partner';

    if (!partnerPhase) {
        return (
            <Animated.View entering={FADE_IN} style={tab.empty}>
                <Text style={tab.emptyTitle}>{name} hasn't set up Lunara yet</Text>
                <Text style={tab.emptySub}>Ask her to log her cycle data — her phase will appear here automatically.</Text>
            </Animated.View>
        );
    }

    return (
        <Animated.View entering={FADE_IN}>
            <CycleSummaryBanner
                cycleDay={partnerCycleDay}
                phase={partnerPhase}
                prediction={partnerPrediction}
                onLogPeriod={onLogPeriod}
                isLogging={isLogging}
                isPartnerView={true}
            />

            {/* Hero */}
            <View style={tab.phaseHero}>
                <PhaseSphere phase={partnerPhase.name} intensity={0.8} isActive={false} />
                <Text style={[tab.phaseTitle, { color: partnerPhase.color }]}>{partnerPhase.name} Phase</Text>
                <Text style={tab.phaseDay}>{name} · Day {partnerCycleDay} · {partnerPhase.energy} Energy</Text>
            </View>

            {/* Stats */}
            {partnerPrediction && (
                <Animated.View entering={FADE_IN_DOWN_1}>
                    <GlassCard style={tab.statsRow} intensity={10}>
                        <View style={tab.stat}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <Text style={tab.statVal}>{Math.max(0, partnerPrediction.daysUntil)}</Text>
                                <Text style={tab.statSubVal}>d</Text>
                            </View>
                            <Text style={tab.statLabel}>DAYS UNTIL{'\n'}PERIOD</Text>
                        </View>

                        <View style={tab.statDivider} />

                        <View style={tab.stat}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <Text style={[tab.statVal, { color: partnerPhase.color }]}>{partnerPrediction.avgCycleLength}</Text>
                                <Text style={tab.statSubVal}>d</Text>
                            </View>
                            <Text style={tab.statLabel}>CYCLE{'\n'}LENGTH</Text>
                        </View>

                        <View style={tab.statDivider} />

                        <View style={tab.stat}>
                            <Text style={[tab.statVal, { fontSize: 13, textTransform: 'uppercase' }]}>{partnerPrediction.confidence}</Text>
                            <Text style={tab.statLabel}>PREDICTION{'\n'}QUALITY</Text>
                        </View>
                    </GlassCard>
                </Animated.View>
            )}

            {/* What she's going through */}
            <Animated.View entering={FADE_IN_DOWN_2}>
                <GlassCard style={tab.adviceCard} intensity={8}>
                    <Text style={tab.adviceLabel}>WHAT SHE'S GOING THROUGH</Text>
                    <Text style={[tab.adviceText, { borderLeftColor: partnerPhase.color }]}>
                        {formatContextualText(partnerPhase.advice, false)}
                    </Text>
                    <View style={tab.hormoneBox}>
                        <Text style={tab.hormoneLabel}>HORMONES NOW</Text>
                        <Text style={tab.hormoneText}>
                            {formatContextualText(partnerPhase.hormones, false)}
                        </Text>
                    </View>
                </GlassCard>
            </Animated.View>

            {/* Timeline */}
            {timelineDays.length > 0 && (
                <Animated.View entering={FADE_IN_DOWN_3}>
                    <BiologicalTimeline
                        days={timelineDays}
                        selectedDay={selectedDay || partnerCycleDay || 1}
                        onSelectDay={onSelectDay}
                    />
                </Animated.View>
            )}
        </Animated.View>
    );
}
