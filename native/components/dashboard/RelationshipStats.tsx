import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Mail, Heart, Sparkles, Clock } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { parseSafeDate } from '../../lib/utils';
import * as Haptics from 'expo-haptics';

const AnimatedHeart = Animated.createAnimatedComponent(Heart);

interface RelationshipStatsProps {
    couple: any;
    lettersCount: number;
    memoriesCount: number;
    isActive?: boolean;
}

export const RelationshipStats = React.memo(({ couple, lettersCount, memoriesCount, isActive = true }: RelationshipStatsProps) => {
    const [showDetailedTimer, setShowDetailedTimer] = useState(false);
    const [timer, setTimer] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);

    const startDate = useMemo(() => {
        const dateStr = couple?.anniversary_date || couple?.paired_at || couple?.created_at;
        return parseSafeDate(dateStr);
    }, [couple?.anniversary_date, couple?.paired_at, couple?.created_at]);

    // Simple Days Counter
    const daysTogether = useMemo(() => {
        if (!startDate || isNaN(startDate.getTime())) return 0;
        const diff = new Date().getTime() - startDate.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }, [startDate]);

    const scale = useSharedValue(1);

    React.useEffect(() => {
        scale.value = 1;
    }, [isActive]);

    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const animatedHeartStyle = useAnimatedStyle(() => {
        if (isLiteMode) return { transform: [{ scale: (scale.value + 1) / 2 }] };

        const glowIntensity = (scale.value - 1) * 2;
        return {
            transform: [
                { scale: scale.value },
                { rotate: `${(scale.value - 1) * 5}deg` }
            ]
        };
    });

    return (
        <Animated.View>
            <GlassCard style={styles.statsCard} intensity={12}>
                <View style={styles.statsRow}>
                    <View style={styles.statMini}>
                        <AnimatedHeart
                            size={24}
                            color={Colors.dark.rose[400]}
                            fill={Colors.dark.rose[400]}
                            style={animatedHeartStyle}
                        />
                        <Text style={styles.statMiniValue}>{daysTogether}</Text>
                    </View>

                    <View style={styles.statMini}>
                        <Mail size={24} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                        <Text style={styles.statMiniValue}>{lettersCount}</Text>
                    </View>

                    <View style={styles.statMini}>
                        <Sparkles size={24} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
                        <Text style={styles.statMiniValue}>{memoriesCount}</Text>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    statsCard: { margin: Spacing.sm, borderRadius: Radius.xxl, padding: 24, backgroundColor: 'rgba(5, 5, 10, 0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', minHeight: 40 },
    statMini: { alignItems: 'center', gap: 8 },
    statMiniValue: { fontSize: 24, fontFamily: Typography.serifBold, color: 'white' },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        gap: 8,
    },
    timerBlock: {
        alignItems: 'center',
    },
    timerValue: {
        fontSize: 20,
        fontFamily: Typography.sansBold,
        color: 'white',
        fontWeight: 'bold',
    },
    timerLabel: {
        fontSize: 13,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 2,
    },
    timerSeparator: {
        fontSize: 20,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.55)',
        marginBottom: 12,
    }
});
