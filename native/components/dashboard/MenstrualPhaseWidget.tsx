import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Moon } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { getCycleDay, getPhaseForDay } from '../../lib/cycle';

export const MenstrualPhaseWidget = React.memo(() => {
    const { profile, partnerProfile } = useOrbitStore();
    const isFemale = profile?.gender === 'female';
    const cycleProfile = isFemale ? profile?.cycle_profile : partnerProfile?.cycle_profile;

    let computedPhase: string = '';
    const phaseContext = isFemale ? profile?.menstrual_cycle : partnerProfile?.menstrual_cycle;

    if (cycleProfile?.last_period_start) {
        const currentDay = getCycleDay(cycleProfile.last_period_start, cycleProfile.avg_cycle_length || 28);
        const phaseObj = getPhaseForDay(currentDay, cycleProfile.avg_cycle_length || 28, cycleProfile.avg_period_length || 5);
        computedPhase = phaseObj.name.toLowerCase();
    } else if (phaseContext && typeof phaseContext === 'object') {
        computedPhase = (phaseContext.current_phase || 'follicular').toLowerCase();
    } else {
        computedPhase = 'follicular'; // Stable fallback
    }
    const phase = computedPhase;
    const [photo, setPhoto] = useState<{ url: string; name: string; link: string } | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchPhoto = async () => {
            const dateStr = new Date().toISOString().split('T')[0];
            const cacheKey = `unsplash_v2_${phase}_${dateStr}`;
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) {
                    if (isMounted) setPhoto(JSON.parse(cached));
                    return;
                }

                const queries = {
                    menstrual: "cozy,connection,comfort,hug,home",
                    follicular: "passion,romance,couple,dating,energy",
                    ovulatory: "intimacy,attraction,romance,embrace,glow",
                    luteal: "gentle,calm,intimacy,support,tranquil"
                };
                const query = queries[phase as keyof typeof queries] || queries.follicular;
                const accessKey = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY?.trim();

                if (!accessKey) {
                    return;
                }

                const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (!res.ok) return;
                const data = await res.json();

                if (data && data.urls && isMounted) {
                    const photoData = {
                        url: data.urls.regular,
                        name: data.user.name,
                        link: data.user.links.html
                    };
                    setPhoto(photoData);
                    await AsyncStorage.setItem(cacheKey, JSON.stringify(photoData));
                    if (data.links?.download_location) {
                        fetch(`${data.links.download_location}`, {
                            headers: { 'Authorization': `Client-ID ${accessKey}` }
                        }).catch(() => { });
                    }
                }
            } catch (e) {
                console.warn("[Unsplash] fetch failed:", e);
            }
        };

        fetchPhoto();
        return () => { isMounted = false; };
    }, [phase]);

    // ðŸš€ Stability Fix: Early return moved AFTER all hooks
    if (!phase) return null;

    const phaseTitles = {
        menstrual: "Menstrual Phase",
        follicular: "Follicular Phase",
        ovulatory: "Ovulatory Phase",
        luteal: "Luteal Phase"
    };

    const phaseTips = {
        menstrual: "Time for deep rest and comfort.",
        follicular: "Energy is rising. Perfect time for new experiences together.",
        ovulatory: "Peak magnetism and confidence. Shine bright.",
        luteal: "A gentler pace. Focus on inward calm and connection."
    };

    return (
        <Animated.View>
            <GlassCard style={[styles.menstrualCard, { overflow: 'hidden', padding: 0 }]} intensity={10}>
                {photo?.url && (
                    <Image
                        source={{ uri: photo.url }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        transition={500}
                    />
                )}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />

                <View style={{ padding: 24, flex: 1, minHeight: 160, justifyContent: 'space-between' }}>
                    <View>
                        <View style={[styles.menstrualHeader, { marginBottom: 16 }]}>
                            <Moon size={22} color="white" strokeWidth={2.5} />
                            <View style={{ marginLeft: 12 }}>
                                <Text style={[
                                    styles.menstrualTitle,
                                    { color: 'white', textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                                ]}>
                                    {phaseTitles[phase as keyof typeof phaseTitles]}
                                </Text>
                            </View>
                        </View>
                        <Text style={[
                            styles.menstrualTip,
                            { color: 'rgba(255,255,255,0.95)', marginTop: 16, lineHeight: 22, fontSize: 15, textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }
                        ]}>
                            {phaseTips[phase as keyof typeof phaseTips]}
                        </Text>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    menstrualCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24 },
    menstrualHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    menstrualTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
    menstrualSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
    menstrualTip: { color: 'rgba(255,255,255,0.88)', fontSize: 15, fontFamily: Typography.serifItalic, marginBottom: 24, lineHeight: 22 },
});
