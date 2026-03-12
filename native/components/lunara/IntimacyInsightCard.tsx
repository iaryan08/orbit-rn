import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Flame, Heart, Sparkles } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INTIMACY_INSIGHTS } from '../../lib/sexPositionData';
import { Colors, Typography, Spacing } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';

interface IntimacyInsightCardProps {
    phaseName: string;
    cycleDay?: number | null;
    type?: 'position' | 'self-love' | 'coaching';
}

export function IntimacyInsightCard({ phaseName, cycleDay, type }: IntimacyInsightCardProps) {
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
                const resp = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(keyword + ' intimacy love aesthetic')}&client_id=${process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY}`);
                const data = await resp.json();
                if (data.urls?.small && isMounted) {
                    const url = data.urls.small; // Use 'small' for faster loading/lower RAM
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

    const Icon = dailyInsight.type === 'position' ? Flame :
        dailyInsight.type === 'self-love' ? Heart : Sparkles;

    const iconColor = dailyInsight.type === 'position' ? '#fb7185' :
        dailyInsight.type === 'self-love' ? '#818cf8' : '#fbbf24';

    return (
        <GlassCard style={styles.card} intensity={8}>
            <View style={styles.thumbnailWrapper}>
                {imageUri ? (
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.thumbnail}
                        contentFit="cover"
                        transition={300} // Smooth fade-in
                        cachePolicy="disk" // Lazy loading & offline cache
                    />
                ) : (
                    <View style={[styles.thumbnail, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
                )}
            </View>

            <View style={styles.content}>
                <View style={styles.header}>
                    <Icon size={12} color={iconColor} />
                    <Text style={styles.typeText}>{dailyInsight.type.toUpperCase()}</Text>
                </View>
                <Text style={styles.title} numberOfLines={1}>{dailyInsight.name}</Text>
                <Text style={styles.description} numberOfLines={2}>{dailyInsight.description}</Text>
            </View>
        </GlassCard>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: Spacing.md,
        padding: 12,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    thumbnailWrapper: {
        width: 80,
        height: 80,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    content: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    typeText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.8,
    },
    title: {
        fontSize: 16,
        fontFamily: Typography.sansBold,
        color: 'white',
        marginBottom: 2,
    },
    description: {
        fontSize: 13,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 18,
    },
});
