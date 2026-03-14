import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Flame, Heart, Sparkles } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INTIMACY_INSIGHTS } from '../../lib/sexPositionData';
import { Colors, Typography, Spacing, Radius } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { LinearGradient } from 'expo-linear-gradient';
import { stringToHash } from '../../lib/utils';

const { width } = Dimensions.get('window');

interface IntimacyInsightCardProps {
    phaseName: string;
    cycleDay?: number | null;
    type?: 'position' | 'self-love' | 'coaching';
    isMale?: boolean;
    coupleId?: string;
}

export function IntimacyInsightCard({ phaseName, cycleDay, type, isMale = false, coupleId }: IntimacyInsightCardProps) {
    const dailyInsight = useMemo(() => {
        const insights = INTIMACY_INSIGHTS[phaseName as keyof typeof INTIMACY_INSIGHTS] || [];
        const filtered = type ? insights.filter(i => i.type === type) : insights;
        if (filtered.length === 0) return null;

        const now = new Date();
        const hour = now.getHours();
        const isPM = hour >= 12;
        const coupleHash = coupleId ? stringToHash(coupleId) : 0;

        // Seed logic: (Day * 2) + (0 for AM, 1 for PM) + Couple Offset
        let seed = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 43200000) + coupleHash;
        if (cycleDay) {
            seed = (cycleDay * 2) + (isPM ? 1 : 0) + coupleHash;
        }

        return filtered[seed % filtered.length];
    }, [phaseName, type, cycleDay, coupleId]);

    const [imageUri, setImageUri] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchImg = async () => {
            if (!dailyInsight) return;
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const isPM = now.getHours() >= 12;
            const windowSuffix = isPM ? 'PM' : 'AM';
            const coupleHash = coupleId ? stringToHash(coupleId) : 0;
            const cacheKey = `daily_intimacy_img_${dailyInsight.name.replace(/\s+/g, '_')}_${todayStr}_${windowSuffix}_${coupleHash}`;

            const cached = await AsyncStorage.getItem(cacheKey);
            if (cached && isMounted) {
                setImageUri(cached);
                return;
            }

            try {
                // Type-specific generic context (PREMIUM & INTIMATE)
                let typeContext = 'intimate aesthetic couple';
                if (dailyInsight.type === 'position') {
                    typeContext = 'sensual couple embrace bedroom';
                } else if (dailyInsight.type === 'self-love') {
                    typeContext = 'ethereal woman morning light';
                } else if (dailyInsight.type === 'coaching') {
                    typeContext = 'couple deep connection eye contact';
                }

                const keyword = dailyInsight.keywords[0] || typeContext;

                // Enhanced query for better aesthetics
                const query = `${keyword} moody lighting`;

                const resp = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&client_id=${process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY}`);

                if (!resp.ok) {
                    // Fallback to generic context if specific keyword fails
                    const fallbackResp = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(typeContext)}&orientation=portrait&client_id=${process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY}`);
                    const fallbackData = await fallbackResp.json();
                    if (fallbackData.urls?.regular && isMounted) {
                        const url = fallbackData.urls.regular;
                        setImageUri(url);
                        await AsyncStorage.setItem(cacheKey, url);
                    }
                    return;
                }

                const data = await resp.json();
                if (data.urls?.regular && isMounted) {
                    const url = data.urls.regular;
                    setImageUri(url);
                    await AsyncStorage.setItem(cacheKey, url);
                }
            } catch (e) {
                console.warn("Image fetch error:", e);
                // Last resort fallback
                if (isMounted) setImageUri('https://images.unsplash.com/photo-1516589174184-c6858b16ecb0?q=80&w=1000&auto=format&fit=crop');
            }
        };
        fetchImg();
        return () => { isMounted = false; };
    }, [dailyInsight?.name, isMale, coupleId]);

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
        <View style={styles.card}>
            {/* Media Frame - Matches Memory style */}
            <View style={styles.mediaFrame}>
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

                <LinearGradient
                    colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
                    locations={[0, 0.4, 0.6, 1]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Floating Type Chip - Matches Memory's top-left avatar position */}
                <View style={styles.floatingIdentity}>
                    <GlassCard intensity={8} style={styles.identityChip}>
                        <View style={styles.chipContent}>
                            <Icon size={12} color={iconColor} />
                            <Text style={[styles.typeText, { color: iconColor }]}>
                                {dailyInsight.type.toUpperCase()}
                            </Text>
                        </View>
                    </GlassCard>
                </View>

                {/* Caption Area - Now INSIDE the Media Frame */}
                <View style={styles.captionOverlay}>
                    <Text style={styles.captionTitle}>{dailyInsight.name}</Text>
                    <Text style={styles.captionText}>{displayDescription}</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 20,
        backgroundColor: 'transparent',
    },
    mediaFrame: {
        width: width - (Spacing.md * 2),
        aspectRatio: 0.82,
        backgroundColor: '#050505',
        position: 'relative',
        borderRadius: Radius.xl,
        overflow: 'hidden',
        marginHorizontal: Spacing.md,
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
    floatingIdentity: {
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 10,
    },
    identityChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    typeText: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
    captionOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: 24,
        paddingTop: 40,
        gap: 8,
    },
    captionTitle: {
        color: 'white',
        fontSize: 26,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.5,
    },
    captionText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        lineHeight: 22,
        fontFamily: Typography.sans,
    },
});
