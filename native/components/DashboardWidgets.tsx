import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Pressable, Dimensions } from 'react-native';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Image } from 'expo-image';
import { Navigation, Heart, Music, AlertCircle, Calendar, RefreshCcw, Wifi, Globe, MapPin, Zap, PenLine, Image as ImageIcon, Flame, Quote, Moon, Target, Sparkles, Edit2, Lock, Unlock, Camera, ChevronRight, Plus, CalendarHeart, Cake, Minus, Thermometer, Droplets, Wind, Sun, Leaf, Mail, Check, Trophy, Cloud, CloudRain, CloudSnow, CloudDrizzle, CloudLightning } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { GlassCard } from './GlassCard';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing, LinearTransition, FadeInDown } from 'react-native-reanimated';
import { Shimmer } from './Shimmer';
import { useOrbitStore } from '../lib/store';
import { updateLocation } from '../lib/location';
import * as Haptics from 'expo-haptics';
import { getTodayIST, parseSafeDate } from '../lib/utils';
import { getPublicStorageUrl } from '../lib/storage';
import { submitMood, addBucketItem, toggleBucketItem } from '../lib/auth';
import { ProfileAvatar } from './ProfileAvatar';
import { Emoji } from './Emoji';
import Svg, { Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
        // Dual-pulse organic heartbeat (Systole & Diastole)
        scale.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 150, easing: Easing.out(Easing.quad) }),
                withTiming(1.1, { duration: 100, easing: Easing.inOut(Easing.quad) }),
                withTiming(1.25, { duration: 150, easing: Easing.out(Easing.quad) }),
                withTiming(1, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.2, 1) })
            ),
            -1,
            false
        );
    }, []);

    const animatedHeartStyle = useAnimatedStyle(() => {
        const glowIntensity = (scale.value - 1) * 2;
        return {
            transform: [
                { scale: scale.value },
                { rotate: `${(scale.value - 1) * 5}deg` } // Subtle lean
            ],
            shadowOpacity: 0.3 + glowIntensity,
            shadowRadius: 10 + glowIntensity * 15,
            shadowColor: Colors.dark.rose[500],
        };
    });

    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(100)}>
            <GlassCard style={styles.statsCard} intensity={12}>
                <View style={styles.statsRow}>
                    <View style={styles.statMini}>
                        <Heart size={24} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
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
    const { setMoodDrawerOpen, moods, loading, sendHeartbeatOptimistic, idToken } = useOrbitStore();
    const today = getTodayIST();
    const myId = profile?.id;
    const partnerId = partnerProfile?.id;

    const myLatestMood = moods.find(m => m.user_id === myId && m.mood_date === today);
    const partnerLatestMood = moods.find(m => m.user_id === partnerId && m.mood_date === today);

    const myMoodEmoji = myLatestMood ? [myLatestMood.emoji] : (cycleLogs[myId]?.[today]?.symptoms || []);
    const partnerMoodEmoji = partnerLatestMood ? [partnerLatestMood.emoji] : (cycleLogs[partnerId]?.[today]?.symptoms || []);

    const myNote = myLatestMood?.mood_text || cycleLogs[myId]?.[today]?.note || '';
    const partnerNote = partnerLatestMood?.mood_text || cycleLogs[partnerId]?.[today]?.note || '';

    const myAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const myName = profile?.display_name?.split(' ')[0] || 'You';
    const partnerName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    const handleStatusPress = () => {
        // PER USER REQUEST: Dashboard avatars are for Heartbeat/Mood only.
        sendHeartbeatOptimistic();
    };

    if (loading && moods.length === 0) {
        return (
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeader}>
                    <Shimmer width={120} height={24} />
                    <Shimmer width={60} height={24} borderRadius={12} />
                </View>
                <View style={styles.connGrid}>
                    <Shimmer width="48%" height={100} borderRadius={16} />
                    <Shimmer width="48%" height={100} borderRadius={16} />
                </View>
            </GlassCard>
        );
    }

    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(200)}>
            <GlassCard style={styles.connCard} intensity={10}>
                <View style={styles.connHeader}>
                    <View style={styles.connTitleGroup}>
                        <Sparkles size={18} color={Colors.dark.indigo[400]} />
                        <Text style={styles.connTitle}>Connections</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.connUpdateBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setMoodDrawerOpen(true);
                        }}
                    >
                        <Text style={styles.connUpdateText}>Update</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.connGrid}>
                    <View style={[styles.connBlock, styles.connBlockPartner]}>
                        <TouchableOpacity style={styles.connUserRow} onPress={handleStatusPress}>
                            <ProfileAvatar
                                url={partnerAvatarUrl}
                                fallbackText={partnerName}
                                size={24}
                                borderWidth={0}
                            />
                            <Text style={styles.connUserLabel}>{partnerName}</Text>
                        </TouchableOpacity>
                        <View style={styles.connTags}>
                            {partnerMoodEmoji.length > 0 ? (
                                <View style={styles.connEmojiTag}>
                                    <Emoji symbol={MOOD_EMOJIS[partnerMoodEmoji[partnerMoodEmoji.length - 1]] || '✨'} size={22} />
                                    <View style={{ marginLeft: 6, flex: 1 }}>
                                        <Text style={styles.connTagText} numberOfLines={1}>{partnerMoodEmoji[partnerMoodEmoji.length - 1]}</Text>
                                    </View>
                                </View>
                            ) : (
                                <Text style={styles.connEmptyText}>Waiting for {partnerName}...</Text>
                            )}
                        </View>
                        {partnerNote ? <Text style={styles.connNote} numberOfLines={2}>"{partnerNote}"</Text> : null}
                    </View>

                    <View style={styles.connBlock}>
                        <TouchableOpacity style={styles.connUserRow} onPress={handleStatusPress}>
                            <ProfileAvatar
                                url={myAvatarUrl}
                                fallbackText={myName}
                                size={24}
                                borderWidth={0}
                            />
                            <Text style={styles.connUserLabel}>You</Text>
                        </TouchableOpacity>
                        <View style={styles.connTags}>
                            {myMoodEmoji.length > 0 ? (
                                <View style={styles.connEmojiTag}>
                                    <Emoji symbol={MOOD_EMOJIS[myMoodEmoji[myMoodEmoji.length - 1]] || '✨'} size={22} />
                                    <View style={{ marginLeft: 6, flex: 1 }}>
                                        <Text style={styles.connTagText} numberOfLines={1}>{myMoodEmoji[myMoodEmoji.length - 1]}</Text>
                                    </View>
                                </View>
                            ) : (
                                <Text style={styles.connEmptyText}>How are you?</Text>
                            )}
                        </View>
                        {myNote ? <Text style={styles.connNote} numberOfLines={2}>"{myNote}"</Text> : null}
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

export const MusicHeartbeat = React.memo(() => {
    const musicState = useOrbitStore(state => state.musicState);
    if (!musicState?.is_playing || !musicState?.current_track) return null;

    const track = musicState.current_track;

    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(300)} layout={LinearTransition}>
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

export const IntimacyAlert = React.memo(({ profile, partnerProfile, cycleLogs }: any) => {
    const today = getTodayIST();
    const partnerId = partnerProfile?.id;
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;

    if (!partnerLogsToday?.sex_drive) return null;

    const libido = partnerLogsToday.sex_drive.toLowerCase();
    const isVeryHigh = libido === 'very_high';
    const isHigh = libido === 'high';

    if (!isVeryHigh && !isHigh) return null;

    const partnerName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    const alertConfig = isVeryHigh
        ? {
            title: "Celestial Passion",
            description: `${partnerName} is feeling an overwhelming pull towards you.`,
            colors: [Colors.dark.rose[900], Colors.dark.rose[950]],
            iconColor: Colors.dark.rose[400]
        }
        : {
            title: "Quiet Radiance",
            description: `${partnerName} is glowing with affection right now.`,
            colors: [Colors.dark.indigo[900], '#000'],
            iconColor: Colors.dark.indigo[400]
        };

    useEffect(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, []);

    return (
        <TouchableOpacity activeOpacity={0.9} style={styles.passionWrapper}>
            <GlassCard style={[styles.passionCard, { backgroundColor: alertConfig.colors[1] + '40', borderColor: alertConfig.colors[0] + '40' }]} intensity={25}>
                <View style={[styles.passionIconBox, { backgroundColor: alertConfig.colors[0] + '30', borderColor: alertConfig.colors[0] + '50' }]}>
                    <Flame size={20} color={alertConfig.iconColor} fill={alertConfig.iconColor} strokeWidth={1.5} />
                </View>
                <View style={styles.passionTextContent}>
                    <Text style={styles.passionTitle}>{alertConfig.title}</Text>
                    <Text style={styles.passionSub}>{alertConfig.description}</Text>
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
});

export const ImportantDatesCountdown = React.memo(({ milestones, partnerProfile, couple }: any) => {
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
                        title: `${partnerProfile.display_name?.split(' ')[0]}'s Birthday`,
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
                        subtitle: 'Your Couple Date',
                        icon: <Heart size={20} color={Colors.dark.rose[400]} />
                    });
                }
            }
        }

        // 3. Milestones (Upcoming ones)
        if (milestones) {
            Object.values(milestones).forEach((m: any) => {
                const rawDate = m.date || m.milestone_date;
                if (rawDate) {
                    const mDate = parseSafeDate(rawDate);
                    if (mDate) {
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
                    }
                }
            });
        }

        return events.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [milestones, partnerProfile?.birthday, couple?.anniversary_date]);

    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (upcomingEvents.length === 0) return null;

    const event = upcomingEvents[0];
    const diffMs = event.date.getTime() - now.getTime();

    // Fallback if event is today but slightly in past (0,0)
    const normalizedDiff = Math.max(0, diffMs);

    const diffDays = Math.floor(normalizedDiff / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((normalizedDiff / (1000 * 60 * 60)) % 24);
    const diffMins = Math.floor((normalizedDiff / (1000 * 60)) % 60);

    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(400)} layout={LinearTransition}>
            <GlassCard style={styles.countdownCardRedesign} intensity={8}>
                <View style={styles.countdownHeaderRow}>
                    <View style={styles.countdownTitleGroup}>
                        <Calendar size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} />
                        <Text style={styles.countdownHeaderText}>Upcoming Events</Text>
                    </View>
                    <View style={styles.countdownBadge}>
                        <Heart size={12} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
                        <Text style={styles.countdownBadgeText}>{event.type.toUpperCase()}</Text>
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
                        <Text style={styles.inDaysText}>{diffDays === 0 ? 'MEMORABLE' : `In ${diffDays} days`}</Text>
                    </View>
                </View>

                <View style={styles.timerGrid}>
                    <View style={styles.timerCell}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerValue}>{String(diffDays).padStart(2, '0')}</Text>
                            <Text style={styles.timerLabel}>DAYS</Text>
                        </View>
                    </View>
                    <View style={styles.timerCell}>
                        <View style={styles.timerCircle}>
                            <Text style={styles.timerValue}>{String(diffHours).padStart(2, '0')}</Text>
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
                            <Text style={styles.timerValue}>{String(diffMins).padStart(2, '0')}</Text>
                            <Text style={styles.timerLabel}>MIN</Text>
                        </View>
                    </View>
                </View>
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

export const MarqueeText = ({ children, style }: { children: string, style?: any }) => {
    const translateX = useSharedValue(0);
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);

    useEffect(() => {
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
    }, [textWidth, containerWidth]); // Removed children: we only reset if physical dimensions change

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
                width: textWidth > containerWidth ? 5000 : '100%',
                justifyContent: (isRightAligned && textWidth <= containerWidth) ? 'flex-end' : 'flex-start'
            }}>
                <Animated.Text
                    style={[style, animatedStyle, { paddingRight: textWidth > (containerWidth + 2) ? 120 : 0 }]}
                    numberOfLines={1}
                >
                    {children}
                </Animated.Text>
                {textWidth > (containerWidth + 2) && (
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

export const LocationWidget = React.memo(({ profile, partnerProfile, couple }: any) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        updateLocation().catch(console.error);
        return () => clearInterval(timer);
    }, []);

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
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(500)}>
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
                        <MarqueeText style={styles.locFullAddress}>
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
                        <MarqueeText style={[styles.locFullAddress, { textAlign: 'right' }]}>
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

export const DailyInspirationWidget = React.memo(() => {
    const [activeTab, setActiveTab] = React.useState<'quote' | 'challenge' | 'tip'>('quote');
    const [notifEnabled, setNotifEnabled] = React.useState(false);

    const content = useMemo(() => {
        switch (activeTab) {
            case 'challenge':
                return {
                    title: "GENTLE CHALLENGE",
                    text: "Write a small note of appreciation and leave it somewhere they'll find it today.",
                    icon: <Target size={18} color={Colors.dark.rose[400]} />
                };
            case 'tip':
                return {
                    title: "RELATIONSHIP TIP",
                    text: "Practicing active listening means hearing the emotions behind the words, not just the words themselves.",
                    icon: <Sparkles size={18} color={Colors.dark.emerald[400]} />
                };
            default:
                return {
                    title: "DAILY QUOTE",
                    text: "Love is not a destination we reach, but the quiet rhythm of our shadows walking in perfect sync.",
                    icon: <Quote size={18} color={Colors.dark.rose[400]} />
                };
        }
    }, [activeTab]);

    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(600)}>
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
    return (
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(700)}>
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
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(800)}>
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
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(900)}>
            <GlassCard style={styles.letterPreviewCard} intensity={8}>
                <View style={styles.letterPreviewHeader}>
                    <View style={styles.letterIconBox}>
                        <Mail size={18} color={Colors.dark.rose[400]} strokeWidth={1.5} />
                    </View>
                    <View>
                        <Text style={styles.letterLabel}>A SACRED NOTE</Text>
                        <Text style={[styles.letterPreviewTitle, { fontFamily: Typography.script, fontSize: 34, marginTop: -8, color: Colors.dark.rose[400] }]}>
                            {partnerProfile?.display_name || 'Partner'}
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
        <Animated.View entering={FadeInDown.springify().damping(18).stiffness(120).mass(0.8).delay(600)}>
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
    statsCard: { margin: Spacing.sm, borderRadius: Radius.xxl, padding: 24, backgroundColor: 'rgba(255,255,255,0.02)' },
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

    connCard: {
        margin: Spacing.sm,
        borderRadius: Radius.xxl,
        padding: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    connHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
    connTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    connTitle: {
        fontSize: 22,
        color: 'white',
        fontFamily: Typography.serifBold,
        letterSpacing: -0.5,
    },
    connUpdateBtn: { backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    connUpdateText: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: Typography.sansBold, letterSpacing: 2 },
    connGrid: { flexDirection: 'row', gap: 32 },
    connBlock: { flex: 1, backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: Radius.xl, padding: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    connBlockPartner: { backgroundColor: 'rgba(129, 140, 248, 0.02)', borderColor: 'rgba(129, 140, 248, 0.08)' },
    connUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    connAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
    connUserLabel: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.25)', letterSpacing: 2, textTransform: 'uppercase' },
    connTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    connEmojiTag: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.02)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 100, maxWidth: '100%' },
    connEmojiText: { fontSize: 26 },
    connTagText: { fontSize: 13, fontFamily: Typography.serifBold, color: 'white', textTransform: 'capitalize' },
    connEmptyText: { fontSize: 10, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5 },
    connNote: { fontSize: 15, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.45)', marginTop: 16, lineHeight: 22, fontStyle: 'italic' },

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
    },
    timerCell: {
        flex: 1,
    },
    timerCircle: {
        aspectRatio: 1.2,
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

    passionWrapper: {
        margin: Spacing.sm,
    },
    passionCard: {
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Radius.xl,
        borderWidth: 1,
    },
    passionIconBox: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    passionTextContent: {
        flex: 1,
        marginLeft: 16,
    },
    passionTitle: {
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.serif,
    },
    passionSub: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
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
        backgroundColor: 'transparent',
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
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
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
        fontSize: 14,
        fontFamily: Typography.serifBold,
        color: 'white',
        letterSpacing: 0.2,
        height: 20,
    },
    locFullAddress: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.5,
        height: 16,
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
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
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
    inspirationCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24 },
    inspirationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    inspirationTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
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
        minHeight: 110,
    },
    quoteMark: {
        color: Colors.dark.rose[400],
        fontSize: 24,
        fontFamily: Typography.serifBold,
    },
    inspirationCardText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 18,
        fontFamily: Typography.serif,
        lineHeight: 28,
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
        backgroundColor: 'rgba(0,0,0,0.35)',
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
    },
    otdCountBadge: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    otdCountText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
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
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
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
});
