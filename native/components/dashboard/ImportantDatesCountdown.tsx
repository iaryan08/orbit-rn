import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Calendar, Heart, Sparkles, Trophy } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { getPartnerName } from '../../lib/utils';
import { useOrbitStore } from '../../lib/store';

const parseEventDate = (rawDate: any, rawTime?: any) => {
    if (!rawDate) return null;
    let d: Date;
    d = new Date(rawDate);
    if (isNaN(d.getTime())) return null;

    if (rawTime) {
        const [h, m] = String(rawTime).split(':').map(Number);
        if (!isNaN(h)) d.setHours(h, isNaN(m) ? 0 : m, 0, 0);
    }
    return d;
};

export const ImportantDatesCountdown = React.memo(({ profile, partnerProfile, couple, milestones, isActive = true }: any) => {
    const partnerName = getPartnerName(profile, partnerProfile);
    const { isLiteMode } = useOrbitStore();

    const upcomingEvents = useMemo(() => {
        const events: any[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (partnerProfile?.birthday) {
            const bday = new Date(partnerProfile.birthday);
            bday.setFullYear(today.getFullYear());
            if (bday < today) bday.setFullYear(today.getFullYear() + 1);
            if (bday >= today && bday <= thirtyDaysFromNow) {
                events.push({
                    type: 'birthday',
                    title: `${partnerName}'s Birthday`,
                    date: bday,
                });
            }
        }

        if (couple?.anniversary_date) {
            const anniv = new Date(couple.anniversary_date);
            if (!isNaN(anniv.getTime())) {
                anniv.setFullYear(today.getFullYear());
                if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);
                anniv.setHours(0, 0, 0, 0);
                if (anniv >= today && anniv <= thirtyDaysFromNow) {
                    events.push({
                        type: 'anniversary',
                        title: 'Our Anniversary',
                        date: anniv,
                        subtitle: 'Our Couple Date',
                    });
                }
            }
        }

        if (milestones) {
            Object.values(milestones).forEach((m: any) => {
                const category = String(m?.category || '');
                const isKissMilestone = category.includes('kiss');
                const dateCandidates = [m.date, m.milestone_date, m.event_date, m.target_date, m.date_user1, m.date_user2];
                const rawDate = dateCandidates.find((d) => !!d);
                if (!rawDate) return;

                const rawTime = m.time || m.milestone_time || m.time_user1 || m.time_user2;
                const mDate = parseEventDate(rawDate, rawTime);
                if (!mDate) return;

                mDate.setFullYear(today.getFullYear());
                if (mDate < today) mDate.setFullYear(today.getFullYear() + 1);
                if (mDate >= today && mDate <= thirtyDaysFromNow) {
                    events.push({
                        type: 'milestone',
                        title: (m.title || m.category || 'Milestone'),
                        date: mDate,
                    });
                }
            });
        }

        return events.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [partnerProfile?.birthday, couple?.anniversary_date, milestones, partnerName]);

    const [now, setNow] = useState(new Date());
    const cardGlow = useSharedValue(0.55);
    const sparkFloat = useSharedValue(0);

    useEffect(() => {
        if (!isActive) return;
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, [isActive]);

    useEffect(() => {
        cardGlow.value = 0.55;
        sparkFloat.value = 0;
    }, [isActive]);

    const cardGlowStyle = useAnimatedStyle(() => ({
        opacity: cardGlow.value,
        transform: [{ scale: 0.96 + cardGlow.value * 0.08 }],
    }));

    const sparkStyleA = useAnimatedStyle(() => ({
        opacity: 0.2 + sparkFloat.value * 0.45,
        transform: [{ translateY: -3 - sparkFloat.value * 10 }],
    }));

    const sparkStyleB = useAnimatedStyle(() => ({
        opacity: 0.12 + (1 - sparkFloat.value) * 0.35,
        transform: [{ translateY: -2 - (1 - sparkFloat.value) * 8 }],
    }));

    const showCountdownFx = Platform.OS !== 'android' && !isLiteMode;

    if (upcomingEvents.length === 0) return null;

    const event = upcomingEvents[0];
    const getDiff = (date: Date) => {
        const diffMs = date.getTime() - now.getTime();
        const normalizedDiff = Math.max(0, diffMs);
        return {
            days: Math.floor(normalizedDiff / (1000 * 60 * 60 * 24)),
            hours: Math.floor((normalizedDiff / (1000 * 60 * 60)) % 24),
            mins: Math.floor((normalizedDiff / (1000 * 60)) % 60),
        };
    };
    const primaryDiff = getDiff(event.date);
    const secondaryEvent = upcomingEvents.length > 1 ? upcomingEvents[1] : null;
    const secondaryDiff = secondaryEvent ? getDiff(secondaryEvent.date) : null;

    return (
        <Animated.View>
            <GlassCard style={styles.countdownCardRedesign} intensity={8}>
                {showCountdownFx && (
                    <View pointerEvents="none" style={styles.countdownFxLayer}>
                        <Animated.View style={[styles.countdownGlow, cardGlowStyle]} />
                        <Animated.View style={[styles.countdownSpark, styles.countdownSparkA, sparkStyleA]} />
                        <Animated.View style={[styles.countdownSpark, styles.countdownSparkB, sparkStyleB]} />
                    </View>
                )}
                <View style={styles.countdownHeaderRow}>
                    <View style={styles.countdownTitleGroup}>
                        <Calendar size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                        <Text style={styles.countdownHeaderText}>Upcoming Events</Text>
                    </View>
                </View>

                <View style={styles.eventMainRow}>
                    <View style={styles.eventIconCircle}>
                        <Heart size={20} color="white" strokeWidth={1.5} />
                    </View>
                    <View style={styles.eventTextGroup}>
                        <Text style={styles.eventTitleText}>{event.title}</Text>
                        <Text style={styles.eventSubText}>{event.subtitle || 'MEMORABLE DATE'}</Text>
                    </View>
                    <View style={styles.inDaysBadge}>
                        <Text style={styles.inDaysText}>{primaryDiff.days === 0 ? 'MEMORABLE' : `In ${primaryDiff.days} days`}</Text>
                    </View>
                </View>

                <View style={styles.timerGrid}>
                    <View style={styles.timerCell}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerValue}>{String(primaryDiff.days).padStart(2, '0')}</Text>
                            <Text style={styles.timerLabel}>DAYS</Text>
                        </View>
                    </View>
                    <View style={styles.timerCell}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerValue}>{String(primaryDiff.hours).padStart(2, '0')}</Text>
                            <Text style={styles.timerLabel}>HRS</Text>
                            <View style={styles.ringFloating}>
                                <Text style={{ fontSize: 14 }}>💍</Text>
                            </View>
                            <View style={styles.sparkleFloating}>
                                <Sparkles size={14} color={Colors.dark.amber[400]} fill={Colors.dark.amber[400]} />
                            </View>
                        </View>
                    </View>
                    <View style={styles.timerCell}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerValue}>{String(primaryDiff.mins).padStart(2, '0')}</Text>
                            <Text style={styles.timerLabel}>MIN</Text>
                        </View>
                    </View>
                </View>
                {secondaryEvent && secondaryDiff && (
                    <View style={styles.secondaryTimerWrap}>
                        <View style={styles.secondaryTimerHeader}>
                            <Text style={styles.secondaryTimerTitle} numberOfLines={1}>{secondaryEvent.title}</Text>
                            <Text style={styles.secondaryTimerChip}>
                                {secondaryDiff.days === 0 ? 'MEMORABLE' : `In ${secondaryDiff.days} days`}
                            </Text>
                        </View>
                        <Text style={styles.secondaryTimerValue}>
                            {String(secondaryDiff.days).padStart(2, '0')}D · {String(secondaryDiff.hours).padStart(2, '0')}H · {String(secondaryDiff.mins).padStart(2, '0')}M
                        </Text>
                    </View>
                )}
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    countdownCardRedesign: {
        margin: Spacing.sm,
        borderRadius: 32,
        padding: 24,
        backgroundColor: 'rgba(40,15,25,0.4)',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    countdownFxLayer: {
        ...StyleSheet.absoluteFillObject,
        pointerEvents: 'none',
    },
    countdownGlow: {
        position: 'absolute',
        width: '78%',
        height: 160,
        top: 12,
        right: -36,
        borderRadius: 120,
        backgroundColor: 'rgba(236,72,153,0.12)',
    },
    countdownSpark: {
        position: 'absolute',
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    countdownSparkA: {
        right: 56,
        top: 76,
    },
    countdownSparkB: {
        left: 118,
        top: 136,
    },
    countdownHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    countdownTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    countdownHeaderText: {
        fontSize: 22,
        fontFamily: Typography.serifBold,
        color: 'white',
        letterSpacing: -0.5,
    },
    eventMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: 16,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 24,
    },
    eventIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    eventTextGroup: {
        flex: 1,
        marginLeft: 14,
    },
    eventTitleText: {
        fontSize: 16,
        fontFamily: Typography.serifBold,
        color: 'white',
    },
    eventSubText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.55)',
        marginTop: 1,
        letterSpacing: 0.5,
    },
    inDaysBadge: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        position: 'relative',
    },
    inDaysText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    timerGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 16,
    },
    timerCell: {
        flex: 1,
    },
    timerCircle: {
        height: 96,
        backgroundColor: 'rgba(225,29,72,0.15)',
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: 'rgba(225,29,72,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    timerValue: {
        fontSize: 32,
        fontFamily: Typography.serifBold,
        color: 'white',
        includeFontPadding: false,
    },
    timerLabel: {
        fontSize: 12,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginTop: -4,
    },
    ringFloating: {
        position: 'absolute',
        top: -12,
        left: 20,
        transform: [{ rotate: '-15deg' }],
    },
    sparkleFloating: {
        position: 'absolute',
        bottom: 8,
        left: 8,
    },
    secondaryTimerWrap: {
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    secondaryTimerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    secondaryTimerTitle: {
        flex: 1,
        color: 'white',
        fontSize: 12,
        fontFamily: Typography.sansBold,
        letterSpacing: 0.2,
    },
    secondaryTimerChip: {
        color: Colors.dark.rose[400],
        fontSize: 13,
        fontFamily: Typography.sansBold,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    secondaryTimerValue: {
        marginTop: 6,
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontFamily: Typography.sans,
        letterSpacing: 0.6,
    },
});
