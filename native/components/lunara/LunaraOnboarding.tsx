import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions,
    Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import Animated, {
    withSpring, useSharedValue,
    useAnimatedStyle, withTiming, SlideInRight, SlideOutLeft, runOnJS
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Typography, Radius } from '../../constants/Theme';
import * as Haptics from 'expo-haptics';
import { ChevronRight, ChevronLeft, Check, Calendar, Moon, Heart, Sparkles, Droplets } from 'lucide-react-native';
import { useOrbitStore } from '../../lib/store';
import { LunaraOnboardingData } from '../../lib/store/lunaraSlice';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';

const ONBOARD_FADE = undefined; // Android-only: entering animations crash at module-level


const { width, height } = Dimensions.get('window');

// ─── Step Data ────────────────────────────────────────────────────────────────

const CYCLE_LENGTHS = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const PERIOD_LENGTHS = [2, 3, 4, 5, 6, 7, 8];
const GOALS = [
    { id: 'track_cycle', label: 'Track my cycle', icon: '📅' },
    { id: 'understand_phases', label: 'Understand my phases', icon: '🌙' },
    { id: 'partner_awareness', label: 'Partner awareness', icon: '💑' },
    { id: 'manage_symptoms', label: 'Manage symptoms', icon: '🌿' },
    { id: 'fertility_awareness', label: 'Fertility awareness', icon: '✨' },
    { id: 'conceive', label: 'Planning to conceive', icon: '🍼' },
];
const COMMON_SYMPTOMS = [
    'Cramps', 'Bloating', 'Headaches', 'Fatigue', 'Mood swings',
    'Cravings', 'Back pain', 'Acne', 'Tender breasts', 'Insomnia',
    'Anxiety', 'Brain fog',
];

const TOTAL_STEPS = 4;

// ─── Sub-screens ───────────────────────────────────────────────────────────────

function StepPeriodDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [inputDate, setInputDate] = useState(value || '');

    const PRESETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    const setDaysAgo = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        const str = d.toISOString().split('T')[0];
        setInputDate(str);
        onChange(str);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    return (
        <Animated.View entering={ONBOARD_FADE} style={step.container}>
            <View style={step.iconCircle}>
                <Droplets size={28} color="#fb7185" />
            </View>
            <Text style={step.title}>When did your last period start?</Text>
            <Text style={step.subtitle}>This gives Lunara its starting point. You can always edit it later.</Text>

            <View style={step.presetGrid}>
                {PRESETS.map(days => {
                    const d = new Date();
                    d.setDate(d.getDate() - days);
                    const str = d.toISOString().split('T')[0];
                    const isSelected = inputDate === str;
                    return (
                        <Pressable
                            key={days}
                            onPress={() => setDaysAgo(days)}
                            style={({ pressed }) => [
                                step.presetChip,
                                isSelected && step.presetChipActive,
                                { opacity: pressed ? 0.7 : 1 }
                            ]}
                        >
                            <Text style={[step.presetChipLabel, isSelected && step.presetChipLabelActive]}>
                                {days === 1 ? 'Yesterday' : `${days}d ago`}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <Text style={step.orText}>or enter a date</Text>
            <TextInput
                style={step.dateInput}
                value={inputDate}
                onChangeText={v => { setInputDate(v); onChange(v); }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numbers-and-punctuation"
            />
        </Animated.View>
    );
}

function StepCycleLength({ cycleLength, periodLength, onChangeCycle, onChangePeriod }: any) {
    return (
        <Animated.View entering={ONBOARD_FADE} style={step.container}>
            <View style={step.iconCircle}>
                <Calendar size={28} color="#818cf8" />
            </View>
            <Text style={step.title}>Your typical cycle</Text>
            <Text style={step.subtitle}>Most cycles are 21–35 days. Day 1 is the first day of your period.</Text>

            <Text style={step.rowLabel}>CYCLE LENGTH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                <View style={step.numberRow}>
                    {CYCLE_LENGTHS.map(n => (
                        <Pressable key={n} onPress={() => { onChangeCycle(n); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={[step.numChip, cycleLength === n && step.numChipActive]}>
                            <Text style={[step.numChipText, cycleLength === n && step.numChipTextActive]}>{n}</Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>

            <Text style={step.rowLabel}>PERIOD DURATION (DAYS)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={step.numberRow}>
                    {PERIOD_LENGTHS.map(n => (
                        <Pressable key={n} onPress={() => { onChangePeriod(n); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={[step.numChip, periodLength === n && step.numChipActive]}>
                            <Text style={[step.numChipText, periodLength === n && step.numChipTextActive]}>{n}</Text>
                        </Pressable>
                    ))}
                </View>
            </ScrollView>
        </Animated.View>
    );
}

function StepGoals({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
    return (
        <Animated.View entering={ONBOARD_FADE} style={step.container}>
            <View style={step.iconCircle}>
                <Sparkles size={28} color="#fbbf24" />
            </View>
            <Text style={step.title}>What matters most to you?</Text>
            <Text style={step.subtitle}>Select all that apply. Lunara will personalize your experience.</Text>
            <View style={step.goalGrid}>
                {GOALS.map(g => {
                    const isSelected = selected.includes(g.id);
                    return (
                        <Pressable key={g.id} onPress={() => { onToggle(g.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={[step.goalCard, isSelected && step.goalCardActive]}>
                            <Text style={step.goalEmoji}>{g.icon}</Text>
                            <Text style={[step.goalLabel, isSelected && step.goalLabelActive]}>{g.label}</Text>
                            {isSelected && <View style={step.checkBadge}><Check size={10} color="white" /></View>}
                        </Pressable>
                    );
                })}
            </View>
        </Animated.View>
    );
}

function StepSymptoms({ selected, onToggle }: { selected: string[]; onToggle: (s: string) => void }) {
    return (
        <Animated.View entering={ONBOARD_FADE} style={step.container}>
            <View style={step.iconCircle}>
                <Moon size={28} color="#c084fc" />
            </View>
            <Text style={step.title}>Common symptoms you experience?</Text>
            <Text style={step.subtitle}>This helps Lunara surface relevant insights and patterns.</Text>
            <View style={step.chipGrid}>
                {COMMON_SYMPTOMS.map(s => {
                    const isSelected = selected.includes(s);
                    return (
                        <Pressable key={s} onPress={() => { onToggle(s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            style={[step.symp, isSelected && step.sympActive]}>
                            <Text style={[step.sympText, isSelected && step.sympTextActive]}>{s}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </Animated.View>
    );
}

// ─── Main Onboarding ─────────────────────────────────────────────────────────

function LunaraOnboardingBase({ onComplete }: { onComplete: () => void }) {
    const insets = useSafeAreaInsets();
    const { setLunaraOnboarding, couple, profile } = useOrbitStore();
    const user = auth.currentUser;

    const [step, setStep] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const [lastPeriodDate, setLastPeriodDate] = useState('');
    const [cycleLength, setCycleLength] = useState(28);
    const [periodLength, setPeriodLength] = useState(5);
    const [goals, setGoals] = useState<string[]>([]);
    const [symptoms, setSymptoms] = useState<string[]>([]);

    const toggleGoal = useCallback((id: string) => {
        setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
    }, []);

    const toggleSymptom = useCallback((s: string) => {
        setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    }, []);

    const canAdvance = () => {
        if (step === 0) return !!lastPeriodDate && lastPeriodDate.match(/^\d{4}-\d{2}-\d{2}$/);
        if (step === 1) return cycleLength > 0 && periodLength > 0;
        if (step === 2) return goals.length > 0;
        return true;
    };

    const handleComplete = async () => {
        if (isSaving) return;
        setIsSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const data: LunaraOnboardingData = {
            lastPeriodDate,
            cycleLength,
            periodLength,
            goals,
            symptoms,
            completed: true,
        };

        // Save to local store + AsyncStorage
        await setLunaraOnboarding(data);

        // Save to Firestore cycle_profiles
        if (user && couple?.id) {
            try {
                const coupleId = profile?.couple_id || couple.id;
                await setDoc(
                    doc(db, 'couples', coupleId, 'cycle_profiles', user.uid),
                    {
                        last_period_start: lastPeriodDate,
                        period_history: [lastPeriodDate],
                        avg_cycle_length: cycleLength,
                        avg_period_length: periodLength,
                        sharing_enabled: true,
                        updated_at: serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch (e) {
                console.warn('[LunaraOnboarding] Firestore save failed:', e);
            }
        }

        setIsSaving(false);
        onComplete();
    };

    const progress = (step / (TOTAL_STEPS - 1));

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>

                {/* Progress bar */}
                <View style={styles.progressBar}>
                    <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>

                {/* Step counter */}
                <Text style={styles.stepCounter}>{step + 1} of {TOTAL_STEPS}</Text>

                {/* Steps */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                    {step === 0 && (
                        <StepPeriodDate value={lastPeriodDate} onChange={setLastPeriodDate} />
                    )}
                    {step === 1 && (
                        <StepCycleLength
                            cycleLength={cycleLength}
                            periodLength={periodLength}
                            onChangeCycle={setCycleLength}
                            onChangePeriod={setPeriodLength}
                        />
                    )}
                    {step === 2 && (
                        <StepGoals selected={goals} onToggle={toggleGoal} />
                    )}
                    {step === 3 && (
                        <StepSymptoms selected={symptoms} onToggle={toggleSymptom} />
                    )}
                </ScrollView>

                {/* Navigation */}
                <View style={styles.navRow}>
                    {step > 0 ? (
                        <TouchableOpacity style={styles.backBtn} onPress={() => { setStep(s => s - 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                            <ChevronLeft size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    ) : <View style={{ width: 48 }} />}

                    {step < TOTAL_STEPS - 1 ? (
                        <TouchableOpacity
                            style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
                            onPress={() => {
                                if (!canAdvance()) return;
                                setStep(s => s + 1);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            }}
                        >
                            <Text style={styles.nextBtnText}>Continue</Text>
                            <ChevronRight size={18} color="white" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.nextBtn, isSaving && styles.nextBtnDisabled]}
                            onPress={handleComplete}
                            disabled={isSaving}
                        >
                            <Text style={styles.nextBtnText}>{isSaving ? 'Saving...' : 'Start Lunara'}</Text>
                            <Sparkles size={16} color="white" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

export const LunaraOnboarding = LunaraOnboardingBase;

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#05050a', paddingHorizontal: Spacing.lg },
    progressBar: { height: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 1, marginBottom: 16 },
    progressFill: { height: 2, backgroundColor: '#c084fc', borderRadius: 1 },
    stepCounter: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 8, textAlign: 'right' },
    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 },
    backBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
    nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7c3aed', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 100 },
    nextBtnDisabled: { opacity: 0.35 },
    nextBtnText: { color: 'white', fontFamily: Typography.sansBold, fontSize: 15 },
});

const step = StyleSheet.create({
    container: { paddingTop: 24, paddingBottom: 20 },
    iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    title: { fontSize: 30, fontFamily: Typography.serif, color: 'white', marginBottom: 10, lineHeight: 38 },
    subtitle: { fontSize: 14, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.45)', lineHeight: 22, marginBottom: 32 },

    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    presetChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    presetChipActive: { backgroundColor: 'rgba(192,132,252,0.2)', borderColor: '#c084fc' },
    presetChipLabel: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)' },
    presetChipLabelActive: { color: '#c084fc', fontFamily: Typography.sansBold },
    orText: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textAlign: 'center', marginBottom: 14 },
    dateInput: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.lg, padding: 16, color: 'white', fontFamily: Typography.sans, fontSize: 16, backgroundColor: 'rgba(255,255,255,0.03)', textAlign: 'center' },

    rowLabel: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 14 },
    numberRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 4 },
    numChip: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    numChipActive: { backgroundColor: 'rgba(129,140,248,0.2)', borderColor: '#818cf8' },
    numChipText: { fontSize: 16, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)' },
    numChipTextActive: { color: '#818cf8' },

    goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    goalCard: { width: (width - Spacing.lg * 2 - 12) / 2, padding: 18, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    goalCardActive: { backgroundColor: 'rgba(192,132,252,0.1)', borderColor: 'rgba(192,132,252,0.4)' },
    goalEmoji: { fontSize: 24, marginBottom: 10 },
    goalLabel: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },
    goalLabelActive: { color: 'white' },
    checkBadge: { position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },

    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    symp: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    sympActive: { backgroundColor: 'rgba(192,132,252,0.15)', borderColor: '#c084fc' },
    sympText: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.45)' },
    sympTextActive: { color: '#c084fc' },
});
