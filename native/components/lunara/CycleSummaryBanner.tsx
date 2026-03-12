import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Typography, Radius, Spacing } from '../../constants/Theme';
import { Droplets, Clock, TrendingUp } from 'lucide-react-native';
import { CyclePrediction, PhaseWindow } from '../../lib/cycle';
import * as Haptics from 'expo-haptics';

interface CycleSummaryBannerProps {
    cycleDay: number | null;
    phase: PhaseWindow | null;
    prediction: CyclePrediction | null;
    onLogPeriod: () => void;
    isLogging?: boolean;
}

export const CycleSummaryBanner = React.memo(({ cycleDay, phase, prediction, onLogPeriod, isLogging }: CycleSummaryBannerProps) => {
    const [bgImage, setBgImage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchBg = async () => {
            if (!phase?.name) return;
            const phaseName = phase.name.toLowerCase();
            const cacheKey = `unsplash_summary_${phaseName}_${new Date().toISOString().split('T')[0]}`;
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) { if (isMounted) setBgImage(cached); return; }

                const queries = {
                    menstrual: "cozy,serene,calm,water",
                    follicular: "blooming,spring,vitality,energy",
                    ovulatory: "radiant,attraction,passion,intimacy",
                    luteal: "tranquil,sunset,starlight,dreamy"
                };
                const query = queries[phaseName.toLowerCase() as keyof typeof queries] || "wellness,serene";
                const accessKeyRaw = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;
                const accessKey = accessKeyRaw?.trim();

                if (!accessKey) {
                    console.warn("[Unsplash Summary] Access key missing.");
                    return;
                }

                const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.urls?.regular && isMounted) {
                        setBgImage(data.urls.regular);
                        try {
                            await AsyncStorage.setItem(cacheKey, data.urls.regular);
                        } catch (e) { }
                        if (data.links?.download_location) {
                            fetch(`${data.links.download_location}`, {
                                headers: { 'Authorization': `Client-ID ${accessKey}` }
                            }).catch(() => { });
                        }
                    }
                } else {
                    const err = await res.text();
                    console.warn(`[Unsplash Summary] fetch failed (${res.status}):`, err);
                }
            } catch (e) { console.warn("[Unsplash Summary] Error:", e); }
        };
        fetchBg();
        return () => { isMounted = false; };
    }, [phase?.name]);

    if (!cycleDay || !phase || !prediction) {
        return (
            <View style={styles.container}>
                <View style={styles.emptyState}>
                    <Droplets size={20} color="rgba(251,113,133,0.6)" />
                    <Text style={styles.emptyText}>Log your last period to begin tracking</Text>
                </View>
            </View>
        );
    }

    const confidenceColor = prediction.confidence === 'High' ? '#34d399'
        : prediction.confidence === 'Fair' ? '#fbbf24' : 'rgba(255,255,255,0.35)';

    return (
        <View style={[styles.container, { overflow: 'hidden', padding: 0 }]}>
            {bgImage && (
                <Image
                    source={{ uri: bgImage }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="cover"
                    transition={500}
                />
            )}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(5,5,10,0.65)' }]} />

            <View style={{ padding: 20 }}>
                {/* Main info row */}
                <View style={styles.mainRow}>
                    <View style={styles.dayBlock}>
                        <Text style={[
                            styles.dayNumber,
                            { color: phase.color, textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                        ]}>{cycleDay}</Text>
                        <Text style={[
                            styles.dayLabel,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>CYCLE DAY</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.phaseBlock}>
                        <Text style={[
                            styles.phaseName,
                            { color: phase.color, textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                        ]}>{phase.name}</Text>
                        <Text style={[
                            styles.phaseEnergy,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>Energy: {phase.energy}</Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.nextBlock}>
                        <Text style={[
                            styles.nextValue,
                            { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                        ]}>{Math.max(0, prediction.daysUntil)}d</Text>
                        <Text style={[
                            styles.nextLabel,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>NEXT PERIOD</Text>
                    </View>
                </View>

                {/* Confidence + Irregularity */}
                <View style={styles.bottomRow}>
                    <View style={[styles.confidencePill, { borderColor: confidenceColor }]}>
                        <TrendingUp size={10} color={confidenceColor} />
                        <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                            {prediction.confidence === 'High' ? 'Prediction Locked' : prediction.confidence === 'Fair' ? 'Learning...' : 'Calibrating'}
                        </Text>
                    </View>

                    {prediction.isIrregular && (
                        <View style={styles.irregularPill}>
                            <Text style={styles.irregularText}>⚠ Irregular pattern</Text>
                        </View>
                    )}

                    <Pressable
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLogPeriod(); }}
                        disabled={isLogging}
                        style={({ pressed }) => [
                            styles.logBtn,
                            phase.name === 'Menstrual' && styles.endBtn,
                            { opacity: pressed || isLogging ? 0.5 : 1 }
                        ]}
                    >
                        <Droplets size={12} color={phase.name === 'Menstrual' ? '#fbbf24' : '#fb7185'} />
                        <Text style={[styles.logBtnText, phase.name === 'Menstrual' && styles.endBtnText]}>
                            {isLogging ? 'Logging...' : (phase.name === 'Menstrual' ? 'End Period' : 'Log Period')}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        padding: 0, // Changed to 0 since we have inner padding 20
    },
    emptyState: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, justifyContent: 'center' },
    emptyText: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)' },
    mainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20 },
    dayBlock: { alignItems: 'center' },
    dayNumber: { fontSize: 40, fontFamily: Typography.sansBold, lineHeight: 44 },
    dayLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginTop: 2 },
    divider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.06)' },
    phaseBlock: { alignItems: 'center' },
    phaseName: { fontSize: 18, fontFamily: Typography.serifBold, marginBottom: 4 },
    phaseEnergy: { fontSize: 10, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 },
    nextBlock: { alignItems: 'center' },
    nextValue: { fontSize: 28, fontFamily: Typography.sansBold, color: 'white', lineHeight: 32 },
    nextLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginTop: 2 },
    bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    confidencePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
    confidenceText: { fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 0.5 },
    irregularPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
    irregularText: { fontSize: 9, fontFamily: Typography.sansBold, color: '#fbbf24', letterSpacing: 0.5 },
    logBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(251,113,133,0.1)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.25)', marginLeft: 'auto' },
    logBtnText: { fontSize: 10, fontFamily: Typography.sansBold, color: '#fb7185', letterSpacing: 0.5 },
    endBtn: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.3)' },
    endBtnText: { color: '#fbbf24' },
});
