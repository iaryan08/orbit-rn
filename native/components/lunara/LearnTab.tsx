import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { BookOpen, Sparkles } from 'lucide-react-native';
import { IntimacyInsightCard } from './IntimacyInsightCard';
import { GlassCard } from '../GlassCard';
import { Spacing } from '../../constants/Theme';

const FADE_IN = undefined;

export function LearnTab({ intimacyIntel, phase, cycleDay, partnerName, formatContextualText, onLogPeriod, isLogging, styles: tab, coupleId, isFemale }: any) {
    const phaseName = phase?.name || 'Follicular';

    return (
        <View>
            {/* Section header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.md, marginBottom: 8, marginTop: 4 }}>
                <BookOpen size={13} color="#6366f1" />
                <Text style={tab.bodyCardLabel}>INTIMACY GUIDE</Text>
            </View>

            {/* Sex Position of the day */}
            <IntimacyInsightCard
                phaseName={phaseName}
                cycleDay={cycleDay}
                type="position"
                isMale={!isFemale}
                coupleId={coupleId}
            />

            {/* Coaching — intimacy advice */}
            <IntimacyInsightCard
                phaseName={phaseName}
                cycleDay={cycleDay}
                type="coaching"
                isMale={!isFemale}
                coupleId={coupleId}
            />

            {/* Partner intel card */}
            {intimacyIntel?.partnerIntimacyGuide && (
                <GlassCard style={tab.bodyCard} intensity={8}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Sparkles size={14} color="#a855f7" />
                        <Text style={tab.bodyCardLabel}>INTIMACY STRATEGY</Text>
                    </View>
                    <Text style={tab.bodyCardTitle}>Connecting with {partnerName}</Text>
                    <Text style={[tab.adviceText, { borderLeftColor: '#a855f7', fontSize: 14 }]}>
                        {formatContextualText(intimacyIntel?.partnerIntimacyGuide, false)}
                    </Text>
                </GlassCard>
            )}
        </View>
    );
}

LearnTab.displayName = 'LearnTab';
