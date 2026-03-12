import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Flame, Heart, Sparkles } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INTIMACY_INSIGHTS } from '../../lib/sexPositionData';
import { Colors, Typography, Spacing } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { LinearGradient } from 'expo-linear-gradient';

interface IntimacyInsightCardProps {
    phaseName: string;
    cycleDay?: number | null;
    type?: 'position' | 'self-love' | 'coaching';
    isMale?: boolean; // Shows male partner coaching instead of female self-coaching
}

export function IntimacyInsightCard({ phaseName, cycleDay, type, isMale = false }: IntimacyInsightCardProps) {
    const dailyInsight = useMemo(() => {
        const insights = INTIMACY_INSIGHTS[phaseName as keyof typeof INTIMACY_INSIGHTS] || [];
        const filtered = type ? insights.filter(i => i.type === type) : insights;
        if (filtered.length === 0) return null;

        let seed = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        if (cycleDay) seed = cycleDay;

        return filtered[seed % filtered.length];
    }, [phaseName, type, cycleDay]);

    const [imageUri, setImageUri] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchImg = async () => {
            if (!dailyInsight) return;
            const todayStr = new Date().toISOString().split('T')[0];
            const cacheKey = `daily_intimacy_img_${dailyInsight.name.replace(/\s+/g, '_')}_${todayStr}`;
            const cached = await AsyncStorage.getItem(cacheKey);

            if (cached && isMounted) {
                setImageUri(cached);
                return;
            }

            try {
                const keyword = dailyInsight.keywords[0];
                // Use warm/colorful terms to avoid Unsplash returning B&W editorial photos
                const colorQuery = isMale
                    ? `${keyword} warm golden light couple color`
                    : `${keyword} warm vibrant natural light color`;
                const resp = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(colorQuery)}&orientation=landscape&client_id=${process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY}`);
                const data = await resp.json();
                if (data.urls?.regular && isMounted) {
                    const url = data.urls.regular; // Use 'regular' for better quality on large cards
                    setImageUri(url);
                    await AsyncStorage.setItem(cacheKey, url);
                }
            } catch (e) {
                console.warn("Image fetch error:", e);
            }
        };
        fetchImg();
        return () => { isMounted = false; };
    }, [dailyInsight]);

    if (!dailyInsight) return null;

    // For male users on 'coaching' type: override description with partner-care advice
    const MALE_COACHING: Record<string, string> = {
        Menstrual: "She's in a rest phase. Don't push plans or over-talk. Warmth, quiet, and physical comfort are your strongest moves.",
        Follicular: "Her confidence is rising. Plan something to match her energy — new experiences and intellectual conversations land best now.",
        Ovulatory: "She's magnetic and social. Keep up, stay present. Bold gestures and quality time together thrive in this window.",
        Luteal: "Her sensitivity is elevated. Be steady, not defensive. Hold space — don't problem-solve unless asked.",
    };
    const displayDescription = (isMale && dailyInsight.type === 'coaching')
        ? (MALE_COACHING[phaseName] || dailyInsight.description)
        : dailyInsight.description;

    const Icon = dailyInsight.type === 'position' ? Flame :
        dailyInsight.type === 'self-love' ? Heart : Sparkles;

    const iconColor = dailyInsight.type === 'position' ? '#fb7185' :
        dailyInsight.type === 'self-love' ? '#818cf8' : '#fbbf24';

    return (
        <GlassCard style={styles.card} intensity={0}>
            <View style={styles.imageWrapper}>
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.fullImage}
                        contentFit="cover"
                        transition={400}
                        cachePolicy="disk"
                    />
                ) : (
                    <View style={[styles.fullImage, { backgroundColor: 'rgba(255,255,255,0.03)' }]} />
                )}

                {/* Gentle Fade Gradient for Text Readability & Integration */}
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
                    style={StyleSheet.absoluteFillObject}
                />

                <View style={styles.floatingHeader}>
                    <Icon size={14} color={iconColor} />
                    <Text style={[styles.typeText, { color: iconColor }]}>{dailyInsight.type.toUpperCase()}</Text>
                </View>
            </View>

            <View style={styles.content}>
                <Text style={styles.title}>{dailyInsight.name}</Text>
                <Text style={styles.description}>{displayDescription}</Text>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: Spacing.lg,
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(5,5,10,0.85)',
    },
    imageWrapper: {
        width: '100%',
        height: 240,
        position: 'relative',
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    floatingHeader: {
        position: 'absolute',
        top: 20,
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
    },
    typeText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.2,
    },
    content: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        paddingTop: 10, // Reduced gap from image
    },
    title: {
        fontSize: 24,
        fontFamily: Typography.serifBold,
        color: 'white',
        marginBottom: 8,
    },
    description: {
        fontSize: 15,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 24,
    },
});
