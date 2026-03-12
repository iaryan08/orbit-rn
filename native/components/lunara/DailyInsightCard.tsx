import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { Sparkles, ChevronDown, Brain } from 'lucide-react-native';
import { DailyInsight } from '../../lib/store/lunaraSlice';
import * as Haptics from 'expo-haptics';

const FADE_IN_DOWN_A = FadeInDown.duration(500).delay(100);
const FADE_IN_DOWN_B = FadeInDown.duration(400).delay(260);


interface DailyInsightCardProps {
    insight: DailyInsight | null;
    isLoading: boolean;
    phaseColor: string;
}

export const DailyInsightCard = React.memo(({ insight, isLoading, phaseColor }: DailyInsightCardProps) => {
    const [hormoneExpanded, setHormoneExpanded] = useState(false);

    if (isLoading && !insight) {
        return (
            <View style={styles.card}>
                <View style={styles.skeletonHeader} />
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: '75%' }]} />
            </View>
        );
    }

    if (!insight) return null;

    return (
        <Animated.View entering={FADE_IN_DOWN_A} style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <Sparkles size={14} color={phaseColor} />
                    <Text style={styles.cardLabel}>TODAY'S INSIGHT</Text>
                </View>
                {insight.source === 'ai' && (
                    <View style={styles.aiBadge}>
                        <Brain size={9} color="#818cf8" />
                        <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                )}
            </View>

            {/* Main insight */}
            <Text style={[styles.insightText, { borderLeftColor: phaseColor }]}>
                {insight.insight}
            </Text>

            {/* Recommendation */}
            <View style={[styles.recBox, { borderColor: `${phaseColor}30`, backgroundColor: `${phaseColor}08` }]}>
                <Text style={styles.recLabel}>RECOMMENDATION</Text>
                <Text style={styles.recText}>{insight.recommendation}</Text>
            </View>

            {/* Hormone context — collapsible */}
            <Pressable
                onPress={() => { setHormoneExpanded(e => !e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={styles.hormoneToggle}
            >
                <Text style={styles.hormoneToggleText}>Hormone Science</Text>
                <ChevronDown size={14} color="rgba(255,255,255,0.35)"
                    style={{ transform: [{ rotate: hormoneExpanded ? '180deg' : '0deg' }] }} />
            </Pressable>
            {hormoneExpanded && (
                <Animated.View entering={FADE_IN_DOWN_A} style={styles.hormoneContent}>
                    <Text style={styles.hormoneText}>{insight.hormoneContext}</Text>
                </Animated.View>
            )}
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.lg,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: Radius.xxl,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    skeletonHeader: { height: 14, width: 140, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 20 },
    skeletonLine: { height: 12, width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardLabel: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(129,140,248,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(129,140,248,0.25)' },
    aiBadgeText: { fontSize: 8, fontFamily: Typography.sansBold, color: '#818cf8', letterSpacing: 1 },
    insightText: {
        fontSize: 22,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 34,
        marginBottom: 24,
        borderLeftWidth: 2,
        paddingLeft: 16,
    },
    recBox: { borderRadius: Radius.lg, borderWidth: 1, padding: 16, marginBottom: 20 },
    recLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 8 },
    recText: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.75)', lineHeight: 22 },
    hormoneToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
    hormoneToggleText: { fontSize: 11, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 },
    hormoneContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    hormoneText: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', lineHeight: 22 },
});
