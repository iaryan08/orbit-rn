import React, { useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Thermometer, Sun, Cloud, Moon, CloudRain, Zap, Wind } from 'lucide-react-native';
import { Colors, Typography } from '../constants/Theme';
import { GlobalHitSlops } from '../constants/Styles';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { ProfileAvatar } from './ProfileAvatar';
import { rtdb } from '../lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { MarqueeText } from './DashboardWidgets';
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
    const [isPartnerActive, setIsPartnerActive] = useState(false);
    const [serverOffset, setServerOffset] = useState(0);

    // RTDB instantaneous presence
    useEffect(() => {
        if (!isActive) return;
        const offsetRef = ref(rtdb, '.info/serverTimeOffset');
        const unsubOffset = onValue(offsetRef, (snap) => {
            setServerOffset(snap.val() || 0);
        });

        if (!coupleId || !partnerProfile?.id) return unsubOffset;

        const partnerRef = ref(rtdb, `presence/${coupleId}/${partnerProfile.id}`);
        let lastData: any = null;

        const validate = () => {
            if (!lastData) {
                setIsPartnerActive(false);
                return;
            }
            const now = Date.now() + serverOffset;
            const lastChanged = lastData.last_changed || 0;
            const diff = Math.abs(now - lastChanged);
            const isFresh = diff < 300_000;
            setIsPartnerActive(isFresh && (!!lastData.is_online || !!lastData.in_cinema));
        };

        const unsub = onValue(partnerRef, (snapshot) => {
            lastData = snapshot.val();
            validate();
        });

        const validator = setInterval(validate, 30000);

        return () => {
            unsubOffset();
            unsub();
            clearInterval(validator);
        };
    }, [coupleId, partnerProfile?.id, serverOffset, isActive]);

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
        sendHeartbeatOptimistic();
    };

    const partnerCity = partnerProfile?.location?.city || partnerProfile?.location_city || 'Somewhere...';
    const partnerDetailedLoc = partnerProfile?.location?.subtext || partnerProfile?.location?.location_name || '';

    const getWeatherIcon = (temp: number, condition?: string) => {
        const c = (condition || '').toLowerCase();
        if (c.includes('rain')) return <CloudRain size={12} color={Colors.dark.indigo[400]} />;
        if (c.includes('storm')) return <Zap size={12} color={Colors.dark.amber[400]} />;
        if (c.includes('cloud')) return <Cloud size={12} color="rgba(255,255,255,0.4)" />;

        // Time based check for sun/moon if no clouds
        const hour = new Date().getHours() + (serverOffset / (1000 * 60 * 60));
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
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPressIn={handlePressIn}
                            onPressOut={handlePressOut}
                            onPress={handleHeartbeat}
                            hitSlop={GlobalHitSlops.md}
                        >
                            <ProfileAvatar
                                url={partnerAvatarUrl}
                                fallbackText={resolvedPartnerName}
                                size={80}
                                borderWidth={2}
                                borderColor={isPartnerActive ? Colors.dark.rose[500] : 'rgba(255,255,255,0.08)'}
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
                        <MarqueeText style={styles.partnerName} isActive={isActive}>
                            {resolvedPartnerName}
                        </MarqueeText>
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
        shadowColor: Colors.dark.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
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
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontFamily: Typography.serifItalic,
        letterSpacing: 1.2,
    },
    partnerName: {
        color: 'white',
        fontFamily: Typography.script,
        fontSize: 34,
        letterSpacing: -0.5,
        marginTop: -10,
    },
    locationCityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    locationCityText: {
        color: 'rgba(255,255,255,1)',
        fontSize: 11,
        fontFamily: Typography.serif,
        letterSpacing: 0.5,
    },
    dividerDot: {
        width: 3,
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    tempText: {
        color: 'rgba(255,255,255,1)',
        fontSize: 11,
        fontFamily: Typography.sansBold,
    },
    weatherGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
});
