import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Image } from 'expo-image';
import { Heart, PenLine, Image as ImageIcon, Flame, Calendar, Quote, Moon, Target, MapPin, Sparkles, Edit2, Lock, Unlock, Camera, ChevronRight, Plus, CalendarHeart, Cake, Minus, Thermometer, Droplets, Wind, Sun, Leaf, Mail, Check, Trophy } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { GlassCard } from './GlassCard';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { useOrbitStore } from '../lib/store';
import * as Haptics from 'expo-haptics';
import { getTodayIST } from '../lib/utils';
import { getPublicStorageUrl } from '../lib/storage';
import { submitMood, addBucketItem, toggleBucketItem } from '../lib/auth';
import { ProfileAvatar } from './ProfileAvatar';
import { Emoji } from './Emoji';
import Svg, { Circle } from 'react-native-svg';

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

interface RelationshipStatsProps {
    couple: any;
    lettersCount: number;
    memoriesCount: number;
}

export const RelationshipStats = React.memo(({ couple, lettersCount, memoriesCount }: RelationshipStatsProps) => {
    const daysTogether = useMemo(() => {
        const startDate = couple?.anniversary_date || couple?.paired_at;
        if (!startDate) return 0;
        const start = new Date(startDate).getTime();
        if (isNaN(start)) return 0;
        const diff = new Date().getTime() - start;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        return isNaN(days) ? 0 : Math.max(0, days);
    }, [couple?.anniversary_date, couple?.paired_at]);

    const scale = useSharedValue(1);

    React.useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.15, { duration: 600, easing: Easing.bezier(0.33, 1, 0.68, 1) }),
                withTiming(1, { duration: 800, easing: Easing.bezier(0.33, 1, 0.68, 1) })
            ),
            -1,
            true
        );
    }, []);

    const animatedHeartStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <GlassCard style={styles.statsCard} intensity={12}>
            <View style={styles.statsRow}>
                <View style={styles.heartSection}>
                    <Animated.View style={[styles.heartContainer, animatedHeartStyle]}>
                        <Heart size={44} color={Colors.dark.rose[500]} fill={Colors.dark.rose[500]} />
                    </Animated.View>
                </View>

                <View style={styles.daysInfoSection}>
                    <Text style={styles.daysNumber}>{daysTogether}</Text>
                    <View style={styles.daysLabels}>
                        <Text style={styles.daysLabel}>Days</Text>
                        <Text style={styles.subLabel}>OUR JOURNEY</Text>
                    </View>
                </View>

                <View style={styles.countsSection}>
                    <View style={styles.countItem}>
                        <PenLine size={18} color={Colors.dark.rose[400]} />
                        <Text style={styles.countNumber}>{lettersCount}</Text>
                    </View>
                    <View style={styles.countItem}>
                        <ImageIcon size={18} color={Colors.dark.amber[400]} />
                        <Text style={styles.countNumber}>{memoriesCount}</Text>
                    </View>
                </View>
            </View>
        </GlassCard>
    );
});

export const AuraBoard = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    const { setMoodDrawerOpen, idToken, setTabIndex, moods } = useOrbitStore();
    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;

    const myLatestMood = moods.find(m => m.user_id === myId && m.mood_date === today);
    const partnerLatestMood = moods.find(m => m.user_id === partnerId && m.mood_date === today);

    const myAura = myLatestMood ? [myLatestMood.emoji] : (cycleLogs[myId]?.[today]?.symptoms || []);
    const partnerAura = partnerLatestMood ? [partnerLatestMood.emoji] : (cycleLogs[partnerId]?.[today]?.symptoms || []);

    const myNote = myLatestMood?.mood_text || cycleLogs[myId]?.[today]?.note || '';
    const partnerNote = partnerLatestMood?.mood_text || cycleLogs[partnerId]?.[today]?.note || '';

    const myAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const myName = profile?.display_name || 'You';
    const partnerName = partnerProfile?.display_name || 'Partner';

    return (
        <GlassCard style={styles.auraCard} intensity={10}>
            <View style={styles.auraHeader}>
                <View style={styles.auraTitleGroup}>
                    <Sparkles size={18} color={Colors.dark.indigo[400]} />
                    <Text style={styles.auraTitle}>Mood</Text>
                </View>
                <TouchableOpacity
                    style={styles.auraUpdateBtn}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMoodDrawerOpen(true);
                    }}
                >
                    <Text style={styles.auraUpdateText}>UPDATE</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.auraGrid}>
                <View style={[styles.auraBlock, styles.auraBlockPartner]}>
                    <View style={styles.auraUserRow}>
                        <ProfileAvatar
                            url={partnerAvatarUrl}
                            fallbackText={partnerName}
                            size={24}
                            borderWidth={0}
                        />
                        <Text style={styles.auraUserLabel}>{partnerName}</Text>
                    </View>
                    <View style={styles.auraTags}>
                        {partnerAura.length > 0 ? (
                            <View style={styles.auraEmojiTag}>
                                <Emoji symbol={MOOD_EMOJIS[partnerAura[partnerAura.length - 1]] || '✨'} size={22} />
                                <Text style={styles.auraTagText}>{partnerAura[partnerAura.length - 1].toUpperCase()}</Text>
                            </View>
                        ) : (
                            <Text style={styles.auraEmptyText}>WAITING FOR {partnerName.toUpperCase()}...</Text>
                        )}
                    </View>
                    {partnerNote ? <Text style={styles.auraNote}>"{partnerNote}"</Text> : null}
                </View>

                <TouchableOpacity
                    style={styles.auraBlock}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTabIndex(4);
                    }}
                >
                    <View style={styles.auraUserRow}>
                        <ProfileAvatar
                            url={myAvatarUrl}
                            fallbackText={myName}
                            size={24}
                            borderWidth={0}
                        />
                        <Text style={styles.auraUserLabel}>You</Text>
                    </View>
                    <View style={styles.auraTags}>
                        {myAura.length > 0 ? (
                            <View style={styles.auraEmojiTag}>
                                <Emoji symbol={MOOD_EMOJIS[myAura[myAura.length - 1]] || '✨'} size={22} />
                                <Text style={styles.auraTagText}>{myAura[myAura.length - 1].toUpperCase()}</Text>
                            </View>
                        ) : (
                            <Text style={styles.auraEmptyText}>HOW ARE YOU?</Text>
                        )}
                    </View>
                    {myNote ? <Text style={styles.auraNote}>"{myNote}"</Text> : null}
                </TouchableOpacity>
            </View>
        </GlassCard>
    );
});

export const IntimacyAlert = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    // Re-calculating exactly same as dashboard
    const today = getTodayIST();
    const partnerId = partnerProfile?.id;
    const partnerPeriod = cycleLogs[partnerId]?.[today]?.isPeriod;
    const partnerFlow = cycleLogs[partnerId]?.[today]?.symptoms?.includes('flow_heavy');
    const isSeen = profile?.last_seen_intimacy === today;

    if ((!partnerPeriod && !partnerFlow) || isSeen) return null;

    const handleDismiss = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (profile?.id) {
            const userRef = doc(db, 'users', profile.id);
            updateDoc(userRef, { last_seen_intimacy: today })
                .catch(err => console.error("Error marking intimacy as seen:", err));
        }
    };

    return (
        <GlassCard style={styles.alertCard} intensity={15}>
            <View style={styles.alertHeader}>
                <Flame size={20} color={Colors.dark.rose[400]} />
                <Text style={styles.alertTitle}>Sensitive Period</Text>
                <TouchableOpacity onPress={handleDismiss} style={{ marginLeft: 'auto' }}>
                    <Plus size={16} color="rgba(255,255,255,0.3)" style={{ transform: [{ rotate: '45deg' }] }} />
                </TouchableOpacity>
            </View>
            <Text style={styles.alertText}>
                {partnerProfile?.display_name || 'Your partner'} is on their period.
                Be extra gentle and caring today. <Emoji symbol="❤️" size={13} />
            </Text>
        </GlassCard>
    );
});

export const ImportantDatesCountdown = React.memo(({ milestones }: any) => {
    const nextDate = milestones?.[0]; // Simplified for now
    if (!nextDate) return null;

    return (
        <GlassCard style={styles.countdownCard} intensity={10}>
            <View style={styles.countdownRow}>
                <CalendarHeart size={20} color={Colors.dark.amber[400]} />
                <View style={styles.countdownInfo}>
                    <Text style={styles.countdownTitle}>{nextDate.title}</Text>
                    <Text style={styles.countdownDays}>in 4 days</Text>
                </View>
            </View>
        </GlassCard>
    );
});

export const LocationWidget = React.memo(({ profile, partnerProfile }: any) => {
    const [currentTime, setCurrentTime] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase();
    };

    return (
        <GlassCard style={styles.locationCard} intensity={8}>
            <View style={styles.locationGrid}>
                <View style={styles.locationHalf}>
                    <MapPin size={14} color={Colors.dark.indigo[400]} />
                    <Text style={styles.locationCity}>Mumbai</Text>
                    <Text style={styles.locationTime}>{formatTime(currentTime)}</Text>
                    <Text style={styles.locationUser}>YOU</Text>
                </View>

                <View style={styles.distanceContainer}>
                    <View style={styles.distanceBadge}>
                        <Text style={styles.distanceText}>ALWAYS TOGETHER</Text>
                    </View>
                    <View style={styles.locationDivider} />
                </View>

                <View style={styles.locationHalf}>
                    <MapPin size={14} color={Colors.dark.rose[400]} />
                    <Text style={styles.locationCity}>Pune</Text>
                    <Text style={styles.locationTime}>{formatTime(currentTime)}</Text>
                    <Text style={styles.locationUser}>{partnerProfile?.display_name?.toUpperCase() || 'PARTNER'}</Text>
                </View>
            </View>
        </GlassCard>
    );
});

export const DailyInspirationWidget = React.memo(() => {
    const [activeTab, setActiveTab] = React.useState<'quote' | 'notifications'>('quote');
    const [notifEnabled, setNotifEnabled] = React.useState(false);

    return (
        <GlassCard style={styles.inspirationCard} intensity={10}>
            <View style={styles.inspirationHeader}>
                <Sparkles size={20} color={Colors.dark.indigo[400]} />
                <Text style={styles.inspirationTitle}>DAILY INSPIRATION</Text>
            </View>

            {/* Tabs Toggle */}
            <View style={styles.tabToggleHeader}>
                <View style={styles.tabToggleContainer}>
                    {(['quote', 'notifications'] as const).map((tab) => {
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
                                <View style={styles.tabItemWithDot}>
                                    <Text style={[
                                        styles.tabToggleText,
                                        isSelected && styles.tabToggleTextActive
                                    ]}>
                                        {tab.toUpperCase()}
                                    </Text>
                                    {tab === 'notifications' && !notifEnabled && (
                                        <View style={styles.notifBadgeDot} />
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {!notifEnabled && (
                    <TouchableOpacity
                        style={styles.headerActivateBtn}
                        onPress={() => {
                            setNotifEnabled(true);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                    >
                        <View style={styles.miniDot} />
                        <Text style={styles.headerActivateText}>ACTIVATE</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.inspirationContent}>
                {activeTab === 'quote' ? (
                    <Text style={styles.quoteText}>
                        <Text style={styles.quoteMark}>"</Text>
                        Love is not a destination we reach, but the quiet rhythm of our shadows walking in perfect sync.
                        <Text style={styles.quoteMark}>"</Text>
                    </Text>
                ) : (
                    <View style={styles.notifContainer}>
                        <Text style={styles.notifTitle}>Stay Motivated</Text>
                        <Text style={styles.notifDesc}>Receive a daily spark of love and relationship wisdom every morning.</Text>
                        <TouchableOpacity
                            style={[styles.notifBtn, notifEnabled && styles.notifBtnEnabled]}
                            onPress={() => {
                                setNotifEnabled(!notifEnabled);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }}
                        >
                            <Text style={styles.notifBtnText}>
                                {notifEnabled ? 'NOTIFICATIONS ACTIVE' : 'ACTIVATE NOTIFICATIONS'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </GlassCard>
    );
});

export const MenstrualPhaseWidget = React.memo(() => {
    return (
        <GlassCard style={styles.menstrualCard} intensity={10}>
            <View style={styles.menstrualHeader}>
                <Moon size={20} color={Colors.dark.rose[400]} />
                <View>
                    <Text style={styles.menstrualTitle}>Follicular Phase</Text>
                    <Text style={styles.menstrualSub}>DAY 8 OF CYCLE</Text>
                </View>
            </View>
            <Text style={styles.menstrualTip}>
                Energy is rising. Perfect time for new experiences together.
            </Text>
            <View style={styles.menstrualProgress}>
                <View style={[styles.menstrualFill, { width: '40%' }]} />
            </View>
        </GlassCard>
    );
});

export const BucketListWidget = React.memo(() => {
    const { bucketList, setTabIndex, profile } = useOrbitStore();
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
        await toggleBucketItem(id, !completed);
    };

    return (
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

            <View style={styles.bucketItemsList}>
                {filteredList.slice(0, 3).map(item => (
                    <TouchableOpacity
                        key={item.id}
                        style={[styles.bucketItemRow, item.is_completed && styles.bucketItemCompleted]}
                        onPress={() => handleToggle(item.id, item.is_completed)}
                    >
                        <View style={[styles.itemCheck, item.is_completed && styles.itemCheckActive]}>
                            {item.is_completed && <Check size={10} color="white" strokeWidth={3} />}
                        </View>
                        <Text style={[styles.itemText, item.is_completed && styles.itemTextCompleted]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        {item.is_completed && <Trophy size={14} color={Colors.dark.amber[400]} style={{ opacity: 0.8 }} />}
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity style={styles.viewMoreBtn} onPress={() => setTabIndex(4)}>
                <Text style={styles.viewMoreText}>VIEW FULL LIST</Text>
            </TouchableOpacity>
        </GlassCard>
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
        <GlassCard style={styles.letterPreviewCard} intensity={8}>
            <View style={styles.letterPreviewHeader}>
                <View style={styles.letterIconBox}>
                    <Mail size={20} color={Colors.dark.rose[400]} />
                </View>
                <View>
                    <Text style={styles.letterLabel}>NEW MESSAGE</Text>
                    <Text style={styles.letterPreviewTitle}>From {partnerProfile?.display_name || 'Partner'}</Text>
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
                        setTabIndex(1);
                    }}
                >
                    <Text style={styles.readMoreText}>READ MORE</Text>
                </TouchableOpacity>
            </View>
        </GlassCard>
    );
});

const styles = StyleSheet.create({
    statsCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heartSection: { width: 60, alignItems: 'center' },
    heartContainer: { width: 56, height: 56, backgroundColor: 'rgba(225, 29, 72, 0.1)', borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    daysInfoSection: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
    daysNumber: { fontSize: 38, fontFamily: Typography.serif, color: Colors.dark.rose[500], letterSpacing: -1 },
    daysLabels: { justifyContent: 'center' },
    daysLabel: { fontSize: 16, fontFamily: Typography.serif, color: Colors.dark.rose[500], marginTop: -4 },
    subLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5 },
    countsSection: { gap: 10 },
    countItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    countNumber: { fontSize: 13, fontFamily: Typography.sansBold, color: 'white' },

    auraCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg },
    auraHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    auraTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    auraTitle: { fontSize: 18, color: 'white', fontFamily: Typography.serif },
    auraUpdateBtn: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    auraUpdateText: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 1 },
    auraGrid: { flexDirection: 'row', gap: 12 },
    auraBlock: { flex: 1, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    auraBlockPartner: { backgroundColor: 'rgba(99, 102, 241, 0.03)', borderColor: 'rgba(99, 102, 241, 0.1)' },
    auraUserRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    auraAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
    auraUserLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
    auraTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    auraEmojiTag: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100 },
    auraEmojiText: { fontSize: 22 }, // Increased from 14 per request
    auraTagText: { fontSize: 10, fontFamily: Typography.sansBold, color: 'white', letterSpacing: 0.5 },
    auraEmptyText: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.15)', letterSpacing: 0.5 },
    auraNote: { fontSize: 11, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.4)', marginTop: 8, lineHeight: 15 },

    alertCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg, backgroundColor: 'rgba(225, 29, 72, 0.05)' },
    alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    alertTitle: { color: Colors.dark.rose[400], fontSize: 14, fontFamily: Typography.sansBold },
    alertText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18 },

    countdownCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg },
    countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 15 },
    countdownInfo: { flex: 1 },
    countdownTitle: { color: 'white', fontSize: 15, fontFamily: Typography.sansBold },
    countdownDays: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },

    locationCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg },
    locationGrid: { flexDirection: 'row', alignItems: 'center' },
    locationHalf: { flex: 1, alignItems: 'center', gap: 2 },
    locationCity: { color: 'white', fontSize: 15, fontFamily: Typography.sansBold },
    locationTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 0.5 },
    locationUser: { fontSize: 7, color: 'rgba(255,255,255,0.2)', letterSpacing: 2, marginTop: 2 },
    distanceContainer: { width: 80, alignItems: 'center', justifyContent: 'center' },
    distanceBadge: { position: 'absolute', zIndex: 10, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
    distanceText: { color: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
    locationDivider: { width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
    inspirationCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24 },
    inspirationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    inspirationTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 2 },
    letterPreviewCard: {
        margin: Spacing.sm,
        padding: 24,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(255,255,255,0.02)',
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
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
    },
    readMoreBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    readMoreText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
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
        minHeight: 150,
    },
    quoteMark: {
        color: Colors.dark.rose[400],
        fontSize: 24,
        fontFamily: Typography.serifBold,
    },
    quoteText: {
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.serifItalic,
        lineHeight: 30,
        textAlign: 'left' // Start from left only
    },

    menstrualCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24 },
    menstrualHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
    menstrualTitle: { color: 'white', fontSize: 18, fontFamily: Typography.serif },
    menstrualSub: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
    menstrualTip: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontFamily: Typography.serifItalic, marginBottom: 24, lineHeight: 22 },
    menstrualProgress: { height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' },
    menstrualFill: { height: '100%', backgroundColor: Colors.dark.rose[400], borderRadius: 2 },

    bucketCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.08)' },
    bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    bucketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    bucketIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(225, 29, 72, 0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.1)' },
    bucketTitle: { color: 'white', fontSize: 18, fontFamily: Typography.serif },
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
});
