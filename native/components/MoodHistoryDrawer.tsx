import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, TouchableOpacity } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withSpring,
    useSharedValue,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { X, Clock } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Emoji } from './Emoji';
import { getTodayIST } from '../lib/utils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.75;

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

const formatTime = (ts: number) => {
    if (!ts) return 'Unknown';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export function MoodHistoryDrawer() {
    const insets = useSafeAreaInsets();
    const isMoodHistoryOpen = useOrbitStore(s => s.isMoodHistoryOpen);
    const setMoodHistoryOpen = useOrbitStore(s => s.setMoodHistoryOpen);
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const moods = useOrbitStore(s => s.moods);

    const translateY = useSharedValue(SCREEN_HEIGHT);

    useEffect(() => {
        if (isMoodHistoryOpen) {
            translateY.value = withSpring(0, {
                damping: 20,
                stiffness: 150,
                overshootClamping: true
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            translateY.value = withSpring(SCREEN_HEIGHT, {
                damping: 20,
                stiffness: 150,
                overshootClamping: true
            });
        }
    }, [isMoodHistoryOpen]);

    const gesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 100 || event.velocityY > 500) {
                runOnJS(setMoodHistoryOpen)(false);
            } else {
                translateY.value = withSpring(0, { damping: 20, stiffness: 150, overshootClamping: true });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, DRAWER_HEIGHT], [1, 0], Extrapolate.CLAMP),
    }));

    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;

    // Filter to only today's moods for history
    const todaysMoods = useMemo(() => {
        return (moods || [])
            .filter(m => m.mood_date === today && (m.user_id === myId || m.user_id === partnerId))
            .sort((a, b) => getMoodTimestamp(b) - getMoodTimestamp(a));
    }, [moods, today, myId, partnerId]);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={isMoodHistoryOpen ? 'auto' : 'none'}>
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoodHistoryOpen(false)} />
            </Animated.View>

            <Animated.View style={[styles.drawer, animatedStyle, { height: DRAWER_HEIGHT + insets.bottom }]}>
                <View style={[StyleSheet.absoluteFill, styles.drawerBg]}>

                    <GestureDetector gesture={gesture}>
                        <View style={styles.handleWrapper}>
                            <View style={styles.handleContainer}>
                                <View style={styles.handle} />
                            </View>

                            <View style={styles.header}>
                                <View>
                                    <Text style={styles.title}>Mood History</Text>
                                    <Text style={styles.subtitle}>TODAY'S TIMELINE</Text>
                                </View>
                                <TouchableOpacity onPress={() => setMoodHistoryOpen(false)} style={styles.closeBtn}>
                                    <X size={20} color="rgba(255,255,255,0.4)" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </GestureDetector>

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {todaysMoods.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No moods recorded today.</Text>
                            </View>
                        ) : (
                            todaysMoods.map((mood) => {
                                const isMe = mood.user_id === myId;
                                const ts = getMoodTimestamp(mood);
                                return (
                                    <View key={mood.id} style={[styles.historyRow, isMe ? styles.historyRowMe : styles.historyRowPartner]}>
                                        <View style={styles.historyTimeSection}>
                                            <Clock size={12} color="rgba(255,255,255,0.4)" style={{ marginRight: 4 }} />
                                            <Text style={styles.historyTime}>{formatTime(ts)}</Text>
                                        </View>
                                        <View style={[styles.historyBubble, isMe ? styles.historyBubbleMe : styles.historyBubblePartner]}>
                                            <View style={styles.bubbleHeader}>
                                                <Text style={styles.bubbleUser}>{isMe ? 'You' : partnerProfile?.display_name?.split(' ')[0]}</Text>
                                                <Emoji symbol={mood.emoji} size={18} />
                                            </View>
                                            {!!mood.mood_text && (
                                                <Text style={styles.bubbleNote}>"{mood.mood_text}"</Text>
                                            )}
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)' },
    drawer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: Radius.xl * 2,
        borderTopRightRadius: Radius.xl * 2,
        overflow: 'hidden',
        zIndex: 9999
    },
    drawerBg: {
        backgroundColor: 'rgba(10,10,20,0.95)',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    handleWrapper: {
        backgroundColor: 'transparent',
    },
    handleContainer: { height: 32, alignItems: 'center', justifyContent: 'center' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20 },
    title: { fontSize: 28, fontFamily: Typography.serif, color: 'white' },
    emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: Typography.sans },
    closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 60 },
    emptyContainer: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: Typography.sans },
    historyRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    historyRowMe: { justifyContent: 'flex-start' }, // Changed to flex-end logic inside the renderer if we wanted alternating, but column list is fine
    historyRowPartner: {},
    historyTimeSection: { width: 60, flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    historyTime: { fontSize: 14, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.75)' },
    historyBubble: {
        flex: 1,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
    },
    historyBubbleMe: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderTopRightRadius: 4,
    },
    historyBubblePartner: {
        backgroundColor: 'rgba(129, 140, 248, 0.05)',
        borderColor: 'rgba(129, 140, 248, 0.15)',
        borderTopLeftRadius: 4,
    },
    bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bubbleUser: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: 1 },
    bubbleNote: { fontSize: 14, fontFamily: Typography.serifItalic, color: 'white', marginTop: 8, lineHeight: 20, opacity: 0.9 },
});
