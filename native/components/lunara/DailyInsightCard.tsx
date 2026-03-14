import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { Sparkles, ChevronDown, Brain, Clock } from 'lucide-react-native';
import { DailyInsight } from '../../lib/store/lunaraSlice';
import * as Haptics from 'expo-haptics';

const FADE_IN_DOWN_A = undefined; // Android-only: entering animations crash at module-level
const FADE_IN_DOWN_B = undefined;



interface DailyInsightCardProps {
    insight: DailyInsight | null;
    isLoading: boolean;
    phaseColor: string;
}

export const DailyInsightCard = React.memo(({ insight, isLoading, phaseColor }: DailyInsightCardProps) => {
    const [hormoneExpanded, setHormoneExpanded] = useState(false);

    // Loading skeleton — always rendered via conditional in JSX, not early return
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
        <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <Sparkles size={16} color={phaseColor} />
                    <Text style={styles.cardLabel}>DAILY INSIGHT</Text>
                </View>
                {insight.source === 'ai' && (
                    <View style={styles.aiBadge}>
                        <Sparkles size={12} color="#818cf8" fill="#818cf8" />
                        <Text style={styles.aiBadgeText}>AI LUNARA</Text>
                    </View>
                )}
            </View>

            {/* Main insight */}
            <Text style={[styles.insightText, { borderLeftColor: phaseColor }]}>
                {insight.insight}
            </Text>

            {/* Recommendation - Refined Premium Overlay */}
            <View style={[styles.recBadge, { borderColor: `${phaseColor}25`, backgroundColor: `${phaseColor}05` }]}>
                <View style={styles.recSparkleContainer}>
                    <Sparkles size={14} color={phaseColor} />
                </View>
                <View style={styles.recContent}>
                    <View style={styles.recHeader}>
                        <Clock size={12} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.recSubtitle}>PRIORITY</Text>
                    </View>
                    <Text style={styles.recValue}>{insight.recommendation}</Text>
                </View>
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
                <View style={styles.hormoneContent}>
                    <Text style={styles.hormoneText}>{insight.hormoneContext}</Text>
                </View>
            )}
        </View>
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
    cardLabel: { fontSize: 13, fontFamily: Typography.italic, color: 'rgba(255,255,255,0.85)', letterSpacing: 1 },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(129,140,248,0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(129,140,248,0.25)'
    },
    aiBadgeText: { fontSize: 11, fontFamily: Typography.sansBold, color: '#818cf8', letterSpacing: 1 },
    insightText: {
        fontSize: 18,
        fontFamily: Typography.sans, // Outfit for better readability / less "heavy"
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 28,
        marginBottom: 24,
        borderLeftWidth: 3,
        paddingLeft: 18,
    },
    recBadge: {
        position: 'relative',
        padding: 18,
        paddingLeft: 22,
        borderRadius: Radius.xl,
        borderWidth: 1,
        marginBottom: 20,
        overflow: 'hidden'
    },
    recSparkleContainer: {
        position: 'absolute',
        top: 10,
        left: 12,
        opacity: 0.6
    },
    recContent: { flex: 1 },
    recHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    recSubtitle: {
        fontSize: 11,
        fontFamily: Typography.italic,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    recValue: { fontSize: 16, fontFamily: Typography.sansBold, color: 'white', lineHeight: 24 },
    hormoneToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
    hormoneToggleText: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 },
    hormoneContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    hormoneText: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.7)', lineHeight: 22 },
});
