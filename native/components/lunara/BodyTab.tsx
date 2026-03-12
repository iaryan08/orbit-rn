import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Flame } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from '../GlassCard';
import { LibidoMeter } from '../../components/LibidoMeter';
import { LibidoSlider } from '../../components/LibidoSlider';
import { HormonePhaseDetail } from './HormonePhaseDetail';
import { FADE_IN, FADE_IN_DOWN_1, FADE_IN_DOWN_2, tab } from './tabStyles';

export function BodyTab({
    phase,
    todaySymptoms,
    partnerSymptoms,
    onToggleSymptom,
    currentLibido,
    onLibidoSelect,
    partnerLibido,
    partnerName,
    isFemale,
    PHASE_SYMPTOMS,
}: any) {
    const suggestedSymptoms = phase ? (PHASE_SYMPTOMS[phase.name] || []) : [];
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
                    {suggestedSymptoms.length > 0 ? (
                        <View style={tab.chipGrid}>
                            {suggestedSymptoms.map((symptom: string) => {
                                const isSelected = todaySymptoms.includes(symptom);
                                return (
                                    <Pressable
                                        key={symptom}
                                        onPress={() => onToggleSymptom(symptom)}
                                        style={({ pressed }) => [
                                            tab.chip,
                                            isSelected && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor },
                                            { opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                        ]}
                                    >
                                        <Text style={[tab.chipText, isSelected && { color: phaseColor }]}>
                                            {symptom}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ) : (
                        <Text style={tab.emptySub}>Log a period first to see phase-specific symptoms.</Text>
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
                            <Pressable
                                key={type}
                                onPress={() => onToggleSymptom(`CM_${type}`)}
                                style={({ pressed }) => [
                                    tab.chip,
                                    todaySymptoms.includes(`CM_${type}`) && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor },
                                    { opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`CM_${type}`) && { color: phaseColor }]}>
                                    {type}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* BBT */}
                    <Text style={[tab.bodyCardTitle, { marginTop: 16 }]}>Basal Body Temperature</Text>
                    <View style={tab.chipGrid}>
                        {['Normal', 'Shifted High', 'Shifted Low'].map(type => (
                            <Pressable
                                key={type}
                                onPress={() => onToggleSymptom(`BBT_${type}`)}
                                style={({ pressed }) => [
                                    tab.chip,
                                    todaySymptoms.includes(`BBT_${type}`) && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor },
                                    { opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`BBT_${type}`) && { color: phaseColor }]}>
                                    {type}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    <View style={[tab.phaseNote, { marginTop: 12 }]}>
                        <Text style={[tab.phaseNoteText, { color: 'rgba(255,255,255,0.6)' }]}>
                            ✦ A sustained BBT rise + "Egg White" mucus confirms ovulation has uniquely occurred.
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
                                    ? '✦ Peak libido phase — estrogen and testosterone are both elevated'
                                    : phase.name === 'Luteal'
                                        ? '✦ Progesterone dampens drive. Completely normal.'
                                        : phase.name === 'Follicular'
                                            ? '✦ Libido building as estrogen rises through this phase'
                                            : '✦ Rest phase — low drive is your body\'s signal for recovery'}
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
                            <Pressable
                                key={quality}
                                onPress={() => onToggleSymptom(`EQ_${quality}`)}
                                style={({ pressed }) => [
                                    tab.chip,
                                    todaySymptoms.includes(`EQ_${quality}`) && { backgroundColor: `rgba(52, 211, 153, 0.2)`, borderColor: '#34d399' },
                                    { opacity: pressed ? 0.65 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                ]}
                            >
                                <Text style={[tab.chipText, todaySymptoms.includes(`EQ_${quality}`) && { color: '#34d399' }]}>
                                    {quality}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                    <View style={tab.phaseNote}>
                        <Text style={[tab.phaseNoteText, { color: '#fbbf24' }]}>
                            ✦ Morning erections are a key indicator of cardiovascular and hormonal health.
                        </Text>
                    </View>
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

        </Animated.View>
    );
}

BodyTab.displayName = 'BodyTab';
