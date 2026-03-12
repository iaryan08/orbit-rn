import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Heart, Sparkles, BookOpen } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from '../GlassCard';
import { Radius } from '../../constants/Theme';

const FADE_IN = { opacity: 1 };

export function LearnTab({ intimacyIntel, phase, partnerName, formatContextualText, styles: tab }: any) {
    const [learnPhoto, setLearnPhoto] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchLearnPhoto = async () => {
            const phaseName = phase?.name?.toLowerCase() || 'follicular';
            const cacheKey = `unsplash_learn_${phaseName}_${new Date().toISOString().split('T')[0]}`;
            try {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached) {
                    if (isMounted) setLearnPhoto(cached);
                    return;
                }
                const accessKey = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY?.trim();
                if (!accessKey) return;

                const res = await fetch(`https://api.unsplash.com/photos/random?query=education,wellness,nature,calm`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.urls?.regular && isMounted) {
                        setLearnPhoto(data.urls.regular);
                        await AsyncStorage.setItem(cacheKey, data.urls.regular);
                    }
                }
            } catch (e) { }
        };
        fetchLearnPhoto();
        return () => { isMounted = false; };
    }, [phase]);

    return (
        <Animated.View entering={FADE_IN as any}>
            <GlassCard style={[tab.bodyCard, { padding: 0, overflow: 'hidden' }]} intensity={8}>
                <View style={{ height: 160, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    {learnPhoto && (
                        <Image
                            source={{ uri: learnPhoto }}
                            style={{ flex: 1, opacity: 0.4 }}
                            contentFit="cover"
                            transition={500}
                        />
                    )}
                </View>
                <View style={{ padding: 22 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <BookOpen size={14} color="#6366f1" />
                        <Text style={tab.bodyCardLabel}>PARTNER EDUCATION</Text>
                    </View>
                    <Text style={tab.bodyCardTitle}>How to love her this week</Text>
                    <Text style={[tab.adviceText, { borderLeftColor: '#6366f1' }]}>
                        {formatContextualText(intimacyIntel?.partnerIntimacyGuide || phase?.partnerAdvice, false)}
                    </Text>
                </View>
            </GlassCard>

            <GlassCard style={tab.bodyCard} intensity={8}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Sparkles size={14} color="#a855f7" />
                    <Text style={tab.bodyCardLabel}>INTIMACY STRATEGY</Text>
                </View>
                <Text style={tab.bodyCardTitle}>Connecting with {partnerName}</Text>
                <Text style={tab.intelFooterText}>
                    {intimacyIntel?.intimacyReasoning || "Focus on emotional safety and quality time."}
                </Text>
            </GlassCard>
        </Animated.View>
    );
}

LearnTab.displayName = 'LearnTab';
