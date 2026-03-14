import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Flame, Sparkles } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Colors, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { getTodayIST, getPartnerName } from '../../lib/utils';

export const IntimacyAlert = React.memo(({ profile, partnerProfile, cycleLogs, isActive = true }: any) => {
    const today = getTodayIST();
    const partnerId = partnerProfile?.id;
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;

    if (!partnerLogsToday?.sex_drive) return null;

    const libido = partnerLogsToday.sex_drive.toLowerCase();
    const isVeryHigh = libido === 'very_high';
    const isHigh = libido === 'high';

    if (!isVeryHigh && !isHigh) return null;

    const partnerName = getPartnerName(profile, partnerProfile);
    const pulse = useSharedValue(0);
    const shimmer = useSharedValue(0);

    const alertConfig = isVeryHigh
        ? {
            title: 'Intense Passion',
            description: `${partnerName} is feeling a strong pull toward you right now.`,
            accent: Colors.dark.rose[400],
            chipLabel: 'VERY HIGH DESIRE',
            gradientBg: 'rgba(56,18,26,0.72)',
            border: 'rgba(251,113,133,0.34)',
        }
        : {
            title: 'Warm Craving',
            description: `${partnerName} is feeling deeply connected and wanting you close.`,
            accent: Colors.dark.amber[400],
            chipLabel: 'HIGH DESIRE',
            gradientBg: 'rgba(47,28,13,0.68)',
            border: 'rgba(245,158,11,0.3)',
        };

    useEffect(() => {
        pulse.value = 0;
        shimmer.value = 0;
    }, [isActive]);

    const isLiteMode = useOrbitStore(s => s.isLiteMode);
    const isAndroidPerformanceMode = Platform.OS === 'android' || isLiteMode;

    const iconPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + pulse.value * (isAndroidPerformanceMode ? 0.02 : 0.08) }],
        opacity: isAndroidPerformanceMode ? 1 : 0.6 + pulse.value * 0.4
    }));

    const auraStyle = useAnimatedStyle(() => ({
        opacity: isAndroidPerformanceMode ? 0 : 0.14 + shimmer.value * 0.22,
        transform: [{ scale: isAndroidPerformanceMode ? 1 : 0.92 + shimmer.value * 0.12 }],
    }));

    return (
        <TouchableOpacity activeOpacity={0.9} style={styles.passionWrapper}>
            <GlassCard style={[styles.passionCard, { backgroundColor: alertConfig.gradientBg, borderColor: alertConfig.border }]} intensity={24}>
                {!isAndroidPerformanceMode && (
                    <View pointerEvents="none" style={styles.passionFxLayer}>
                        <Animated.View style={[styles.passionAura, { backgroundColor: alertConfig.accent }, auraStyle]} />
                    </View>
                )}
                <View style={styles.passionRow}>
                    <Animated.View style={[styles.passionIconBox, iconPulseStyle, { backgroundColor: `${alertConfig.accent}24`, borderColor: `${alertConfig.accent}66` }]}>
                        <Flame size={22} color={alertConfig.accent} fill={alertConfig.accent} strokeWidth={1.5} />
                    </Animated.View>
                    <View style={styles.passionTextContent}>
                        <View style={styles.passionTitleRow}>
                            <Text style={styles.passionTitle}>{alertConfig.title}</Text>
                            <Sparkles size={14} color={`${alertConfig.accent}CC`} />
                        </View>
                        <Text style={styles.passionSub}>{alertConfig.description}</Text>
                    </View>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    passionWrapper: {
        margin: Spacing.sm,
    },
    passionCard: {
        padding: 14,
        borderRadius: 30,
        borderWidth: 1,
        overflow: 'hidden',
    },
    passionFxLayer: {
        ...StyleSheet.absoluteFillObject,
        pointerEvents: 'none',
    },
    passionAura: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 999,
        right: -80,
        top: -90,
    },
    passionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 84,
    },
    passionIconBox: {
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        shadowColor: Colors.dark.rose[400],
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 0 },
    },
    passionTextContent: {
        flex: 1,
        marginLeft: 12,
        paddingRight: 8,
    },
    passionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    passionTitle: {
        color: 'white',
        fontSize: 24,
        lineHeight: 30,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.6,
    },
    passionSub: {
        color: 'rgba(255,255,255,0.76)',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: Typography.serifItalic,
        marginTop: 4,
    },
});
