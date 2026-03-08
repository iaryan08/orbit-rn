import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import {
    Calendar as CalendarIcon,
    Heart,
    Star,
    Bell,
    ArrowRight,
    Gift,
    PenLine,
    Image as ImageIcon,
    Sparkles,
    Flame,
    Shield,
    Info,
    Zap,
    Activity
} from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LibidoMeter } from '../../components/LibidoMeter';
import { LibidoSlider } from '../../components/LibidoSlider';
import { db } from '../../lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { getTodayIST } from '../../lib/utils';
import * as Haptics from 'expo-haptics';


const { width } = Dimensions.get('window');

export function PartnerScreen() {
    const { profile, partnerProfile, couple, milestones, fetchData, cycleLogs } = useOrbitStore();
    const insets = useSafeAreaInsets();
    const [monthStart, setMonthStart] = useState(startOfMonth(new Date()));
    const days = eachDayOfInterval({
        start: startOfMonth(monthStart),
        end: endOfMonth(monthStart),
    });

    const isFemale = profile?.gender === 'female';
    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;
    const myLogsToday = myId ? cycleLogs[myId]?.[today] : null;
    const partnerLogsToday = partnerId ? cycleLogs[partnerId]?.[today] : null;

    // Use current day of cycle for advice
    const getCycleDay = () => {
        const cycleProfile = isFemale ? profile?.cycle_profile : partnerProfile?.cycle_profile;
        if (!cycleProfile?.last_period_start) return null;
        const lastPeriod = new Date(cycleProfile.last_period_start);
        const todayDate = new Date(today);
        const diffTime = todayDate.getTime() - lastPeriod.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const cycleLength = cycleProfile.avg_cycle_length || 28;
        return (diffDays % cycleLength) + 1;
    };

    const currentDay = getCycleDay();

    const getWisdom = (day: number | null) => {
        if (!day) return "Connect with your partner to sync your rhythms.";
        if (isFemale) {
            if (day <= 5) return "Your body is in renewal. Honor your need for rest and warmth.";
            if (day <= 13) return "Energy is rising. This is your bloom phase—embrace creativity.";
            if (day <= 15) return "You're at your peak radiance. Share your light with those you love.";
            return "Winding down. Practice gentle self-care as you prepare for a new cycle.";
        } else {
            if (day <= 5) return "She needs extra comfort. A hot water bottle or her favorite snack goes a long way.";
            if (day <= 13) return "She's in her high-energy phase. Plan something creative or active together.";
            if (day <= 15) return "She's at her most outgoing. Perfect for a social night out or a surprise date.";
            return "Extra patience is key today. Be her calm harbor if she feels stressed.";
        }
    };

    const handleLibidoChange = async (level: string) => {
        if (!myId || !couple?.id) return;
        const logId = `${myId}_${today}`;
        const logRef = doc(db, 'couples', couple.id, 'cycle_logs', logId);

        try {
            await setDoc(logRef, {
                user_id: myId,
                log_date: today,
                sex_drive: level,
                updated_at: new Date().toISOString()
            }, { merge: true });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error("Error updating libido:", e);
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.xl }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Relationship Calendar</Text>
                    <Text style={styles.subtitle}>OUR SPECIAL MOMENTS</Text>
                </View>

                {/* Libido Section */}
                <GlassCard style={styles.libidoCard} intensity={15}>
                    <View style={styles.libidoHeader}>
                        <View style={styles.libidoTitleRow}>
                            <Flame size={20} color={Colors.dark.rose[500]} />
                            <Text style={styles.libidoTitle}>Libidometer</Text>
                        </View>
                        {partnerLogsToday?.sex_drive === 'very_high' && (
                            <View style={styles.hotBadge}>
                                <Text style={styles.hotBadgeText}>PARTNER IS HOT</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.meterContainer}>
                        <LibidoMeter level={partnerLogsToday?.sex_drive || 'medium'} />
                        <Text style={styles.meterSub}>PARTNER'S DESIRE</Text>
                    </View>

                    <View style={styles.sliderWrapper}>
                        <LibidoSlider
                            defaultValue={myLogsToday?.sex_drive || 'medium'}
                            onValueChange={handleLibidoChange}
                        />
                    </View>
                </GlassCard>

                {/* Daily Wisdom */}
                <GlassCard style={styles.wisdomCard} intensity={10}>
                    <View style={styles.wisdomHeader}>
                        <Sparkles size={18} color={Colors.dark.indigo[400]} />
                        <Text style={styles.wisdomLabel}>DAILY WISDOM</Text>
                    </View>
                    <Text style={styles.wisdomText}>
                        "{getWisdom(currentDay)}"
                    </Text>
                    {currentDay && (
                        <View style={styles.cycleIndicator}>
                            <Text style={styles.cycleDayText}>DAY {currentDay}</Text>
                            <View style={styles.cycleDot} />
                            <Text style={styles.cyclePhaseText}>
                                {currentDay <= 5 ? 'MENSTRUAL' : currentDay <= 13 ? 'FOLLICULAR' : currentDay <= 15 ? 'OVULATORY' : 'LUTEAL'}
                            </Text>
                        </View>
                    )}
                </GlassCard>

                {/* Aura Tracking / Vitality */}
                <View style={styles.auraRow}>
                    <GlassCard style={styles.auraBox} intensity={8}>
                        <View style={styles.auraIconBox}>
                            <Zap size={18} color={Colors.dark.amber[400]} />
                        </View>
                        <Text style={styles.auraVal}>85%</Text>
                        <Text style={styles.auraLab}>VITALITY</Text>
                    </GlassCard>
                    <GlassCard style={styles.auraBox} intensity={8}>
                        <View style={styles.auraIconBox}>
                            <Activity size={18} color={Colors.dark.indigo[400]} />
                        </View>
                        <Text style={styles.auraVal}>CALM</Text>
                        <Text style={styles.auraLab}>STATE</Text>
                    </GlassCard>
                </View>

                {/* Calendar Widget */}
                <Animated.View entering={FadeInDown.delay(200)}>
                    <GlassCard style={styles.calendarCard} intensity={10}>
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity onPress={() => setMonthStart(subMonths(monthStart, 1))}>
                                <Text style={styles.navText}>PREV</Text>
                            </TouchableOpacity>
                            <Text style={styles.monthTitle}>{format(monthStart, 'MMMM yyyy').toUpperCase()}</Text>
                            <TouchableOpacity onPress={() => setMonthStart(addMonths(monthStart, 1))}>
                                <Text style={styles.navText}>NEXT</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.daysGrid}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                <Text key={`${d}-${i}`} style={styles.dayHeader}>{d}</Text>
                            ))}
                            {/* Fill empty slots for start of month alignment */}
                            {Array.from({ length: startOfMonth(monthStart).getDay() }).map((_, i) => (
                                <View key={`empty-${i}`} style={styles.dayCell} />
                            ))}
                            {days.map(day => {
                                const isToday = isSameDay(day, new Date());
                                // Check if any milestone matches this day
                                const hasEvent = Object.values(milestones).some((m: any) => {
                                    if (!m || !m.date) return false;
                                    const d = new Date(m.date);
                                    return !isNaN(d.getTime()) && isSameDay(d, day);
                                });

                                return (
                                    <View key={day.toISOString()} style={styles.dayCell}>
                                        <Text style={[
                                            styles.dayText,
                                            isToday && styles.todayText
                                        ]}>
                                            {format(day, 'd')}
                                        </Text>
                                        {hasEvent && <View style={styles.eventDot} />}
                                    </View>
                                );
                            })}
                        </View>
                    </GlassCard>
                </Animated.View>

                {/* Upcoming Events */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Upcoming Milestones</Text>
                </View>

                {Object.entries(milestones).slice(0, 3).map(([key, m]: any, idx) => {
                    if (!m || !m.date) return null;
                    const eventDate = new Date(m.date);
                    if (isNaN(eventDate.getTime())) return null;

                    return (
                        <Animated.View key={key} entering={FadeInDown.delay(300 + idx * 100)}>
                            <GlassCard style={styles.eventCard} intensity={8}>
                                <View style={styles.eventIconBox}>
                                    <Heart size={20} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400] + '20'} />
                                </View>
                                <View style={styles.eventInfo}>
                                    <Text style={styles.eventTitle}>{m.title}</Text>
                                    <Text style={styles.eventDate}>{format(eventDate, 'MMMM do, yyyy')}</Text>
                                </View>
                                <ArrowRight size={16} color="rgba(255,255,255,0.2)" />
                            </GlassCard>
                        </Animated.View>
                    );
                })}

                <View style={styles.suggestionSection}>
                    <GlassCard style={styles.giftCard} intensity={12}>
                        <Gift size={24} color={Colors.dark.amber[400]} />
                        <View style={styles.giftInfo}>
                            <Text style={styles.giftTitle}>Gift Ideas</Text>
                            <Text style={styles.giftSub}>Based on {partnerProfile?.display_name || 'Partner'}'s wishlist</Text>
                        </View>
                        <TouchableOpacity style={styles.viewAllBtn}>
                            <Text style={styles.viewAllText}>VIEW</Text>
                        </TouchableOpacity>
                    </GlassCard>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
        paddingHorizontal: Spacing.sm,
    },
    section: {
        marginTop: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: Spacing.xs,
    },
    title: {
        fontSize: 24,
        fontFamily: Typography.serif,
        color: Colors.dark.foreground,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: 'rgba(225, 29, 72, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.1)',
    },
    badgeText: {
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 1,
    },
    libidoCard: {
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        borderRadius: Radius.xl,
    },
    libidoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    libidoTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    libidoTitle: {
        fontSize: 18,
        fontFamily: Typography.serif,
        color: 'white',
    },
    hotBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        backgroundColor: Colors.dark.rose[500],
    },
    hotBadgeText: {
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'white',
    },
    meterContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    meterSub: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
        marginTop: -10,
    },
    sliderWrapper: {
        marginTop: 10,
    },
    wisdomCard: {
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
    },
    wisdomHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    wisdomLabel: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    wisdomText: {
        fontSize: 16,
        fontFamily: Typography.serifItalic,
        color: 'white',
        lineHeight: 24,
    },
    cycleIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    cycleDayText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: Colors.dark.indigo[400],
    },
    cycleDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    cyclePhaseText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
    },
    auraRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: Spacing.md,
    },
    auraBox: {
        flex: 1,
        padding: 16,
        borderRadius: Radius.lg,
        alignItems: 'center',
        gap: 4,
    },
    auraIconBox: {
        width: 32,
        height: 32,
        borderRadius: Radius.md,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    auraVal: {
        fontSize: 16,
        fontFamily: Typography.serif,
        color: 'white',
    },
    auraLab: {
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
    },
    calendarCard: {
        padding: Spacing.md,
        borderRadius: Radius.xl,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingHorizontal: 8,
    },
    calendarTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    calendarTitle: {
        fontSize: 14,
        color: '#fff',
        fontFamily: Typography.sansBold,
    },
    calendarNav: {
        flexDirection: 'row',
    },
    navText: {
        color: Colors.dark.indigo[400],
        fontSize: 11,
        fontFamily: Typography.sansBold,
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayHeader: {
        width: (width - (Spacing.sm * 2) - (Spacing.md * 2)) / 7,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        marginBottom: 10,
    },
    dayCell: {
        width: (width - (Spacing.sm * 2) - (Spacing.md * 2)) / 7,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: Typography.sans,
    },
    todayText: {
        color: Colors.dark.indigo[400],
        fontFamily: Typography.sansBold,
    },
    eventDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.dark.rose[500],
        position: 'absolute',
        bottom: 6,
    },
    sectionHeader: { marginBottom: 16, paddingHorizontal: Spacing.xs },
    sectionTitle: { fontSize: 18, fontFamily: Typography.serif, color: 'white' },
    subtitle: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginTop: 4 },
    monthTitle: { fontSize: 14, fontFamily: Typography.sansBold, color: 'white', letterSpacing: 1.5 },
    eventCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: Radius.lg, marginBottom: 12 },
    eventIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    eventInfo: { flex: 1 },
    eventTitle: { fontSize: 16, fontFamily: Typography.sansBold, color: 'white' },
    eventDate: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
    suggestionSection: { marginTop: 24 },
    giftCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: Radius.xl, backgroundColor: 'rgba(245, 158, 11, 0.05)' },
    giftInfo: { flex: 1, marginLeft: 16 },
    giftTitle: { fontSize: 16, fontFamily: Typography.sansBold, color: 'white' },
    giftSub: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
    viewAllBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    viewAllText: { fontSize: 10, fontFamily: Typography.sansBold, color: 'white' },
});
