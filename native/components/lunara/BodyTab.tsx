import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Flame, Plus, Thermometer, Droplets, Activity } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from '../GlassCard';
import { LibidoMeter } from '../../components/LibidoMeter';
import { LibidoSlider } from '../../components/LibidoSlider';
import { HormonePhaseDetail } from './HormonePhaseDetail';
import { FADE_IN, tab } from './tabStyles';

export function BodyTab({
    phase,
    todaySymptoms,
    partnerSymptoms,
    onToggleSymptom,
    onAddCustomSymptom,
    currentLibido,
    onLibidoSelect,
    partnerLibido,
    partnerName,
    isFemale,
    PHASE_SYMPTOMS,
    coupleId,
}: any) {
    const suggestedSymptoms = phase ? (PHASE_SYMPTOMS[phase.name] || []) : [];

    // Identify custom symptoms (those not in the suggested list nor special prefixes like CM/BBT)
    const customSymptoms = todaySymptoms.filter((s: string) =>
        !suggestedSymptoms.includes(s) &&
        !s.startsWith('CM_') &&
        !s.startsWith('BBT_') &&
        !s.startsWith('EQ_')
    );

    const phaseColor = phase?.color || '#818cf8';

    const [libidoPhoto, setLibidoPhoto] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchPhoto = async () => {
            const dateStr = new Date().toISOString().split('T')[0];
            const cacheKey = `unsplash_libido_${dateStr}`;
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) { if (isMounted) setLibidoPhoto(cached); return; }

                const query = "romantic couple,intimacy,embrace,love";
                const accessKey = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY?.trim();

                if (!accessKey) return;

                const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.urls?.regular && isMounted) {
                        setLibidoPhoto(data.urls.regular);
                        await AsyncStorage.setItem(cacheKey, data.urls.regular);
                    }
                }
            } catch (e) { }
        };
        fetchPhoto();
        return () => { isMounted = false; };
    }, []);

    return (
        <Animated.View entering={FADE_IN as any}>
            {/* Symptoms — female only */}
            {isFemale && (
                <GlassCard style={tab.bodyCard} intensity={8}>
                    <Text style={tab.bodyCardLabel}>PHYSICAL TELEMETRY</Text>
                    <Text style={tab.bodyCardTitle}>Current biological states</Text>
                    {suggestedSymptoms.length > 0 || customSymptoms.length > 0 ? (
                        <View style={tab.chipGrid}>
                            {suggestedSymptoms.map((symptom: string) => {
                                const isSelected = todaySymptoms.includes(symptom);
                                return (
                                    <TouchableOpacity
                                        key={symptom}
                                        activeOpacity={0.7}
                                        onPress={() => onToggleSymptom(symptom)}
                                        style={[
                                            tab.chip,
                                            isSelected && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor }
                                        ]}
                                    >
                                        <Text style={[tab.chipText, isSelected && { color: phaseColor }]}>
                                            {symptom}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Render Custom Symptoms */}
                            {customSymptoms.map((symptom: string) => (
                                <TouchableOpacity
                                    key={symptom}
                                    activeOpacity={0.7}
                                    onPress={() => onToggleSymptom(symptom)}
                                    style={[
                                        tab.chip,
                                        { backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.4)' }
                                    ]}
                                >
                                    <Text style={[tab.chipText, { color: '#d8b4fe' }]}>
                                        {symptom}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            {/* Add Custom Symptom Button */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={onAddCustomSymptom}
                                style={[
                                    tab.chip,
                                    { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }
                                ]}
                            >
                                <Text style={[tab.chipText, { color: 'rgba(255,255,255,0.5)' }]}>
                                    + ADD
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={tab.chipGrid}>
                            {/* Even if no history, allow adding custom */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={onAddCustomSymptom}
                                style={[
                                    tab.chip,
                                    { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent' }
                                ]}
                            >
                                <Text style={[tab.chipText, { color: 'rgba(255,255,255,0.5)' }]}>
                                    + ADD SYMPTOM
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </GlassCard>
            )}

            {/* Advanced Fertility Signals (Female Only) */}
            {isFemale && (
                <GlassCard style={tab.bodyCard} intensity={8}>
                    <Text style={tab.bodyCardLabel}>FERTILITY SIGNALS</Text>

                    {/* Cervical Mucus */}
                    <Text style={tab.bodyCardTitle}>Cervical Mucus</Text>
                    <View style={tab.chipGrid}>
                        {['Dry', 'Sticky', 'Creamy', 'Egg White'].map(type => (
                            <TouchableOpacity
                                key={type}
                                activeOpacity={0.7}
                                onPress={() => onToggleSymptom(`CM_${type}`)}
                                style={[
                                    tab.chip,
                                    todaySymptoms.includes(`CM_${type}`) && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`CM_${type}`) && { color: phaseColor }]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* BBT */}
                    <Text style={[tab.bodyCardTitle, { marginTop: 16 }]}>Basal Body Temperature</Text>
                    <View style={tab.chipGrid}>
                        {['Normal', 'Shifted High', 'Shifted Low'].map(type => (
                            <TouchableOpacity
                                key={type}
                                activeOpacity={0.7}
                                onPress={() => onToggleSymptom(`BBT_${type}`)}
                                style={[
                                    tab.chip,
                                    todaySymptoms.includes(`BBT_${type}`) && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`BBT_${type}`) && { color: phaseColor }]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View style={[tab.phaseNote, { marginTop: 12 }]}>
                        <Text style={[tab.phaseNoteText, { color: 'rgba(255,255,255,0.82)' }]}>
                            A sustained BBT rise + "Egg White" mucus confirms ovulation has uniquely occurred.
                        </Text>
                    </View>
                </GlassCard>
            )}

            {isFemale && (
                <HormonePhaseDetail
                    phaseName={phase?.name || 'Follicular'}
                    phaseColor={phaseColor}
                />
            )}

            {/* Partner Gauge \u0026 Your Slider (Combined Connection Style) */}
            <GlassCard style={[tab.bodyCard, { padding: 0, overflow: 'hidden' }]} intensity={8}>
                {libidoPhoto && (
                    <Image
                        source={{ uri: libidoPhoto }}
                        style={[StyleSheet.absoluteFillObject, { opacity: 0.45 }]}
                        contentFit="cover"
                        transition={500}
                    />
                )}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(5,5,10,0.25)' }]} />

                <View style={{ padding: 22 }}>
                    <View style={tab.libidoHeader}>
                        <View style={tab.libidoTitleRow}>
                            <Flame size={16} color="#ef4444" />
                            <Text style={tab.bodyCardLabel}>DESIRE FREQUENCY</Text>
                        </View>
                        {partnerLibido === 'very_high' && (
                            <View style={tab.hotBadge}>
                                <Text style={tab.hotBadgeText}>{(partnerName || 'PARTNER').toUpperCase()} IS HOT</Text>
                            </View>
                        )}
                    </View>

                    <View style={tab.meterContainer}>
                        <LibidoMeter level={partnerLibido} />
                        <Text style={tab.meterSub}>{(partnerName || 'PARTNER').toUpperCase()}</Text>
                    </View>

                    <View style={tab.sliderWrapper}>
                        <LibidoSlider
                            defaultValue={currentLibido || 'medium'}
                            onValueChange={onLibidoSelect}
                        />
                    </View>

                    {phase && isFemale && (
                        <View style={[tab.phaseNote, { marginTop: 12, borderTopWidth: 0 }]}>
                            <Text style={[tab.phaseNoteText, { color: phase.color }]}>
                                {phase.name === 'Ovulatory'
                                    ? 'Peak libido phase — estrogen and testosterone are both elevated'
                                    : phase.name === 'Luteal'
                                        ? 'Progesterone dampens drive. Completely normal.'
                                        : phase.name === 'Follicular'
                                            ? 'Libido building as estrogen rises through this phase'
                                            : 'Rest phase — low drive is your body\'s signal for recovery'}
                            </Text>
                        </View>
                    )}
                </View>
            </GlassCard>

            {/* Male Erectile Health Tracker (Male Only) */}
            {!isFemale && (
                <GlassCard style={tab.bodyCard} intensity={8}>
                    <Text style={tab.bodyCardLabel}>MALE HEALTH TELEMETRY</Text>
                    <Text style={tab.bodyCardTitle}>Morning Erection Quality</Text>
                    <View style={tab.chipGrid}>
                        {['Strong', 'Normal', 'Weak', 'None'].map(quality => (
                            <TouchableOpacity
                                key={quality}
                                activeOpacity={0.7}
                                onPress={() => onToggleSymptom(`EQ_${quality}`)}
                                style={[
                                    tab.chip,
                                    todaySymptoms.includes(`EQ_${quality}`) && { backgroundColor: `rgba(52, 211, 153, 0.2)`, borderColor: '#34d399' }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`EQ_${quality}`) && { color: '#34d399' }]}>
                                    {quality}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={tab.phaseNote}>
                        <Text style={[tab.phaseNoteText, { color: '#fbbf24' }]}>
                            ✦ Morning erections are a key indicator of cardiovascular and hormonal health.
                        </Text>
                    </View>

                    {/* Add Custom Health Entry for Men */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={onAddCustomSymptom}
                        style={[
                            tab.chip,
                            { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent', marginTop: 12 }
                        ]}
                    >
                        <Text style={[tab.chipText, { color: 'rgba(255,255,255,0.5)' }]}>
                            + LOG FEELING
                        </Text>
                    </TouchableOpacity>
                </GlassCard>
            )}

            {/* Mutual Sharing: Partner's Logged Telemetry */}
            {partnerSymptoms && partnerSymptoms.length > 0 && (
                <GlassCard style={[tab.bodyCard, { borderColor: 'rgba(52, 211, 153, 0.2)' }]} intensity={8}>
                    <Text style={tab.bodyCardLabel}>{(partnerName || 'PARTNER').toUpperCase()}'S TELEMETRY</Text>
                    <Text style={tab.bodyCardTitle}>Reported symptoms today</Text>
                    <View style={tab.chipGrid}>
                        {partnerSymptoms.map((symptom: string) => (
                            <View key={symptom} style={[tab.chip, { backgroundColor: 'rgba(52, 211, 153, 0.1)', borderColor: 'rgba(52, 211, 153, 0.3)' }]}>
                                <Text style={[tab.chipText, { color: '#34d399' }]}>{symptom}</Text>
                            </View>
                        ))}
                    </View>
                </GlassCard>
            )}

            {/* Libido-Boosting Nutrition (Flo-inspired Quick Win) */}
            {phase && (
                <GlassCard style={tab.bodyCard} intensity={8}>
                    <Text style={tab.bodyCardLabel}>HORMONE-ALIGNED NUTRITION</Text>
                    <Text style={tab.bodyCardTitle}>Libido-Boosting Foods</Text>

                    <View style={{ marginTop: 12, gap: 12 }}>
                        {phase.name === 'Menstrual' && (
                            <>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🍫</Text>
                                    <View>
                                        <Text style={tab.foodName}>Dark Chocolate</Text>
                                        <Text style={tab.foodBenefit}>Magnesium for mood & pain relief</Text>
                                    </View>
                                </View>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🥬</Text>
                                    <View>
                                        <Text style={tab.foodName}>Iron-Rich Greens</Text>
                                        <Text style={tab.foodBenefit}>Replenish energy lost during flow</Text>
                                    </View>
                                </View>
                            </>
                        )}
                        {phase.name === 'Follicular' && (
                            <>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🥗</Text>
                                    <View>
                                        <Text style={tab.foodName}>Fermented Foods</Text>
                                        <Text style={tab.foodBenefit}>Metabolize rising estrogen efficiently</Text>
                                    </View>
                                </View>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🥜</Text>
                                    <View>
                                        <Text style={tab.foodName}>Brazil Nuts</Text>
                                        <Text style={tab.foodBenefit}>Selenium for follicular health</Text>
                                    </View>
                                </View>
                            </>
                        )}
                        {phase.name === 'Ovulatory' && (
                            <>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🦪</Text>
                                    <View>
                                        <Text style={tab.foodName}>Zinc-Rich Foods</Text>
                                        <Text style={tab.foodBenefit}>Supports peak libido & egg release</Text>
                                    </View>
                                </View>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🍓</Text>
                                    <View>
                                        <Text style={tab.foodName}>High Fiber Fruit</Text>
                                        <Text style={tab.foodBenefit}>Flush excess hormones after the peak</Text>
                                    </View>
                                </View>
                            </>
                        )}
                        {phase.name === 'Luteal' && (
                            <>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🍠</Text>
                                    <View>
                                        <Text style={tab.foodName}>Complex Carbs</Text>
                                        <Text style={tab.foodBenefit}>Sweet potato/Oats for serotonin</Text>
                                    </View>
                                </View>
                                <View style={tab.foodRow}>
                                    <Text style={tab.foodEmoji}>🥑</Text>
                                    <View>
                                        <Text style={tab.foodName}>Healthy Fats</Text>
                                        <Text style={tab.foodBenefit}>Anchor progesterone production</Text>
                                    </View>
                                </View>
                            </>
                        )}
                    </View>
                </GlassCard>
            )}

        </Animated.View>
    );
}

BodyTab.displayName = 'BodyTab';
