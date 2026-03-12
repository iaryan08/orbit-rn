import React, { useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Thermometer, Sun, Cloud, Moon, CloudRain, Zap, Wind } from 'lucide-react-native';
import { Colors, Typography } from '../constants/Theme';
import { GlobalHitSlops } from '../constants/Styles';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { ProfileAvatar } from './ProfileAvatar';
import { rtdb } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { getPartnerName } from '../lib/utils';

interface PartnerHeaderProps {
    profile: any;
    partnerProfile: any;
    coupleId: string;
    isActive?: boolean;
}

export function PartnerHeader({ profile, partnerProfile, coupleId, isActive = true }: PartnerHeaderProps) {
    const { sendHeartbeatOptimistic, idToken } = useOrbitStore();
    const resolvedPartnerName = getPartnerName(profile, partnerProfile);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const heartbeatFlashAnim = useRef(new Animated.Value(0)).current;
    const [isPartnerActive, setIsPartnerActive] = useState(false);
    // Dashboard header should stay idle when the screen is idle.
    useEffect(() => {
        if (!isActive || !coupleId || !profile?.id) return;

        const presenceRef = ref(rtdb, `presence/${coupleId}`);
        const unsub = onValue(presenceRef, (snapshot) => {
            const allPresence = snapshot.val() || {};
            const partnerEntry = Object.entries(allPresence).find(([userId]) => userId !== profile.id);
            const data = partnerEntry?.[1] as any;
            const isOnline = !!data?.is_online || !!data?.in_cinema;
            const lastChanged = typeof data?.last_changed === 'number'
                ? data.last_changed
                : (isOnline ? Date.now() : 0);
            const isFresh = Date.now() - lastChanged < 300_000;
            setIsPartnerActive(isOnline && isFresh);
        });

        return () => {
            unsub();
        };
    }, [coupleId, isActive, profile?.id]);

    const userAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() => {
        if (!partnerProfile?.avatar_url) return null;
        return getPublicStorageUrl(partnerProfile.avatar_url, 'avatars', idToken);
    }, [partnerProfile?.avatar_url, partnerProfile?.id, idToken]);

    const handlePressIn = () => {
        Animated.spring(pulseAnim, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(pulseAnim, {
            toValue: 1,
            friction: 3,
            tension: 40,
            useNativeDriver: true,
        }).start();
    };

    const handleHeartbeat = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        heartbeatFlashAnim.setValue(0);
        Animated.sequence([
            Animated.timing(heartbeatFlashAnim, {
                toValue: 1,
                duration: 120,
                useNativeDriver: true,
            }),
            Animated.timing(heartbeatFlashAnim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start();
        sendHeartbeatOptimistic();
    };

    const partnerCity = partnerProfile?.location?.city || partnerProfile?.location_city || 'Somewhere...';
    const getWeatherIcon = (temp: number, condition?: string) => {
        const c = (condition || '').toLowerCase();
        if (c.includes('rain')) return <CloudRain size={12} color={Colors.dark.indigo[400]} />;
        if (c.includes('storm')) return <Zap size={12} color={Colors.dark.amber[400]} />;
        if (c.includes('cloud')) return <Cloud size={12} color="rgba(255,255,255,0.4)" />;

        // Time based check for sun/moon if no clouds
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour > 18;

        if (isNight) return <Moon size={12} color={Colors.dark.indigo[400]} />;
        return <Sun size={12} color={Colors.dark.amber[400]} />;
    };

    return (
        <View style={styles.container}>
            <View style={styles.avatarRow}>
                <View style={styles.avatarMainWrapper}>
                    {/* User Avatar - Static */}
                    <View style={styles.userAvatarContainer}>
                        <ProfileAvatar
                            url={userAvatarUrl}
                            fallbackText={profile?.display_name || 'Y'}
                            size={80}
                            borderWidth={2}
                            borderColor="rgba(255,255,255,0.08)"
                        />
                    </View>

                    {/* Partner Avatar - Clickable Trigger */}
                    <Animated.View style={[styles.partnerAvatarContainer, { transform: [{ scale: pulseAnim }] }]}>
                        <Animated.View
                            pointerEvents="none"
                            style={[
                                styles.heartbeatFlash,
                                {
                                    opacity: heartbeatFlashAnim,
                                    transform: [{
                                        scale: heartbeatFlashAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0.92, 1.06],
                                        })
                                    }]
                                }
                            ]}
                        />
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPressIn={handlePressIn}
                            onPressOut={handlePressOut}
                            onLongPress={handleHeartbeat}
                            delayLongPress={220}
                            hitSlop={GlobalHitSlops.md}
                        >
                            <ProfileAvatar
                                url={partnerAvatarUrl}
                                fallbackText={resolvedPartnerName}
                                size={80}
                                borderWidth={2}
                                borderColor={isPartnerActive ? 'rgba(16, 185, 129, 0.88)' : 'rgba(255,255,255,0.08)'}
                            />
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </View>

            {/* Name & Location below Avatars */}
            {/* Name & Location below Avatars */}
            <View style={[styles.contentRow, { width: '100%', marginTop: 16 }]}>
                <View style={styles.nameHeaderGroup}>
                    <Text style={styles.connectedText}>Connected With • </Text>
                    <View style={{ flex: 1, minHeight: 28, justifyContent: 'center' }}>
                        <Text style={styles.partnerName} numberOfLines={1} ellipsizeMode="tail">
                            {resolvedPartnerName}
                        </Text>
                    </View>
                </View>

                <View style={[styles.locationCityRow, { marginTop: 4 }]}>
                    <View style={{ flexShrink: 1, minHeight: 16, justifyContent: 'center', marginRight: 8 }}>
                        <Text style={styles.locationCityText} numberOfLines={1}>
                            {partnerCity}
                        </Text>
                    </View>
                    <View style={styles.dividerDot} />
                    <View style={styles.weatherGroup}>
                        {getWeatherIcon(partnerProfile?.location?.temp || 27, partnerProfile?.location?.condition)}
                        <Text style={styles.tempText}>{Math.round(partnerProfile?.location?.temp || 27)}°C</Text>
                    </View>
                </View>

                {isPartnerActive && (
                    <View style={styles.activePill}>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeText}>Active Now</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'flex-start',
        paddingVertical: 10,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarMainWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    userAvatarContainer: {
        zIndex: 0,
    },
    partnerAvatarContainer: {
        zIndex: 10, // Bring decisively to front
        marginLeft: -25,
        position: 'relative',
    },
    heartbeatFlash: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 48,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.55)',
        backgroundColor: 'rgba(244, 63, 94, 0.08)',
    },
    partnerAvatarOverlap: {
        // Style applied to the avatar itself
    },
    activePill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 100,
        marginTop: 10,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    activeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.dark.emerald[400],
        marginRight: 8,
    },
    activeText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 9,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    contentRow: {
        flex: 1,
        justifyContent: 'center',
    },
    nameHeaderGroup: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    connectedText: {
        color: 'rgba(255,255,255,0.92)',
        fontSize: 14,
        fontFamily: Typography.serifItalic,
        letterSpacing: 0.8,
    },
    partnerName: {
        color: 'white',
        fontFamily: Typography.script,
        fontSize: 40,
        lineHeight: 46,
        letterSpacing: -0.4,
        marginTop: -12,
        includeFontPadding: false,
    },
    locationCityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    locationCityText: {
        color: 'rgba(255,255,255,0.96)',
        fontSize: 15,
        fontFamily: Typography.serif,
        letterSpacing: 0.2,
    },
    dividerDot: {
        width: 3,
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    tempText: {
        color: 'rgba(255,255,255,0.96)',
        fontSize: 15,
        fontFamily: Typography.sansBold,
    },
    weatherGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});
