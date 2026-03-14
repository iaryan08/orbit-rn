import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated from 'react-native-reanimated';
import { Typography, Spacing, Radius } from '../../constants/Theme';
import { ChevronDown, Info } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import * as Haptics from 'expo-haptics';

interface HormonePhaseDetailProps {
    phaseName: string;
    phaseColor: string;
}

const HORMONE_DATA: Record<string, { estrogen: string; progesterone: string; testosterone: string; summary: string }> = {
    Menstrual: {
        estrogen: 'Rising Low',
        progesterone: 'Very Low',
        testosterone: 'Low',
        summary: 'Both estrogen and progesterone are at their monthly lows. This triggers the shedding of the uterine lining. As the phase progresses, estrogen starts its slow climb, beginning the process of building a new lining and maturing a new follicle.',
    },
    Follicular: {
        estrogen: 'Rapidly Rising',
        progesterone: 'Low',
        testosterone: 'Rising',
        summary: 'Estrogen is the star here, climbing sharply as follicles mature. This thickens the uterine lining and boosts your energy, mood, and brain power. Testosterone also begins to rise, increasing your physical strength and focus.',
    },
    Ovulatory: {
        estrogen: 'Peak',
        progesterone: 'Starting to Rise',
        testosterone: 'Peak',
        summary: 'Estrogen and Testosterone reach their monthly peak, triggering the LH surge and the release of an egg. This 48-hour window is your biological apex of energy, verbal fluency, and social magnetism.',
    },
    Luteal: {
        estrogen: 'Moderate / Falling',
        progesterone: 'Peak',
        testosterone: 'Falling',
        summary: 'Progesterone takes over, rising to its peak to maintain the uterine lining. This has a calming, sometimes sedating effect on the nervous system. Toward the end of the phase, both hormones drop sharply, which can trigger PMS symptoms.',
    },
};

const FADE_IN_DOWN = undefined; // Android-only: entering animations crash at module-level

export const HormonePhaseDetail = ({ phaseName, phaseColor }: HormonePhaseDetailProps) => {
    const [expanded, setExpanded] = useState(false);
    const [hormonePhoto, setHormonePhoto] = useState<string | null>(null);
    const data = HORMONE_DATA[phaseName] || HORMONE_DATA['Follicular'];

    useEffect(() => {
        let isMounted = true;
        const fetchPhoto = async () => {
            const cacheKey = `unsplash_hormone_${phaseName.toLowerCase()}_${new Date().toISOString().split('T')[0]}`;
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) { if (isMounted) setHormonePhoto(cached); return; }

                const queries = {
                    menstrual: "abstract,calm,water,serene",
                    follicular: "abstract,growth,vitality,cells",
                    ovulatory: "abstract,glow,peak,energy",
                    luteal: "abstract,moonlight,reflection,tranquil"
                };
                const query = queries[phaseName.toLowerCase() as keyof typeof queries] || "abstract,biology";
                const accessKeyRaw = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;
                const accessKey = accessKeyRaw?.trim();

                if (!accessKey) {
                    console.warn("[Unsplash Hormone] Access key missing.");
                    return;
                }

                const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.urls?.regular && isMounted) {
                        setHormonePhoto(data.urls.regular);
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
                    console.warn(`[Unsplash Hormone] fetch failed (${res.status}):`, err);
                }
            } catch (e) { console.warn("[Unsplash Hormone] Error:", e); }
        };
        fetchPhoto();
        return () => { isMounted = false; };
    }, [phaseName]);

    const toggle = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setExpanded(!expanded);
    };

    return (
        <GlassCard style={[styles.card, { padding: 0, overflow: 'hidden' }]} intensity={8}>
            {hormonePhoto && (
                <Image
                    source={{ uri: hormonePhoto }}
                    style={[StyleSheet.absoluteFillObject, { opacity: 0.4 }]}
                    contentFit="cover"
                    transition={500}
                />
            )}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />

            <View style={{ padding: 22 }}>
                <Pressable onPress={toggle} style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Info size={14} color={phaseColor} />
                        <Text style={styles.label}>HORMONE DYNAMICS</Text>
                    </View>
                    <ChevronDown
                        size={16}
                        color="rgba(255,255,255,0.3)"
                        style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                    />
                </Pressable>

                <Text style={[
                    styles.title,
                    { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                ]}>Chemical Profile: {phaseName}</Text>

                <View style={styles.levelsRow}>
                    <View style={styles.levelItem}>
                        <Text style={[
                            styles.levelVal,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>{data.estrogen}</Text>
                        <Text style={[
                            styles.levelLabel,
                            { textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }
                        ]}>ESTROGEN</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.levelItem}>
                        <Text style={[
                            styles.levelVal,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>{data.progesterone}</Text>
                        <Text style={[
                            styles.levelLabel,
                            { textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }
                        ]}>PROGESTERONE</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.levelItem}>
                        <Text style={[
                            styles.levelVal,
                            { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                        ]}>{data.testosterone}</Text>
                        <Text style={[
                            styles.levelLabel,
                            { textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }
                        ]}>TESTOSTERONE</Text>
                    </View>
                </View>

                {expanded && (
                    <Animated.View entering={FADE_IN_DOWN} style={styles.content}>
                        <Text style={styles.summary}>{data.summary}</Text>
                    </Animated.View>
                )}
            </View>
        </GlassCard>
    );
};

const styles = StyleSheet.create({
    card: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5 },
    title: { fontSize: 18, fontFamily: Typography.serifBold, color: 'white', marginBottom: 20 },
    levelsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.lg, padding: 14 },
    levelItem: { flex: 1, alignItems: 'center' },
    levelVal: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
    levelLabel: { fontSize: 7, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 },
    divider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
    content: { marginTop: 18, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    summary: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', lineHeight: 22 },
});
