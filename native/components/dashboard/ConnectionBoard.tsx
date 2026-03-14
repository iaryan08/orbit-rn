import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles, Clock, Edit2 } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { Shimmer } from '../Shimmer';
import { ProfileAvatar } from '../ProfileAvatar';
import { Emoji } from '../Emoji';
import { useOrbitStore } from '../../lib/store';
import { getTodayIST, getPartnerName } from '../../lib/utils';
import { getPublicStorageUrl } from '../../lib/storage';

const MOOD_EMOJIS: Record<string, string> = {
    happy: '😊',
    loved: '🥰',
    excited: '🤩',
    calm: '😌',
    sad: '😢',
    tired: '😴',
    grateful: '🙏',
    flirty: '😉',
    'missing you badly': '🥺',
    cuddly: '🫂',
    romantic: '🌹',
    passionate: '❤️🔥',
    'craving you': '🔥',
    playful: '😈'
};

const MOOD_COLORS: Record<string, string> = {
    happy: '#fbbf24', // amber
    loved: '#f472b6', // pink
    excited: '#fb923c', // orange
    calm: '#34d399', // emerald
    sad: '#60a5fa', // blue
    tired: '#94a3b8', // slate
    grateful: '#a78bfa', // violet
    flirty: '#f472b6', // pink
    'missing you badly': '#818cf8', // indigo
    cuddly: '#fb7185', // rose
    romantic: '#e11d48', // rose-600
    passionate: '#ef4444', // red
    'craving you': '#b91c1c', // red-700
    playful: '#c084fc' // purple
};

const parseMoodPresentation = (moodValue?: string | null) => {
    if (!moodValue) return { emoji: '✨', label: '' };
    if (moodValue.startsWith('CUSTOM:')) {
        const [, emoji, label] = moodValue.split(':');
        return { emoji: emoji || '✨', label: label || 'Custom' };
    }
    const emoji = (MOOD_EMOJIS as any)[moodValue] || moodValue;
    return {
        emoji,
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

export const ConnectionBoard = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    const setMoodDrawerOpen = useOrbitStore(s => s.setMoodDrawerOpen);
    const moods = useOrbitStore(s => s.moods);
    const loading = useOrbitStore(s => s.loading);
    const sendHeartbeatOptimistic = useOrbitStore(s => s.sendHeartbeatOptimistic);
    const idToken = useOrbitStore(s => s.idToken);
    const setMoodHistoryOpen = useOrbitStore(s => s.setMoodHistoryOpen);

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

    const partnerIsFemale = partnerProfile?.gender === 'female';
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;
    const partnerIsOnPeriod = partnerIsFemale && (partnerLogsToday?.is_period === true || partnerLogsToday?.flow);

    const myMoodEmoji = myLatestMood ? [myMoodDisplay.emoji] : (cycleLogs[myId]?.[today]?.symptoms || []);
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
                        <Text style={styles.connTitle}>Moods</Text>
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
                {/* Partner Mood Block */}
                <Animated.View style={[styles.connBlockPartnerRedesign, heartbeatPulseStyle]}>
                    <TouchableOpacity style={styles.connUserRowRedesign} onLongPress={handleHeartbeatHold} delayLongPress={220}>
                        <ProfileAvatar
                            url={partnerAvatarUrl}
                            fallbackText={partnerName}
                            size={38}
                            borderWidth={0}
                        />
                        <View style={{ marginLeft: 14, flex: 1 }}>
                            <View style={styles.connNameRow}>
                                <Text style={styles.connUserName}>{partnerName}</Text>
                            </View>
                            <View style={styles.connEmojiRow}>
                                {partnerMoodEmoji.length > 0 ? (
                                    <>
                                        {partnerMoodEmoji.slice(0, 3).map((e: any, idx: any) => (
                                            <Emoji key={idx} symbol={e} size={22} style={{ marginRight: 6 }} />
                                        ))}
                                        {partnerLatestMood && (
                                            <View style={[styles.connMoodBadge, { backgroundColor: `${MOOD_COLORS[partnerLatestMood.emoji] || Colors.dark.indigo[400]}20` }]}>
                                                <Text style={[styles.connMoodLabel, { color: MOOD_COLORS[partnerLatestMood.emoji] || Colors.dark.indigo[400] }]}>
                                                    {partnerMoodDisplay.label}
                                                </Text>
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <Text style={styles.connEmptyMood}>Waiting for vibe...</Text>
                                )}
                            </View>
                            {partnerNote ? (
                                <View style={styles.connNoteContainer}>
                                    <Text style={styles.connNoteText} numberOfLines={2}>{partnerNote}</Text>
                                </View>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                </Animated.View>
                {/* My Mood Block */}
                <View style={styles.connBlockMeRedesign}>
                    <TouchableOpacity
                        style={styles.connUserRowRedesign}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMoodDrawerOpen(true);
                        }}
                    >
                        <ProfileAvatar
                            url={myAvatarUrl}
                            fallbackText={myName}
                            size={38}
                            borderWidth={0}
                        />
                        <View style={{ marginLeft: 14, flex: 1 }}>
                            <View style={styles.connNameRow}>
                                <Text style={styles.connUserName}>{myName}</Text>
                                <Edit2 size={14} color="rgba(255,255,255,0.4)" />
                            </View>
                            <View style={styles.connEmojiRow}>
                                {myMoodEmoji.length > 0 ? (
                                    <>
                                        {myMoodEmoji.slice(0, 3).map((e: any, idx: any) => (
                                            <Emoji key={idx} symbol={e} size={22} style={{ marginRight: 6 }} />
                                        ))}
                                        {myLatestMood && (
                                            <View style={[styles.connMoodBadge, { backgroundColor: `${MOOD_COLORS[myLatestMood.emoji] || 'rgba(255,255,255,0.06)'}20` }]}>
                                                <Text style={[styles.connMoodLabel, { color: MOOD_COLORS[myLatestMood.emoji] || 'rgba(255,255,255,0.7)' }]}>
                                                    {myMoodDisplay.label}
                                                </Text>
                                            </View>
                                        )}
                                    </>
                                ) : (
                                    <Text style={styles.connEmptyMood}>How are you feeling?</Text>
                                )}
                            </View>
                            {myNote ? (
                                <View style={styles.connNoteContainer}>
                                    <Text style={styles.connNoteText} numberOfLines={2}>{myNote}</Text>
                                </View>
                            ) : null}
                        </View>
                    </TouchableOpacity>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
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
        gap: 10,
    },
    summaryName: {
        fontSize: 28,
        color: 'white',
        fontFamily: Typography.serifBold, // Preserved heritage font for personal names
        letterSpacing: -0.5,
    },
    connTitle: {
        fontSize: 20,
        fontFamily: Typography.sansBold, // Outfit modern boldness
        color: 'white',
        letterSpacing: -0.5,
    },
    connActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    connHistoryBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    connBlockPartnerRedesign: {
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(99, 102, 241, 0.15)',
    },
    connBlockMeRedesign: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    connUserRowRedesign: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    connNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    connUserName: {
        fontSize: 15,
        fontFamily: Typography.serifBold, // Preserved heritage font for names
        color: 'rgba(255,255,255,0.95)',
    },
    connMoodBadge: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    connMoodLabel: {
        fontSize: 12,
        fontFamily: Typography.sansBold, // Outfit
        letterSpacing: 0.8,
    },
    connEmojiRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
    },
    connEmptyMood: {
        fontSize: 13,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.55)',
    },
    connNoteContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    connNoteText: {
        fontSize: 13,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.82)',
        lineHeight: 18,
    },
});
