import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles, Target, Quote } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { PremiumTabLoader } from '../PremiumTabLoader';

export const DailyInspirationWidget = React.memo(({ variant = 'card' }: { variant?: 'card' | 'banner' }) => {
    const dailyInspiration = useOrbitStore(s => s.dailyInspiration);
    const loadDailyInspiration = useOrbitStore(s => s.loadDailyInspiration);
    const isLoadingInspiration = useOrbitStore(s => s.isLoadingInspiration);
    const [activeTab, setActiveTab] = useState<'quote' | 'challenge' | 'tip'>('quote');

    useEffect(() => {
        loadDailyInspiration();
    }, [loadDailyInspiration]);

    const content = useMemo(() => {
        const data = dailyInspiration || {
            quote: "Love is not a destination we reach, but the quiet rhythm of our shadows walking in perfect sync.",
            challenge: "Write a small note of appreciation and leave it somewhere they'll find it today.",
            tip: "Practicing active listening means hearing the emotions behind the words, not just the words themselves."
        };

        switch (activeTab) {
            case 'challenge':
                return {
                    title: "GENTLE CHALLENGE",
                    text: data.challenge,
                    icon: <Target size={18} color={Colors.dark.rose[400]} />
                };
            case 'tip':
                return {
                    title: "RELATIONSHIP TIP",
                    text: data.tip,
                    icon: <Sparkles size={18} color={Colors.dark.emerald[400]} />
                };
            default:
                return {
                    title: "DAILY QUOTE",
                    text: data.quote,
                    icon: <Quote size={18} color={Colors.dark.rose[400]} />
                };
        }
    }, [activeTab, dailyInspiration]);

    if (isLoadingInspiration && variant === 'card') {
        return (
            <GlassCard style={[styles.inspirationCard, { justifyContent: 'center', height: 280 }]} intensity={10}>
                <PremiumTabLoader color={Colors.dark.indigo[400]} message="Curating Inspiration..." />
            </GlassCard>
        );
    }

    if (variant === 'banner') {
        return (
            <Animated.View>
                <View style={styles.morningInsightBanner}>
                    <View style={styles.morningInsightHeader}>
                        <Text style={styles.morningInsightLabel}>DAILY INSPIRATION</Text>
                    </View>
                    <Text
                        style={[styles.inspirationCardText, activeTab === 'quote' && styles.quoteItalicStyle]}
                        adjustsFontSizeToFit={true}
                        numberOfLines={3}
                    >
                        {activeTab === 'quote' ? `"${content.text}"` : content.text}
                    </Text>
                </View>
            </Animated.View>
        );
    }

    return (
        <Animated.View>
            <GlassCard style={styles.inspirationCard} intensity={12}>
                {/* Tabs Toggle */}
                <View style={styles.tabToggleHeader}>
                    <View style={styles.tabToggleContainer}>
                        {(['quote', 'challenge', 'tip'] as const).map((tab) => {
                            const isSelected = activeTab === tab;
                            return (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setActiveTab(tab);
                                    }}
                                    style={[
                                        styles.tabToggleItem,
                                        isSelected && styles.tabToggleActive
                                    ]}
                                >
                                    <Text style={[
                                        styles.tabToggleText,
                                        isSelected && styles.tabToggleActiveText
                                    ]}>
                                        {tab.toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.contentBody}>
                    <View style={styles.contentTitleRow}>
                        <Text style={[styles.contentTitle, { color: activeTab === 'tip' ? Colors.dark.emerald[400] : Colors.dark.rose[400] }]}>
                            {content.title}
                        </Text>
                    </View>
                    <View style={styles.quoteWrap}>
                        <Text
                            style={[
                                styles.inspirationCardText,
                                activeTab === 'quote' && styles.quoteItalicStyle
                            ]}
                            adjustsFontSizeToFit={true}
                            minimumFontScale={0.7}
                            numberOfLines={5}
                        >
                            {activeTab === 'quote' ? `"${content.text}"` : content.text}
                        </Text>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    inspirationCard: {
        padding: 24,
        marginBottom: 16,
        minHeight: 260,
    },
    inspirationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 24,
    },
    inspirationTitle: {
        fontSize: 18,
        fontFamily: Typography.serifItalic, // Poetic Voice
        color: 'white',
    },
    tabToggleHeader: {
        marginBottom: 24,
    },
    tabToggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        padding: 4,
    },
    tabToggleItem: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    tabToggleActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    tabToggleText: {
        fontSize: 10,
        fontFamily: Typography.sansBold, // Outfit
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    tabToggleActiveText: {
        color: 'white',
    },
    contentBody: {
        flex: 1,
        justifyContent: 'center',
    },
    contentTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    contentTitle: {
        fontSize: 11,
        fontFamily: Typography.sansBold, // Syne for sharp technical feel
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    quoteWrap: {
        minHeight: 120,
        justifyContent: 'center',
    },
    inspirationCardText: {
        fontSize: 18,
        lineHeight: 26,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.95)',
    },
    quoteItalicStyle: {
        fontFamily: Typography.serifItalic, // Bodoni Italic
        color: 'white',
        letterSpacing: -0.2,
    },
    quoteMark: {
        display: 'none', // Modern minimalistic approach (cleaner)
    },
    morningInsightBanner: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        padding: 24,
        borderRadius: 28,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    morningInsightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    morningInsightLabel: {
        fontSize: 13,
        fontFamily: Typography.display, // Bodoni (Vogue vibes)
        color: 'rgba(255,255,260,0.8)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
});
