import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { Sparkles, Brain, ShieldAlert } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';

interface AIHealthAssistantProps {
    symptoms: string[];
    phase: string;
    advice?: string;
    conditionAssessment?: string;
    isLoading?: boolean;
}

const FADE_IN_UP = undefined; // Android-only: entering animations crash at module-level

export const AIHealthAssistant = React.memo(({ symptoms, phase, advice, conditionAssessment, isLoading }: AIHealthAssistantProps) => {
    const hasSymptoms = symptoms && symptoms.length > 0;

    return (
        <View style={styles.cardContainer}>
            <GlassCard style={styles.card} intensity={isLoading ? 12 : 15}>
                {isLoading ? (
                    <>
                        <View style={styles.skeletonHeader} />
                        <View style={styles.skeletonBody} />
                    </>
                ) : (
                    <>
                        <View style={styles.header}>
                            <View style={styles.headerLeft}>
                                <Brain size={18} color="#c084fc" />
                                <Text style={styles.label}>AI INTELLIGENCE</Text>
                            </View>
                            <View style={styles.aiBadge}>
                                <Sparkles size={12} color="#c084fc" />
                                <Text style={styles.aiBadgeText}>CORE</Text>
                            </View>
                        </View>

                        <Text style={styles.title}>
                            {hasSymptoms ? 'Symptom Pattern Detected' : 'Biological Status: Optimal'}
                        </Text>

                        <Text style={styles.summary}>
                            {conditionAssessment 
                                ? conditionAssessment
                                : (hasSymptoms
                                    ? `I've analyzed your ${symptoms.length} logged symptoms. They align with typical ${phase} hormonal shifts. Proximity to ovulation may increase sensitivity.`
                                    : `Your profile currently shows a balanced baseline for the ${phase} phase. Continue logging to refine your personal health model.`
                                )
                            }
                        </Text>

                        {advice && (
                            <View style={styles.adviceBox}>
                                <Text style={styles.adviceLabel}>OBSERVATION</Text>
                                <Text style={styles.adviceText}>{advice}</Text>
                            </View>
                        )}

                        <View style={styles.disclaimer}>
                            <ShieldAlert size={10} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.disclaimerText}>NOT MEDICAL ADVICE. CONSULT A PHYSICIAN FOR CLINICAL CONCERNS.</Text>
                        </View>
                    </>
                )}
            </GlassCard>
        </View>
    );
});

const styles = StyleSheet.create({
    cardContainer: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg },
    card: { padding: 24, borderColor: 'rgba(192, 132, 252, 0.2)', borderWidth: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    aiBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderRadius: 100,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(192, 132, 252, 0.2)'
    },
    aiBadgeText: { fontSize: 11, fontFamily: Typography.sansBold, color: '#c084fc', letterSpacing: 1 },
    title: { fontSize: 22, fontFamily: Typography.serifBold, color: 'white', marginBottom: 12 },
    summary: { fontSize: 15, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.88)', lineHeight: 24, marginBottom: 20 },
    adviceBox: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.lg, padding: 16, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: '#c084fc' },
    adviceLabel: { fontSize: 12, fontFamily: Typography.italic, color: 'rgba(192, 132, 252, 0.5)', letterSpacing: 1, marginBottom: 6 },
    adviceText: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.92)', lineHeight: 20 },
    disclaimer: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.5 },
    disclaimerText: { fontSize: 11, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5 },
    skeletonHeader: { height: 20, width: '60%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 16 },
    skeletonBody: { height: 100, width: '100%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8 },
});
