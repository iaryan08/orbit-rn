import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Pressable, Dimensions, Platform, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Image } from 'expo-image';
import { Navigation, Heart, Music, AlertCircle, Calendar, RefreshCcw, Wifi, Globe, MapPin, Zap, PenLine, Image as ImageIcon, Flame, Quote, Moon, Target, Sparkles, Edit2, Lock, Unlock, Camera, ChevronRight, Plus, CalendarHeart, Cake, Minus, Thermometer, Droplets, Wind, Sun, Leaf, Mail, Check, Trophy, Cloud, CloudRain, CloudSnow, CloudDrizzle, CloudLightning, Clock } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { GlassCard } from './GlassCard';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, LinearTransition } from 'react-native-reanimated';
import { Shimmer } from './Shimmer';
import { useOrbitStore } from '../lib/store';
import { PremiumTabLoader } from './PremiumTabLoader';
import { updateLocation } from '../lib/location';
import * as Haptics from 'expo-haptics';
import { getTodayIST, parseSafeDate, getPartnerName } from '../lib/utils';
import { getPublicStorageUrl } from '../lib/storage';
import { submitMood, addBucketItem, toggleBucketItem } from '../lib/auth';
import { ProfileAvatar } from './ProfileAvatar';
import { Emoji } from './Emoji';
import Svg, { Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedHeart = Animated.createAnimatedComponent(Heart);

const MOOD_EMOJIS: Record<string, string> = {
    happy: '😊',
    loved: '🥰',
    excited: '🤩',
    calm: '😌',
    sad: '😢',
    tired: '😴',
    grateful: '🙏',
    flirty: '😉',
    'missing you badly': '🥹',
    cuddly: '🫂',
    romantic: '🌹',
    passionate: '❤️‍🔥',
    'craving you': '🔥',
    playful: '😈'
};

const parseMoodPresentation = (moodValue?: string | null) => {
    if (!moodValue) return { emoji: '✨', label: '' };
    if (moodValue.startsWith('CUSTOM:')) {
        const [, emoji, label] = moodValue.split(':');
        return { emoji: emoji || '✨', label: label || 'Custom' };
    }
    return {
        emoji: MOOD_EMOJIS[moodValue] || moodValue,
        label: moodValue,
    };
};

const getMoodTimestamp = (mood: any) => {
    const updated = mood?.updated_at;
    if (typeof updated === 'number') return updated;
    if (updated?.toMillis && typeof updated.toMillis === 'function') return updated.toMillis();
    const created = mood?.created_at;
    if (typeof created === 'number') return created;
    if (created?.toMillis && typeof created.toMillis === 'function') return created.toMillis();
    const parsedUpdated = Date.parse(updated);
    if (Number.isFinite(parsedUpdated)) return parsedUpdated;
    const parsedCreated = Date.parse(created);
    return Number.isFinite(parsedCreated) ? parsedCreated : 0;
};

interface RelationshipStatsProps {
    couple: any;
    lettersCount: number;
    memoriesCount: number;
}

export const RelationshipStats = React.memo(({ couple, lettersCount, memoriesCount, isActive = true }: RelationshipStatsProps & { isActive?: boolean }) => {
    const daysTogether = useMemo(() => {
        const startDate = couple?.anniversary_date || couple?.paired_at || couple?.created_at;
        if (!startDate) return 0;
        const start = parseSafeDate(startDate);
        if (!start || isNaN(start.getTime())) return 0;
        const diff = new Date().getTime() - start.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        return isNaN(days) ? 0 : Math.max(0, days);
    }, [couple?.anniversary_date, couple?.paired_at, couple?.created_at]);

    const scale = useSharedValue(1);

    React.useEffect(() => {
        scale.value = 1;
    }, [isActive]);

    const { isLiteMode } = useOrbitStore();
    const animatedHeartStyle = useAnimatedStyle(() => {
        // Budget devices (Redmi 10) skip expensive shadow & rotation loops
        if (isLiteMode) return { transform: [{ scale: (scale.value + 1) / 2 }] };

        const glowIntensity = (scale.value - 1) * 2;
        return {
            transform: [
                { scale: scale.value },
                { rotate: `${(scale.value - 1) * 5}deg` }
            ],
            // Only apply high-end shadows on non-lite devices (Android overhead)
            ...(Platform.OS === 'ios' && {
                shadowOpacity: 0.3 + glowIntensity,
                shadowRadius: 10 + glowIntensity * 15,
                shadowColor: Colors.dark.rose[500],
            })
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

export const ConnectionBoard = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    const { setMoodDrawerOpen, moods, loading, sendHeartbeatOptimistic, idToken, setMoodHistoryOpen } = useOrbitStore();
    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;

    const myLatestMood = useMemo(
        () =>
            moods
                .filter(m => m.user_id === myId && m.mood_date === today)
                .sort((a, b) => getMoodTimestamp(b) - getMoodTimestamp(a))[0],
        [moods, myId, today]
    );
    const partnerLatestMood = useMemo(
        () =>
            moods
                .filter(m => m.user_id === partnerId && m.mood_date === today)
                .sort((a, b) => getMoodTimestamp(b) - getMoodTimestamp(a))[0],
        [moods, partnerId, today]
    );

    const myMoodDisplay = parseMoodPresentation(myLatestMood?.emoji);
    const partnerMoodDisplay = parseMoodPresentation(partnerLatestMood?.emoji);

    // Partner's menstrual state detection
    const partnerIsFemale = partnerProfile?.gender === 'female';
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;
    const partnerIsOnPeriod = partnerIsFemale && (partnerLogsToday?.is_period === true || partnerLogsToday?.flow);

    // Prioritize manual mood, but if on period, we can show a special indicator or use it as fallback
    const myMoodEmoji = myLatestMood ? [myMoodDisplay.emoji] : (cycleLogs[myId]?.[today]?.symptoms || []);

    // Partner: manual mood > biological highlight (if on period) > symptoms
    const partnerMoodEmoji = partnerLatestMood
        ? [partnerMoodDisplay.emoji]
        : (partnerIsOnPeriod ? ['🩸'] : (cycleLogs[partnerId]?.[today]?.symptoms || []));

    const myNote = myLatestMood?.mood_text || cycleLogs[myId]?.[today]?.note || '';
    const partnerNote = partnerLatestMood?.mood_text
        ? partnerLatestMood.mood_text
        : (partnerIsOnPeriod ? "Currently on her period. She might need some extra care. ❤️" : (cycleLogs[partnerId]?.[today]?.note || ''));

    const myAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const myName = profile?.display_name?.split(' ')[0] || 'You';
    const partnerName = getPartnerName(profile, partnerProfile);
    const heartbeatPulse = useSharedValue(0);

    const handleHeartbeatHold = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        heartbeatPulse.value = 0;
        heartbeatPulse.value = withSequence(
            withTiming(1, { duration: 120 }),
            withTiming(0, { duration: 180 })
        );
        sendHeartbeatOptimistic();
    };

    const heartbeatPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + heartbeatPulse.value * 0.025 }],
    }));

    if (loading && moods.length === 0) {
        return (
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeaderRedesign}>
                    <Shimmer width={120} height={24} />
                    <Shimmer width={60} height={24} borderRadius={12} />
                </View>
                <Shimmer width="100%" height={200} borderRadius={16} />
            </GlassCard>
        );
    }

    return (
        <Animated.View>
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeaderRedesign}>
                    <View style={styles.connTitleGroup}>
                        <Sparkles size={18} color={Colors.dark.indigo[400]} />
                        <Text style={styles.connTitle}>Vibe Sync</Text>
                    </View>
                    <View style={styles.connActions}>
                        <TouchableOpacity
                            style={styles.connHistoryBtn}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                if (setMoodHistoryOpen) setMoodHistoryOpen(true);
                            }}
                        >
                            <Clock size={16} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Partner Mood Block - Highlighted */}
                <Animated.View style={[styles.connBlockPartnerRedesign, heartbeatPulseStyle]}>
                    <TouchableOpacity style={styles.connUserRowRedesign} onLongPress={handleHeartbeatHold} delayLongPress={220}>
                        <ProfileAvatar
                            url={partnerAvatarUrl}
                            fallbackText={partnerName}
                            size={38}
                            borderWidth={0}
                        />
                        <View style={{ marginLeft: 14, flex: 1 }}>
                            <Text style={styles.connUserLabelRedesign} numberOfLines={1}>{partnerName}</Text>
                            {partnerMoodEmoji.length > 0 ? (
                                <View style={styles.connMoodInline}>
                                    <Emoji symbol={partnerMoodEmoji[partnerMoodEmoji.length - 1] || '✨'} size={14} />
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={styles.connMoodLabelInline} numberOfLines={1}>
                                            {partnerMoodDisplay.label || (partnerIsOnPeriod && !partnerLatestMood ? 'Period' : partnerMoodEmoji[partnerMoodEmoji.length - 1])}
                                        </Text>
                                        {partnerIsOnPeriod && (
                                            <View style={styles.biologicalBadge}>
                                                <Sparkles size={8} color="#fb7185" style={{ marginRight: 2 }} />
                                                <Text style={styles.biologicalBadgeText}>Lunara Highlight</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <Text style={styles.connEmptyTextRedesign}>Waiting for vibe...</Text>
                            )}
                        </View>
                    </TouchableOpacity>

                    {partnerNote ? (
                        <View style={styles.connNoteBoxRedesign}>
                            <Quote size={16} color="rgba(129, 140, 248, 0.4)" style={{ marginRight: 8, marginTop: 2 }} />
                            <Text style={styles.connNoteTextRedesign}>"{partnerNote}"</Text>
                        </View>
                    ) : (
                        partnerMoodEmoji.length === 0 && (
                            <View style={styles.connNoteBoxEmpty}>
                                <Text style={styles.connNoteEmptyText}>No updates yet today.</Text>
                            </View>
                        )
                    )}
                </Animated.View>

                {/* Vertical Separator */}
                <View style={styles.connDividerShape}>
                    <View style={styles.connDividerLine} />
                    <Heart size={14} color="rgba(255,255,255,0.15)" fill="rgba(255,255,255,0.05)" style={{ paddingHorizontal: 8, backgroundColor: 'rgba(5, 5, 10, 0.8)' }} />
                    <View style={styles.connDividerLine} />
                </View>

                {/* User Mood Block */}
                <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMoodDrawerOpen(true);
                    }}
                >
                    <Animated.View style={[styles.connBlockSelfRedesign, heartbeatPulseStyle]}>
                        <View style={styles.connUserRowRedesign}>
                            <ProfileAvatar
                                url={myAvatarUrl}
                                fallbackText={myName}
                                size={38}
                                borderWidth={0}
                            />
                            <View style={{ marginLeft: 14, flex: 1 }}>
                                <View style={styles.connUserLabelRow}>
                                    <Text style={styles.connUserLabelRedesign} numberOfLines={1}>You</Text>
                                    <Edit2 size={10} color="rgba(255,255,255,0.3)" style={{ marginLeft: 4 }} />
                                </View>
                                {myMoodEmoji.length > 0 ? (
                                    <View style={styles.connMoodInline}>
                                        <Emoji symbol={myMoodEmoji[myMoodEmoji.length - 1] || '✨'} size={14} />
                                        <Text style={styles.connMoodLabelInlineSelf} numberOfLines={1}>{myMoodDisplay.label || myMoodEmoji[myMoodEmoji.length - 1]}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.connEmptyTextRedesign}>How are you?</Text>
                                )}
                            </View>
                        </View>

                        {myNote ? (
                            <View style={styles.connNoteBoxSelfRedesign}>
                                <Quote size={16} color="rgba(251, 113, 133, 0.4)" style={{ marginRight: 8, marginTop: 2 }} />
                                <Text style={styles.connNoteTextRedesign}>"{myNote}"</Text>
                            </View>
                        ) : (
                            myMoodEmoji.length === 0 && (
                                <View style={styles.connNoteBoxEmpty}>
                                    <View style={styles.connUpdateHint}>
                                        <Sparkles size={12} color={Colors.dark.rose[400]} style={{ marginRight: 6 }} />
                                        <Text style={styles.connNoteEmptyText}>Tap to share your mood</Text>
                                    </View>
                                </View>
                            )
                        )}
                    </Animated.View>
                </TouchableOpacity>
            </GlassCard>
        </Animated.View>
    );
});

export const MusicHeartbeat = React.memo(() => {
    const isPlaying = useOrbitStore(state => state.musicState?.is_playing);
    const track = useOrbitStore(state => state.musicState?.current_track);
    if (!isPlaying || !track) return null;

    return (
        <Animated.View>
            <GlassCard style={styles.musicCard} intensity={20}>
                <View style={styles.musicInfo}>
                    <View style={styles.musicIconWrapper}>
                        <Animated.View style={styles.musicIconBox}>
                            <Sparkles size={16} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
                        </Animated.View>
                    </View>
                    <View style={styles.musicTextGroup}>
                        <Text style={styles.musicStatus}>Synced Audio</Text>
                        <Text style={styles.musicTitle} numberOfLines={1}>{track.title || 'Unknown Track'}</Text>
                        <Text style={styles.musicArtist} numberOfLines={1}>{track.artist || 'Unknown Artist'}</Text>
                    </View>
                </View>
                <ChevronRight size={14} color="rgba(255,255,255,0.2)" />
            </GlassCard>
        </Animated.View>
    );
});

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

    const { isLiteMode } = useOrbitStore();
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

export const ImportantDatesCountdown = React.memo(({ milestones, partnerProfile, couple, isActive = true }: any) => {
    const partnerName = getPartnerName(null, partnerProfile);
    const parseEventDate = useCallback((rawDate: any, rawTime?: any): Date | null => {
        let date = parseSafeDate(rawDate);
        if (!date && typeof rawDate === 'string') {
            const m = rawDate.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (m) {
                const day = Number(m[1]);
                const month = Number(m[2]);
                const year = Number(m[3]);
                if (day > 0 && month > 0 && month <= 12) {
                    date = new Date(year, month - 1, day);
                }
            }
        }
        if (!date) return null;

        if (typeof rawTime === 'string' && rawTime.trim()) {
            const mt = rawTime.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
            if (mt) {
                let h = Number(mt[1]);
                const min = Number(mt[2]);
                const ampm = mt[3].toUpperCase();
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                date.setHours(h, min, 0, 0);
            } else {
                date.setHours(0, 0, 0, 0);
            }
        } else {
            date.setHours(0, 0, 0, 0);
        }

        return date;
    }, []);

    const upcomingEvents = useMemo(() => {
        const events: any[] = [];
        const today = new Date();
        const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        // 1. Partner Birthday
        if (partnerProfile?.birthday) {
            const bday = parseSafeDate(partnerProfile.birthday);
            if (bday) {
                bday.setFullYear(today.getFullYear());
                if (bday < today) bday.setFullYear(today.getFullYear() + 1);
                if (bday >= today && bday <= thirtyDaysFromNow) {
                    events.push({
                        type: 'birthday',
                        title: `${partnerName}'s Birthday`,
                        date: bday,
                        icon: <Cake size={20} color={Colors.dark.amber[400]} />
                    });
                }
            }
        }

        // 2. Anniversary
        if (couple?.anniversary_date) {
            const anniv = parseSafeDate(couple.anniversary_date);
            if (anniv) {
                anniv.setFullYear(today.getFullYear());
                if (anniv < today) anniv.setFullYear(today.getFullYear() + 1);

                // Add exact time to anniversary for countdown calculations
                anniv.setHours(0, 0, 0, 0);

                if (anniv >= today && anniv <= thirtyDaysFromNow) {
                    events.push({
                        type: 'anniversary',
                        title: 'Our Anniversary',
                        date: anniv,
                        subtitle: 'Our Couple Date',
                        icon: <Heart size={20} color={Colors.dark.rose[400]} />
                    });
                }
            }
        }

        // 3. Milestones (Upcoming ones)
        if (milestones) {
            Object.values(milestones).forEach((m: any) => {
                const category = String(m?.category || '');
                const isKissMilestone = category.includes('kiss');
                const dualDate1 = m?.date_user1;
                const dualDate2 = m?.date_user2;
                const dualTime1 = m?.time_user1 || m?.milestone_time;
                const dualTime2 = m?.time_user2 || m?.milestone_time;

                if (dualDate1 || dualDate2) {
                    const d1 = dualDate1 ? parseEventDate(dualDate1, dualTime1) : null;
                    const d2 = dualDate2 ? parseEventDate(dualDate2, dualTime2) : null;
                    const groupId = `dual_${m?.id || category || m?.title || 'milestone'}`;
                    const sameMoment = (a: Date, b: Date) =>
                        a.getMonth() === b.getMonth() &&
                        a.getDate() === b.getDate() &&
                        a.getHours() === b.getHours() &&
                        a.getMinutes() === b.getMinutes();

                    if (d1) {
                        d1.setFullYear(today.getFullYear());
                        if (d1 < today) d1.setFullYear(today.getFullYear() + 1);
                    }
                    if (d2) {
                        d2.setFullYear(today.getFullYear());
                        if (d2 < today) d2.setFullYear(today.getFullYear() + 1);
                    }

                    if (d1 && d2 && sameMoment(d1, d2)) {
                        if (d1 >= today && d1 <= thirtyDaysFromNow) {
                            events.push({
                                type: 'milestone',
                                dualGroupId: groupId,
                                title: isKissMilestone ? 'We kissed each other' : (m.title || m.category || 'Shared Milestone'),
                                subtitle: 'Shared memory',
                                date: d1,
                                icon: <Trophy size={20} color={Colors.dark.indigo[400]} />
                            });
                        }
                        return;
                    }

                    if (d1 && d1 >= today && d1 <= thirtyDaysFromNow) {
                        events.push({
                            type: 'milestone',
                            dualGroupId: groupId,
                            title: isKissMilestone ? `You kissed ${partnerName}` : `Your ${m.title || m.category || 'milestone'}`,
                            subtitle: 'Your memory date',
                            date: d1,
                            icon: <Trophy size={20} color={Colors.dark.indigo[400]} />
                        });
                    }
                    if (d2 && d2 >= today && d2 <= thirtyDaysFromNow) {
                        events.push({
                            type: 'milestone',
                            dualGroupId: groupId,
                            title: isKissMilestone ? `${partnerName} kissed you` : `${partnerName}'s ${m.title || m.category || 'milestone'}`,
                            subtitle: `${partnerName}'s memory date`,
                            date: d2,
                            icon: <Trophy size={20} color={Colors.dark.indigo[400]} />
                        });
                    }
                    return;
                }

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
                        icon: <Trophy size={20} color={Colors.dark.indigo[400]} />
                    });
                }
            });
        }

        return events.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [milestones, partnerProfile?.birthday, couple?.anniversary_date, partnerName, parseEventDate]);

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
    }, [isActive, cardGlow, sparkFloat]);

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

    const { isLiteMode } = useOrbitStore();
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
                                <Text style={{ fontSize: 14 }}>💍</Text>
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

const WeatherIcon = ({ code, size = 14, color }: { code?: number; size?: number; color: string }) => {
    // Open-Meteo WMO Codes
    if (code === undefined) return <MapPin size={size} color={color} />;

    if (code === 0 || code === 1) return <Sun size={size} color={color} />;
    if (code === 2 || code === 3) return <Cloud size={size} color={color} />;
    if (code >= 45 && code <= 48) return <Cloud size={size} color={color} />; // Fog
    if (code >= 51 && code <= 65) return <CloudRain size={size} color={color} />;
    if (code >= 71 && code <= 77) return <CloudSnow size={size} color={color} />;
    if (code >= 80 && code <= 82) return <CloudDrizzle size={size} color={color} />;
    if (code >= 95) return <CloudLightning size={size} color={color} />;

    return <Sun size={size} color={color} />;
};

// Haversine formula for distance calculation in KM
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const MarqueeText = ({ children, style, isActive = true }: { children: string, style?: any, isActive?: boolean }) => {
    const { isLiteMode } = useOrbitStore();
    const translateX = useSharedValue(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);

    const shouldAnimateMarquee = Platform.OS !== 'android' && !isLiteMode && isActive;

    useEffect(() => {
        if (!shouldAnimateMarquee) {
            translateX.value = 0;
            return;
        }
        // Add a 2px buffer to prevent flickering due to sub-pixel measurement rounding
        if (containerWidth > 0 && textWidth > (containerWidth + 2)) {
            const distance = textWidth + 120;
            translateX.value = 0;
            translateX.value = withRepeat(
                withTiming(-distance, {
                    duration: (textWidth / 22) * 1000,
                    easing: Easing.linear
                }),
                -1,
                false
            );
        } else {
            translateX.value = 0;
        }
    }, [textWidth, containerWidth, shouldAnimateMarquee, translateX]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }]
    }));

    const isRightAligned = style?.textAlign === 'right';

    return (
        <View
            style={[{ overflow: 'hidden', width: '100%' }, style]}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {/* Measurement: Hidden, non-wrapping text to find true width */}
            <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                <View style={{ flexDirection: 'row', width: 5000 }}>
                    <Text
                        style={[style, { width: undefined, flex: 0 }]}
                        onLayout={(e) => {
                            const w = e.nativeEvent.layout.width;
                            if (w > 0) setTextWidth(w);
                        }}
                    >
                        {children}
                    </Text>
                </View>
            </View>

            <View style={{
                flexDirection: 'row',
                width: shouldAnimateMarquee && textWidth > containerWidth ? 5000 : '100%',
                justifyContent: (isRightAligned && textWidth <= containerWidth) ? 'flex-end' : 'flex-start'
            }}>
                <Animated.Text
                    style={[style, animatedStyle, { paddingRight: shouldAnimateMarquee && textWidth > (containerWidth + 2) ? 120 : 0 }]}
                    numberOfLines={1}
                >
                    {children}
                </Animated.Text>
                {shouldAnimateMarquee && textWidth > (containerWidth + 2) && (
                    <Animated.Text
                        style={[style, animatedStyle, { paddingRight: 120 }]}
                        numberOfLines={1}
                    >
                        {children}
                    </Animated.Text>
                )}
            </View>
        </View>
    );
};

export const LocationWidget = React.memo(({ profile, partnerProfile, couple, isActive = true }: any) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        if (!isActive) return;
        // Update time once a minute
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);

        // 🚀 Optimization: Dashboard should NOT poll GPS constantly.
        // It's already fetched once in the main App/Dashboard boot (hasBootLoaded).
        // Only force an update here if it's the first time this widget is actually visible.
        return () => clearInterval(timer);
    }, [isActive]);

    const formatTime = (date: Date) => {
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        return timeStr.toUpperCase().replace(' ', '');
    };

    const myLoc = profile?.location;
    const partnerLoc = partnerProfile?.location;
    const partnerTimeStr = partnerLoc?.city ? formatTime(currentTime) : "--:--";

    const distanceKm = useMemo(() => {
        if (myLoc?.latitude && partnerLoc?.latitude) {
            return calculateDistance(myLoc.latitude, myLoc.longitude, partnerLoc.latitude, partnerLoc.longitude);
        }
        return null;
    }, [myLoc, partnerLoc]);

    const formatLastUpdated = (timestamp: any) => {
        if (!timestamp) return 'Live tracking';
        const date = new Date(timestamp);
        const diff = Date.now() - date.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return `${Math.floor(diff / 3600000)}h ago`;
    };

    return (
        <Animated.View>
            <GlassCard style={styles.locationCardRedesign} intensity={10}>
                {/* Modern subtle overlay for high-end feel */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.01)' }]} />

                {/* Unified Header */}
                <View style={styles.locHeader}>
                    <MapPin size={18} color={Colors.dark.rose[400]} />
                    <Text style={styles.locHeaderText}>Proximity Sync</Text>
                </View>

                <View style={[styles.locMainGrid, { alignItems: 'center' }]}>
                    {/* Source: My Node */}
                    <View style={styles.locSection}>
                        <Text style={styles.locLabelText} numberOfLines={1}>
                            {myLoc?.city || 'Searching...'}
                        </Text>
                        <MarqueeText style={styles.locFullAddress} isActive={isActive}>
                            {myLoc?.subtext || myLoc?.location_name || "-"}
                        </MarqueeText>
                        <Text style={styles.locTimeDisplay}>{formatTime(currentTime)}</Text>
                        <View style={styles.locBadgeContainer}>
                            <View style={[styles.locStatusDot, { backgroundColor: Colors.dark.emerald[400] }]} />
                            <Text style={styles.locStatusText}>
                                {profile?.last_active ? `Updated ${formatLastUpdated(profile.last_active)}` : 'Live Tracking'}
                            </Text>
                        </View>
                    </View>

                    {/* The Connection Bridge (Distance Engine) */}
                    <View style={styles.locBridgeArea}>
                        <View style={styles.locBridgeLine} />
                        <View style={styles.locBridgeCircle}>
                            <Heart size={10} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
                        </View>
                        {distanceKm !== null && (
                            <View style={styles.locDistanceBadge}>
                                <Text style={styles.locDistanceText}>{Math.round(distanceKm)} KM</Text>
                            </View>
                        )}
                    </View>

                    {/* Target: Partner Node */}
                    <View style={[styles.locSection, { alignItems: 'flex-end' }]}>
                        <Text style={[styles.locLabelText, { textAlign: 'right' }]} numberOfLines={1}>
                            {partnerLoc?.city || 'No Signal'}
                        </Text>
                        <MarqueeText style={[styles.locFullAddress, { textAlign: 'right' }]} isActive={isActive}>
                            {partnerLoc?.subtext || partnerLoc?.location_name || "-"}
                        </MarqueeText>
                        <Text style={styles.locTimeDisplay}>{partnerTimeStr}</Text>
                        <View style={styles.locBadgeContainer}>
                            <Text style={[styles.locStatusText, { opacity: 0.4 }]}>
                                {partnerProfile?.last_active ? `Updated ${formatLastUpdated(partnerProfile.last_active)}` : 'Synced'}
                            </Text>
                        </View>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

export const DailyInspirationWidget = React.memo(({ variant = 'card' }: { variant?: 'card' | 'banner' }) => {
    const { dailyInspiration, loadDailyInspiration, isLoadingInspiration } = useOrbitStore();
    const [activeTab, setActiveTab] = React.useState<'quote' | 'challenge' | 'tip'>('quote');

    useEffect(() => {
        loadDailyInspiration();
    }, []);

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
                        <Sparkles size={16} color={Colors.dark.indigo[400]} />
                        <Text style={styles.morningInsightLabel}>MORNING INSIGHT</Text>
                    </View>
                    <Text style={[
                        styles.inspirationCardText,
                        activeTab === 'quote' && styles.quoteItalicStyle,
                        { fontSize: 15, color: 'rgba(255,255,255,0.9)' }
                    ]}>
                        {activeTab === 'quote' && <Text style={styles.quoteMark}>"</Text>}
                        {content.text}
                        {activeTab === 'quote' && <Text style={styles.quoteMark}>"</Text>}
                    </Text>
                </View>
            </Animated.View>
        );
    }

    return (
        <Animated.View>
            <GlassCard style={styles.inspirationCard} intensity={10}>
                <View style={styles.inspirationHeader}>
                    <Sparkles size={18} color={Colors.dark.indigo[400]} />
                    <Text style={styles.inspirationTitle}>Daily Inspiration</Text>
                </View>

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
                                        isSelected && styles.tabToggleTextActive
                                    ]}>
                                        {tab.toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.inspirationContent}>
                    <Text style={[
                        styles.inspirationCardText,
                        activeTab === 'quote' && styles.quoteItalicStyle
                    ]}>
                        {activeTab === 'quote' && <Text style={styles.quoteMark}>"</Text>}
                        {content.text}
                        {activeTab === 'quote' && <Text style={styles.quoteMark}>"</Text>}
                    </Text>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

export const MenstrualPhaseWidget = React.memo(() => {
    const { profile, partnerProfile } = useOrbitStore();
    const isFemale = profile?.gender === 'female';
    const cycleProfile = isFemale ? profile?.cycle_profile : partnerProfile?.cycle_profile;

    let computedPhase = 'follicular';

    if (cycleProfile?.last_period_start) {
        const { getCycleDay, getPhaseForDay } = require('../lib/cycle');
        const currentDay = getCycleDay(cycleProfile.last_period_start, cycleProfile.avg_cycle_length || 28);
        const phaseObj = getPhaseForDay(currentDay, cycleProfile.avg_cycle_length || 28, cycleProfile.avg_period_length || 5);
        computedPhase = phaseObj.name.toLowerCase();
    } else {
        const phaseContext = isFemale ? profile?.menstrual_cycle : partnerProfile?.menstrual_cycle;
        computedPhase = (phaseContext?.current_phase || 'follicular').toLowerCase();
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
                const accessKeyRaw = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;
                const accessKey = accessKeyRaw?.trim();

                if (!accessKey) {
                    console.warn("[Unsplash] Access key missing. Please check .env and restart Metro.");
                    return;
                }

                const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Client-ID ${accessKey}` }
                });
                if (!res.ok) {
                    const errorBody = await res.text();
                    throw new Error(`Unsplash API error (${res.status}): ${errorBody}`);
                }
                const data = await res.json();

                if (data && data.urls && isMounted) {
                    const photoData = {
                        url: data.urls.regular,
                        name: data.user.name,
                        link: data.user.links.html
                    };
                    setPhoto(photoData);
                    try {
                        await AsyncStorage.setItem(cacheKey, JSON.stringify(photoData));
                    } catch (storageError) {
                        console.warn("[Unsplash] Failed to cache photo:", storageError);
                    }

                    // Trigger download per Unsplash Guidelines
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
                {/* Dynamic Image Background via Unsplash API */}
                {photo?.url && (
                    <Image
                        source={{ uri: photo.url }}
                        style={StyleSheet.absoluteFillObject}
                        contentFit="cover"
                        transition={500}
                    />
                )}

                {/* Enhanced Gradient Overlay for Text Readability */}
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
                                <Text style={[
                                    styles.menstrualSub,
                                    { color: 'rgba(255,255,255,0.85)', letterSpacing: 1, marginTop: 2, textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }
                                ]}>
                                    Biological Intelligence
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

export const BucketListWidget = React.memo(() => {
    const { bucketList, setTabIndex, profile, updateBucketItemOptimistic } = useOrbitStore();
    const [newItem, setNewItem] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isPrivate, setIsPrivate] = useState(false);

    const filteredList = useMemo(() => {
        return bucketList.filter(item => {
            if (!item.is_private) return true;
            return item.created_by === profile?.id;
        });
    }, [bucketList, profile?.id]);

    const completedCount = filteredList.filter(i => i.is_completed).length;
    const totalCount = filteredList.length;
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount);

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        setIsAdding(true);
        try {
            await addBucketItem(newItem.trim(), '', isPrivate);
            setNewItem('');
            setIsPrivate(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAdding(false);
        }
    };

    const handleToggle = async (id: string, completed: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        updateBucketItemOptimistic(id, !completed);
    };

    return (
        <Animated.View>
            <GlassCard style={styles.bucketCard} intensity={10}>
                <View style={styles.bucketHeader}>
                    <View style={styles.bucketTitleRow}>
                        <View style={styles.bucketIconContainer}>
                            <Target size={20} color={Colors.dark.rose[400]} />
                        </View>
                        <View>
                            <Text style={styles.bucketTitle}>Our Bucket List</Text>
                            <Text style={styles.bucketSubtitle}>DREAMS WE'LL CHASE TOGETHER</Text>
                        </View>
                    </View>

                    <View style={styles.progressContainer}>
                        <Svg width={40} height={40} viewBox="0 0 36 36" style={styles.progressSvg}>
                            <Circle
                                cx="18"
                                cy="18"
                                r="15.9155"
                                fill="none"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="3"
                            />
                            <Circle
                                cx="18"
                                cy="18"
                                r="15.9155"
                                fill="none"
                                stroke={Colors.dark.rose[500]}
                                strokeWidth="4"
                                strokeDasharray={`${progress * 100}, 100`}
                                strokeLinecap="round"
                            />
                        </Svg>
                        <View style={styles.progressTextContainer}>
                            <Text style={styles.progressCompleted}>{completedCount}</Text>
                            <View style={styles.progressDivider} />
                            <Text style={styles.progressTotal}>{totalCount}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.bucketInputContainer}>
                    <TouchableOpacity
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setIsPrivate(!isPrivate);
                        }}
                        style={styles.privateToggle}
                    >
                        {isPrivate ? <Lock size={16} color={Colors.dark.amber[400]} /> : <Unlock size={16} color="rgba(255,255,255,0.2)" />}
                    </TouchableOpacity>
                    <TextInput
                        style={styles.bucketInput}
                        placeholder={isPrivate ? "Add a private dream..." : "Add a new shared dream..."}
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        value={newItem}
                        onChangeText={setNewItem}
                        onSubmitEditing={handleAdd}
                        returnKeyType="done"
                    />
                    <TouchableOpacity onPress={handleAdd} disabled={isAdding || !newItem.trim()} style={[styles.addBtnSmall, !newItem.trim() && { opacity: 0.5 }]}>
                        <Plus size={16} color="white" />
                    </TouchableOpacity>
                </View>

                <Animated.View layout={LinearTransition.springify().mass(0.7)} style={styles.bucketItemsList}>
                    {filteredList.slice(0, 3).map(item => (
                        <Animated.View key={item.id} layout={LinearTransition.springify().mass(0.7)}>
                            <Pressable
                                onPress={() => handleToggle(item.id, item.is_completed)}
                                style={({ pressed }) => [
                                    styles.bucketItemRow,
                                    item.is_completed && styles.bucketItemCompleted,
                                    { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                                ]}
                            >
                                <View style={[styles.itemCheck, item.is_completed && styles.itemCheckActive]}>
                                    {item.is_completed && <Check size={10} color="white" strokeWidth={3} />}
                                </View>
                                <Text style={[styles.itemText, item.is_completed && styles.itemTextCompleted]} numberOfLines={1}>
                                    {item.title}
                                </Text>
                                {item.is_completed && <Trophy size={14} color={Colors.dark.amber[400]} style={{ opacity: 0.8 }} />}
                            </Pressable>
                        </Animated.View>
                    ))}
                </Animated.View>

                <TouchableOpacity style={styles.viewMoreBtn} onPress={() => setTabIndex(4, 'tap')}>
                    <Text style={styles.viewMoreText}>VIEW FULL LIST</Text>
                </TouchableOpacity>
            </GlassCard>
        </Animated.View>
    );
});

export const LetterPreviewWidget = React.memo(() => {
    const { letters, profile, partnerProfile, setTabIndex } = useOrbitStore();

    // Find the latest letter NOT from the current user
    const latestLetter = useMemo(() => {
        return [...letters].filter(l => l.sender_id !== profile?.id)[0] || null;
    }, [letters, profile?.id]);

    if (!latestLetter) return null;

    return (
        <Animated.View>
            <GlassCard style={styles.letterPreviewCard} intensity={8}>
                <View style={styles.letterPreviewHeader}>
                    <View style={styles.letterIconBox}>
                        <Mail size={18} color={Colors.dark.rose[400]} strokeWidth={1.5} />
                    </View>
                    <View>
                        <Text style={styles.letterLabel}>A SACRED NOTE</Text>
                        <Text style={[styles.letterPreviewTitle, { fontFamily: Typography.script, fontSize: 34, marginTop: -8, color: Colors.dark.rose[400] }]}>
                            {getPartnerName(profile, partnerProfile)}
                        </Text>
                    </View>
                </View>

                <Text style={styles.letterSnippet} numberOfLines={3}>
                    {latestLetter.content}
                </Text>

                <View style={styles.letterFooter}>
                    <Text style={styles.letterFrom}>SENT JUST NOW</Text>
                    <TouchableOpacity
                        style={styles.readMoreBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setTabIndex(2, 'tap'); // Letters tab is 2
                        }}
                    >
                        <Text style={styles.readMoreText}>READ MORE</Text>
                    </TouchableOpacity>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

export const OnThisDayWidget = React.memo(() => {
    const { memories, partnerProfile, profile } = useOrbitStore();
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const todayYear = today.getFullYear();

    const historicalMemories = useMemo(() => {
        return memories.filter(m => {
            const mDate = parseSafeDate(m.created_at);
            if (!mDate) return false;
            return mDate.getMonth() === todayMonth &&
                mDate.getDate() === todayDate &&
                mDate.getFullYear() < todayYear;
        }).sort((a, b) => {
            const dateA = parseSafeDate(a.created_at)?.getTime() || 0;
            const dateB = parseSafeDate(b.created_at)?.getTime() || 0;
            return dateB - dateA;
        });
    }, [memories, todayMonth, todayDate, todayYear]);

    if (historicalMemories.length === 0) return null;

    const memory = historicalMemories[0]; // Latest one from past years
    const memoryDate = parseSafeDate(memory.created_at);
    const dateStr = memoryDate?.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).toUpperCase();

    const imageUrl = memory.image_url || (memory.image_urls && memory.image_urls[0]);
    const sender = memory.sender_id === profile?.id ? profile : partnerProfile;
    const senderInitial = sender?.display_name?.charAt(0).toUpperCase() || '?';

    return (
        <Animated.View>
            <GlassCard style={styles.onThisDayCard} intensity={10}>
                {/* Image Backdrop with Overlay */}
                <View style={styles.otdImageContainer}>
                    {imageUrl && (
                        <Image
                            source={{ uri: getPublicStorageUrl(imageUrl, 'memories') || undefined }}
                            style={styles.otdImage}
                            contentFit="cover"
                        />
                    )}
                    <View style={styles.otdOverlay} />

                    {/* Content Header */}
                    <View style={styles.otdHeader}>
                        <View style={styles.otdTitleRow}>
                            <CalendarHeart size={20} color={Colors.dark.amber[400]} />
                            <Text style={styles.otdTitle}>On This Day</Text>
                        </View>
                        <View style={styles.otdCountBadge}>
                            <Text style={styles.otdCountText}>1 / {historicalMemories.length}</Text>
                        </View>
                    </View>

                    {/* Content Footer */}
                    <View style={styles.otdFooter}>
                        <View style={styles.otdSenderIcon}>
                            <Text style={styles.otdSenderText}>{senderInitial}</Text>
                        </View>
                        <View>
                            <View style={styles.otdDateRow}>
                                <Calendar size={12} color="rgba(255,255,255,0.4)" />
                                <Text style={styles.otdDateText}>{dateStr}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    statsCard: { margin: Spacing.sm, borderRadius: Radius.xxl, padding: 24, backgroundColor: 'rgba(5, 5, 10, 0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
    statMini: { alignItems: 'center', gap: 8 },
    statMiniValue: { fontSize: 24, fontFamily: Typography.serifBold, color: 'white' },

    musicCard: { margin: Spacing.sm, borderRadius: Radius.xl, paddingHorizontal: 24, paddingVertical: 20, backgroundColor: 'rgba(255,255,255,0.015)', borderColor: 'rgba(255,255,255,0.05)' },
    musicInfo: { flexDirection: 'row', alignItems: 'center', gap: 20, flex: 1 },
    musicIconWrapper: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(251,113,133,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(251,113,133,0.1)' },
    musicIconBox: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    musicTextGroup: { flex: 1 },
    musicStatus: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 4 },
    musicTitle: { fontSize: 18, fontFamily: Typography.serifBold, color: 'white', letterSpacing: -0.2 },
    musicArtist: { fontSize: 12, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.45)', marginTop: 2 },


    connUpdateBtn: { backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    connUpdateText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontFamily: Typography.sansBold, letterSpacing: 1.2 },
    connGrid: { flexDirection: 'row', gap: 32 },
    connBlock: { flex: 1, backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: Radius.xl, padding: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    connBlockPartner: { backgroundColor: 'rgba(129, 140, 248, 0.02)', borderColor: 'rgba(129, 140, 248, 0.08)' },
    connUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    connAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
    connUserLabel: { fontSize: 14, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.78)', letterSpacing: 1.2, textTransform: 'uppercase' },
    connTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    connEmojiTag: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.02)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100, maxWidth: '100%' },
    connEmojiText: { fontSize: 26 },
    connTagText: { fontSize: 15, fontFamily: Typography.serifBold, color: 'rgba(255,255,255,0.96)', textTransform: 'capitalize' },
    connEmptyText: { fontSize: 14, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.52)', letterSpacing: 0.2, lineHeight: 20 },
    connNote: { fontSize: 16, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.72)', marginTop: 16, lineHeight: 24, fontStyle: 'italic' },

    alertCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg, backgroundColor: 'rgba(225, 29, 72, 0.05)' },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    alertTitle: { color: Colors.dark.rose[400], fontSize: 14, fontFamily: Typography.sansBold },
    alertText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18 },

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
        backgroundColor: 'rgba(255,255,255,0.45)',
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
    countdownBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    countdownBadgeText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    miniHeartFloating: {
        position: 'absolute',
        top: -8,
        right: -4,
        opacity: 0.8,
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
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 2,
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
        fontSize: 9,
        fontFamily: Typography.sansBold,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    secondaryTimerValue: {
        marginTop: 6,
        color: 'rgba(255,255,255,0.65)',
        fontSize: 11,
        fontFamily: Typography.sans,
        letterSpacing: 0.6,
    },

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

    locationCardRedesign: {
        width: SCREEN_WIDTH,
        padding: 24,
        paddingHorizontal: 20,
        borderRadius: 0,
        borderWidth: 0,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        height: 220, // Final generous height
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 5, 10, 0.8)',
    },
    locHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    locHeaderText: {
        color: 'white',
        fontSize: 20,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.5,
    },

    locBridgeArea: {
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    locDistanceBadge: {
        position: 'absolute',
        bottom: -28, // Move slightly lower for cleaner alignment under heart
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    locDistanceText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 0.8,
    },
    locMainGrid: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    locSection: {
        flex: 1,
    },
    locLabelText: {
        fontSize: 16,
        fontFamily: Typography.serifBold,
        color: 'rgba(255,255,255,0.96)',
        letterSpacing: 0.2,
        height: 22,
    },
    locFullAddress: {
        fontSize: 12,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 0.3,
        height: 18,
        marginTop: 2,
        marginBottom: 8,
    },
    locTimeDisplay: {
        fontSize: 22,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: -0.5,
    },
    locBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
    },
    locStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    locStatusText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.62)',
        letterSpacing: 0.8,
    },
    locTimeBridge: {
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    locBridgeCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(251,113,133,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    locBridgeLine: {
        position: 'absolute',
        width: 100,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: -1,
    },
    inspirationCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24, backgroundColor: 'rgba(5, 5, 10, 0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    inspirationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    inspirationTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
    letterPreviewCard: {
        margin: Spacing.sm,
        padding: 24,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(5, 5, 10, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    letterPreviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    letterIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(251,113,133,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(251,113,133,0.2)',
    },
    letterLabel: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1.2,
    },
    letterPreviewTitle: {
        fontSize: 18,
        fontFamily: Typography.serif,
        color: 'white',
        marginTop: 2,
    },
    letterSnippet: {
        fontSize: 15,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 24,
        marginBottom: 24,
    },
    letterFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 16,
    },
    letterFrom: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 1.1,
    },
    readMoreBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    readMoreText: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.92)',
        letterSpacing: 0.8,
    },

    tabToggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 100,
        padding: 4,
        alignSelf: 'flex-start',
        marginBottom: 24,
    },
    tabToggleItem: {
        paddingHorizontal: 16,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    tabToggleActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    tabToggleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    headerActivateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.2)',
    },
    headerActivateText: {
        color: Colors.dark.rose[400],
        fontSize: 8.5,
        fontFamily: Typography.sansBold,
        letterSpacing: 0.8,
    },
    miniDot: {
        width: 3.5,
        height: 3.5,
        borderRadius: 2,
        backgroundColor: Colors.dark.rose[400],
        marginRight: 5,
    },
    tabToggleText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
    },
    tabToggleTextActive: {
        color: 'white',
    },
    inspirationContent: {
        alignItems: 'flex-start',
        minHeight: 110,
    },
    quoteMark: {
        color: Colors.dark.rose[400],
        fontSize: 24,
        fontFamily: Typography.serifBold,
    },
    inspirationCardText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 15,
        fontFamily: Typography.serif,
        lineHeight: 24,
        textAlign: 'left',
    },
    quoteItalicStyle: {
        fontFamily: Typography.serifItalic,
    },

    menstrualCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24 },
    menstrualHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    menstrualTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
    menstrualSub: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
    menstrualTip: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: Typography.serifItalic, marginBottom: 24, lineHeight: 22 },
    menstrualProgress: { height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' },
    menstrualFill: { height: '100%', backgroundColor: Colors.dark.rose[400], borderRadius: 2 },

    bucketCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.08)' },
    bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    bucketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    bucketIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(225, 29, 72, 0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.1)' },
    bucketTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
    bucketSubtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontFamily: Typography.sansBold, letterSpacing: 1.5, marginTop: 2 },

    progressContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    progressSvg: { transform: [{ rotate: '-90deg' }] },
    progressTextContainer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    progressCompleted: { color: 'white', fontSize: 9, fontFamily: Typography.sansBold, lineHeight: 9 },
    progressDivider: { width: 6, height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 0.5 },
    progressTotal: { color: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: Typography.sansBold, lineHeight: 7 },

    bucketInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(225, 29, 72, 0.03)',
        borderRadius: 16,
        paddingLeft: 10,
        paddingRight: 4,
        height: 48,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.15)',
        shadowColor: Colors.dark.rose[500],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    privateToggle: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
    bucketInput: { flex: 1, color: 'white', fontSize: 13, fontFamily: Typography.sans },
    addBtnSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.dark.rose[500], alignItems: 'center', justifyContent: 'center' },

    bucketItemsList: { gap: 8 },
    bucketItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 4
    },
    bucketItemCompleted: { opacity: 0.6, backgroundColor: 'rgba(225, 29, 72, 0.03)', borderColor: 'rgba(225, 29, 72, 0.05)' },
    itemCheck: { width: 18, height: 18, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    itemCheckActive: { backgroundColor: Colors.dark.rose[500], borderColor: Colors.dark.rose[500] },
    itemText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: Typography.sansBold, flex: 1 },
    itemTextCompleted: { color: 'rgba(255,255,255,0.3)', textDecorationLine: 'line-through' },

    onThisDayCard: {
        margin: Spacing.sm,
        borderRadius: 28,
        padding: 0,
        overflow: 'hidden',
        height: 420,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    otdImageContainer: {
        flex: 1,
        position: 'relative',
    },
    otdImage: {
        ...StyleSheet.absoluteFillObject,
    },
    otdOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    otdHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        zIndex: 10,
    },
    otdTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    otdTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.serif,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    otdCountBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    otdCountText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    otdFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 24,
        zIndex: 10,
        flexDirection: 'column',
    },
    otdSenderIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    otdSenderText: {
        color: 'black',
        fontSize: 14,
        fontFamily: Typography.serifBold,
    },
    otdDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    otdDateText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        textShadowColor: 'rgba(0, 0, 0, 0.6)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },

    viewMoreBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
    viewMoreText: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
    notifBadgeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.dark.rose[400],
    },
    notifContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: 10,
    },
    notifTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.serif,
        marginBottom: 8,
    },
    notifDesc: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 13,
        fontFamily: Typography.sans,
        lineHeight: 18,
        marginBottom: 20,
    },
    notifBtn: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
    },
    notifBtnEnabled: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    notifBtnText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    tabItemWithDot: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    morningInsightBanner: {
        paddingVertical: 24,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.01)',
        marginBottom: 8,
    },
    morningInsightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    morningInsightLabel: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },

    // ── ConnectionBoard (Vibe Sync) ──────────────────────────────────────────
    connCard: {
        margin: Spacing.sm,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    connHeaderRedesign: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    connTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    connTitle: {
        fontSize: 16,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 0.3,
    },
    connActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    connHistoryBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    connUpdateBtnRedesign: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(129,140,248,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(129,140,248,0.3)',
    },
    connUpdateTextRedesign: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: '#818cf8',
        letterSpacing: 0.5,
    },
    connBlockPartnerRedesign: {
        backgroundColor: 'rgba(129,140,248,0.05)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(129,140,248,0.12)',
    },
    connBlockSelfRedesign: {
        backgroundColor: 'rgba(251,113,133,0.05)',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(251,113,133,0.12)',
    },
    connUserRowRedesign: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connUserLabelRedesign: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 4,
    },
    connUserLabelRow: { flexDirection: 'row', alignItems: 'center' },
    connUpdateHint: { flexDirection: 'row', alignItems: 'center' },
    connMoodInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    connMoodLabelInline: { fontSize: 13, fontFamily: Typography.sansBold, color: 'white', marginLeft: 6 },
    biologicalBadge: {
        flexDirection: 'row', alignItems: 'center', marginLeft: 8,
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
        backgroundColor: 'rgba(251,113,133,0.1)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.2)'
    },
    biologicalBadgeText: { fontSize: 7, fontFamily: Typography.sansBold, color: '#fb7185', letterSpacing: 0.5 },
    connMoodLabelInlineSelf: { fontSize: 13, fontFamily: Typography.sansBold, color: 'white', marginLeft: 6 },
    connEmptyTextRedesign: {
        fontSize: 11,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.25)',
        fontStyle: 'italic',
    },
    connNoteBoxRedesign: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(129,140,248,0.1)',
    },
    connNoteBoxSelfRedesign: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(251,113,133,0.1)',
    },
    connNoteTextRedesign: {
        flex: 1,
        fontSize: 13,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.65)',
        lineHeight: 20,
    },
    connNoteBoxEmpty: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.04)',
    },
    connNoteEmptyText: {
        fontSize: 11,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.18)',
        fontStyle: 'italic',
    },
    connDividerShape: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 12,
    },
    connDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
});

