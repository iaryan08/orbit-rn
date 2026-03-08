import React, { useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Heart, Thermometer } from 'lucide-react-native';
import { Colors, Spacing, Typography } from '../constants/Theme';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import { ProfileAvatar } from './ProfileAvatar';
import { getPartnerName } from '../lib/utils';
import { rtdb } from '../lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Emoji } from '../components/Emoji';

interface PartnerHeaderProps {
    profile: any;
    partnerProfile: any;
    coupleId: string;
}

export function PartnerHeader({ profile, partnerProfile, coupleId }: PartnerHeaderProps) {
    const { idToken, setTabIndex } = useOrbitStore();
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const onlinePulse = useRef(new Animated.Value(0)).current;
    const [isPartnerActive, setIsPartnerActive] = useState(false);

    const partnerName = getPartnerName(profile, partnerProfile);
    const userName = profile?.display_name || 'You';

    // RTDB instantaneous presence instead of last_seen Firestore polling
    useEffect(() => {
        if (!coupleId || !partnerProfile?.id) return;

        const partnerRef = ref(rtdb, `presence/${coupleId}/${partnerProfile.id}`);
        const unsub = onValue(partnerRef, (snapshot) => {
            const data = snapshot.val();
            // User is online if they are exploring the app or actively in cinema
            setIsPartnerActive(!!data?.is_online || !!data?.in_cinema);
        });

        return unsub;
    }, [coupleId, partnerProfile?.id]);

    // Remove onlinePulse animation as we are simplifying to solid border/dot
    useEffect(() => {
        onlinePulse.setValue(0);
    }, [isPartnerActive]);

    const userAvatarUrl = useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.avatar_url, idToken]);

    const partnerAvatarUrl = useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

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

    const handleLongPress = () => {
        if (!coupleId || !profile?.id) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        // Broadcast heartbeat to RTDB (Global Heartbeat)
        const broadcastRef = ref(rtdb, `broadcasts/${coupleId}/${profile.id}`);
        set(broadcastRef, {
            event: 'cinema_event',
            timestamp: Date.now(),
            payload: {
                event: 'reaction',
                type: 'heartbeat',
                senderId: profile.id,
                senderName: profile.display_name
            }
        });
    };

    return (
        <View style={styles.headerContainer}>
            <View style={styles.avatarsContainer}>
                {/* User Avatar (Left, Back) */}
                <TouchableOpacity
                    style={[styles.avatarWrapper, styles.userAvatarShift]}
                    onPress={() => setTabIndex(4)}
                >
                    <ProfileAvatar
                        url={userAvatarUrl}
                        fallbackText={userName[0]}
                        size={64}
                    />
                </TouchableOpacity>

                {/* Partner Avatar (Right, Front Overlap) */}
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onLongPress={handleLongPress}
                    delayLongPress={400}
                    style={[
                        styles.avatarWrapper,
                        styles.partnerAvatarShift,
                        isPartnerActive && { borderColor: '#10b981' }
                    ]}
                >
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <ProfileAvatar
                            url={partnerAvatarUrl}
                            fallbackText={partnerName[0] || 'P'}
                            size={64}
                        >
                            {isPartnerActive && <View style={styles.onlineBadge} />}
                        </ProfileAvatar>
                    </Animated.View>
                </TouchableOpacity>
            </View>

            <View style={styles.infoContainer}>
                <Text style={styles.connectedText}>
                    Connected with <Text style={styles.partnerNameText}>{partnerName}</Text>
                </Text>
                <View style={styles.statusRow}>
                    <Text style={styles.statusName}>{partnerName.toUpperCase()}</Text>
                    <View style={[styles.statusDot, isPartnerActive && { backgroundColor: '#10b981' }]} />
                    <Thermometer size={12} color={Colors.dark.amber[400]} />
                    <Text style={styles.statusTemp}>27°C</Text>
                    {isPartnerActive && (
                        <>
                            <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                            <Text style={styles.activeStatusText}>ACTIVE NOW</Text>
                        </>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    headerContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
    },
    avatarsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    avatarWrapper: {
        borderWidth: 2,
        borderColor: '#000',
        borderRadius: 40,
        backgroundColor: '#000',
    },
    userAvatarShift: {
        zIndex: 1,
    },
    partnerAvatarShift: {
        marginLeft: -24, // Negative margin to pull it over the user from the right
        zIndex: 2,
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10b981',
        borderWidth: 2,
        borderColor: '#000',
    },
    activeGlow: {
        position: 'absolute',
        top: -4,
        left: -4,
        right: -4,
        bottom: -4,
        borderRadius: 40,
        backgroundColor: '#10b981',
        zIndex: -1,
    },
    infoContainer: {
        alignItems: 'center',
    },
    connectedText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontFamily: Typography.serifItalic,
        marginBottom: 4,
    },
    partnerNameText: {
        fontFamily: Typography.serif,
        color: 'white',
        fontSize: 22,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusName: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    statusDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    statusTemp: {
        color: 'white',
        fontSize: 11,
        fontFamily: Typography.sansBold,
    },
    activeStatusText: {
        color: '#10b981',
        fontSize: 8,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
});

