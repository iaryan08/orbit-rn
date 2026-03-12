import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { ChevronRight, Check, X, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from './GlassCard';

interface Question {
    id: string;
    text: string;
    options: string[];
    isEssential: boolean;
}

const QUESTIONS: Question[] = [
    {
        id: 'goal',
        text: 'What is your primary goal with Lunara?',
        options: ['Track Cycle', 'Conceive', 'Avoid Pregnancy', 'Balance Hormones'],
        isEssential: true,
    },
    {
        id: 'symptoms',
        text: 'Do you experience heavy symptoms?',
        options: ['Rarely', 'Sometimes', 'Always'],
        isEssential: false,
    },
    {
        id: 'periodLength',
        text: 'How long does your period usually last?',
        options: ['3-4 days', '5-6 days', '7+ days'],
        isEssential: true,
    },
    {
        id: 'reminder',
        text: 'Would you like biological nudges?',
        options: ['Yes, keep me updated', 'Only for key events', 'No thank you'],
        isEssential: false,
    }
];

export const LunaraPersonalization = ({ onComplete }: { onComplete: (answers: Record<string, string>) => void }) => {
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});

    const currentQuestion = QUESTIONS[step];

    const handleSelect = (option: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setAnswers(prev => ({ ...prev, [currentQuestion.id]: option }));
    };

    const handleNext = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (step < QUESTIONS.length - 1) {
            setStep(step + 1);
        } else {
            onComplete(answers);
        }
    };

    const handleSkip = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (step < QUESTIONS.length - 1) {
            setStep(step + 1);
        } else {
            onComplete(answers);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Sparkles size={24} color={Colors.dark.rose[400]} />
                <Text style={styles.title}>Personalize Lunara</Text>
                <Text style={styles.subtitle}>Help us tailor your biological intelligence</Text>
            </View>

            <View style={styles.progressContainer}>
                {QUESTIONS.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.progressBar,
                            { backgroundColor: i <= step ? Colors.dark.rose[400] : 'rgba(255,255,255,0.1)' }
                        ]}
                    />
                ))}
            </View>

            <View style={styles.questionCard}>
                <Text style={styles.questionText}>{currentQuestion.text}</Text>

                <View style={styles.optionsContainer}>
                    {currentQuestion.options.map(option => (
                        <TouchableOpacity
                            key={option}
                            style={[
                                styles.optionBtn,
                                answers[currentQuestion.id] === option && styles.optionBtnActive
                            ]}
                            onPress={() => handleSelect(option)}
                        >
                            <Text style={[
                                styles.optionText,
                                answers[currentQuestion.id] === option && styles.optionTextActive
                            ]}>
                                {option}
                            </Text>
                            {answers[currentQuestion.id] === option && (
                                <Check size={16} color="white" />
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.footer}>
                {!currentQuestion.isEssential && (
                    <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                        <Text style={styles.skipBtnText}>Skip for now</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[
                        styles.nextBtn,
                        !answers[currentQuestion.id] && currentQuestion.isEssential && styles.nextBtnDisabled
                    ]}
                    onPress={handleNext}
                    disabled={!answers[currentQuestion.id] && currentQuestion.isEssential}
                >
                    <Text style={styles.nextBtnText}>
                        {step === QUESTIONS.length - 1 ? 'Finish' : 'Next'}
                    </Text>
                    <ChevronRight size={20} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', padding: 24, paddingTop: 60 },
    header: { alignItems: 'center', marginBottom: 40 },
    title: { fontSize: 28, fontFamily: Typography.serifBold, color: 'white', marginTop: 16 },
    subtitle: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginTop: 8, textAlign: 'center' },
    progressContainer: { flexDirection: 'row', gap: 8, marginBottom: 40 },
    progressBar: { flex: 1, height: 4, borderRadius: 2 },
    questionCard: { flex: 1 },
    questionText: { fontSize: 22, fontFamily: Typography.serifBold, color: 'white', marginBottom: 24 },
    optionsContainer: { gap: 12 },
    optionBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 20, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    optionBtnActive: { backgroundColor: 'rgba(251,113,133,0.15)', borderColor: Colors.dark.rose[400] },
    optionText: { fontSize: 16, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.7)' },
    optionTextActive: { color: 'white', fontFamily: Typography.sansBold },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 40 },
    skipBtn: { padding: 12 },
    skipBtnText: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 24, paddingVertical: 14, borderRadius: 100,
        backgroundColor: Colors.dark.rose[500],
    },
    nextBtnDisabled: { opacity: 0.3 },
    nextBtnText: { fontSize: 16, fontFamily: Typography.sansBold, color: 'white' },
});
