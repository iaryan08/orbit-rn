import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { Heart, Sparkles, Mail } from 'lucide-react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSpring,
    withDelay,
    withRepeat,
    withSequence,
    Easing,
    FadeIn,
    FadeOut,
    ZoomIn,
    ZoomOut,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { useOrbitStore } from '../lib/store';
import { rtdb } from '../lib/firebase';
import { ref, onValue, off } from 'firebase/database';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography } from '../constants/Theme';
import { getPartnerName } from '../lib/utils';

// ─── Static animation constants (prevent "Expected static flag" crash) ────────
const USE_LAYOUT_ANIM = Platform.OS !== 'android';
const ANIM_FADE_IN = USE_LAYOUT_ANIM ? FadeIn.duration(400) : undefined;
const ANIM_FADE_OUT = USE_LAYOUT_ANIM ? FadeOut.duration(400) : undefined;
const ANIM_ZOOM_IN = USE_LAYOUT_ANIM ? ZoomIn.duration(500).springify() : undefined;
const ANIM_ZOOM_IN_SIMPLE = USE_LAYOUT_ANIM ? ZoomIn.springify() : undefined;
const ANIM_ZOOM_OUT = USE_LAYOUT_ANIM ? ZoomOut.duration(400) : undefined;

const { width, height } = Dimensions.get('window');

const FloatingHeart = ({ delay = 0, x = 0 }: { delay?: number; x?: number }) => {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(20);
    const scale = useSharedValue(0.5);

    useEffect(() => {
        opacity.value = withDelay(delay, withSequence(
            withTiming(1, { duration: 400 }),
            withDelay(800, withTiming(0, { duration: 800 }))
        ));
        translateY.value = withDelay(delay, withTiming(-250, { duration: 2500, easing: Easing.out(Easing.quad) }));
        scale.value = withDelay(delay, withSequence(
            withSpring(1.5),
            withTiming(0.8, { duration: 1500 })
        ));
    }, []);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: x },
            { translateY: translateY.value },
            { scale: scale.value }
        ],
        position: 'absolute'
    }));

    return (
        <Animated.View style={style}>
            <Heart size={28} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400] + '88'} />
        </Animated.View>
    );
};

const SparkleItem = ({ delay = 0, x = 0, y = 0 }: { delay?: number; x?: number; y?: number }) => {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0);

    useEffect(() => {
        opacity.value = withDelay(delay, withSequence(
            withTiming(1, { duration: 300 }),
            withTiming(0, { duration: 600 })
        ));
        scale.value = withDelay(delay, withSequence(
            withSpring(1.2),
            withTiming(0, { duration: 800 })
        ));
    }, []);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateX: x },
            { translateY: y },
            { scale: scale.value }
        ],
        position: 'absolute'
    }));

    return (
        <Animated.View style={style}>
            <Sparkles size={16} color={Colors.dark.amber[400]} fill={Colors.dark.amber[400]} />
        </Animated.View>
    );
};

export function ConnectionSync() {
    const couple = useOrbitStore(s => s.couple);
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const activeTabIndex = useOrbitStore(s => s.activeTabIndex);
    const resolvedPartnerName = getPartnerName(profile, partnerProfile);
    const [interactionType, setInteractionType] = useState<'heartbeat' | 'spark' | 'connection' | 'letter' | null>(null);
    const wasOnlineRef = useRef(false);
    const lastSeenLetterIdRef = useRef<string | null>(null);
    const hasLoadedLastSeenLetterRef = useRef(false);
    const interactionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
    const latestPartnerLetter = useOrbitStore(
        useCallback(
            (state) => state.letters.find((letter) => letter.sender_id === partnerProfile?.id) ? null : state.letters.filter((letter) => letter.sender_id === partnerProfile?.id).sort((a, b) => b.created_at - a.created_at)[0] || null,
            [partnerProfile?.id]
        )
    );
    const isHeavyScreenActive = activeTabIndex === 0;
    const isEnabled = !isHeavyScreenActive;

    // Heartbeat listener
    useEffect(() => {
        if (!isEnabled || !couple?.id || !profile?.id) return;

        const vibeRef = ref(rtdb, `vibrations/${couple.id}`);
        let isFirstLoad = true;

        const unsub = onValue(vibeRef, (snap) => {
            const val = snap.val();
            if (isFirstLoad) {
                isFirstLoad = false;
                return;
            }

            if (val && val.senderId && val.senderId !== profile.id) {
                // Conceptually distinct type handling
                const type = val.type === 'spark' ? 'spark' : 'heartbeat';
                triggerInteraction(type);
            }
        });

        return unsub;
    }, [couple?.id, isEnabled, profile?.id]);

    // Presence listener for "Connected" flash
    useEffect(() => {
        if (!isEnabled || !couple?.id || !profile?.id) return;

        const partnerPresenceRef = ref(rtdb, `presence/${couple.id}`);
        const unsub = onValue(partnerPresenceRef, (snap) => {
            const allPresence = snap.val() || {};
            const partnerEntry = Object.entries(allPresence).find(([userId]) => userId !== profile.id);
            const data = partnerEntry?.[1] as any;
            const now = Date.now();
            const isMarkedOnline = !!data?.is_online || !!data?.in_cinema;
            const lastChanged = typeof data?.last_changed === 'number'
                ? data.last_changed
                : (isMarkedOnline ? now : 0);
            // Best-in-Class: 5 minute buffer for background sync stability
            const isOnline = isMarkedOnline && (now - lastChanged) < 300000;

            if (isOnline && !wasOnlineRef.current) {
                // Partner just came online!
                triggerInteraction('connection');
            }
            wasOnlineRef.current = isOnline;
        });

        return unsub;
    }, [couple?.id, isEnabled, profile?.id]);

    useEffect(() => {
        hasLoadedLastSeenLetterRef.current = false;
        lastSeenLetterIdRef.current = null;

        if (!partnerProfile?.id) return;

        let isMounted = true;
        AsyncStorage.getItem(`last_seen_letter_${partnerProfile.id}`)
            .then((value) => {
                if (!isMounted) return;
                lastSeenLetterIdRef.current = value;
                hasLoadedLastSeenLetterRef.current = true;
            })
            .catch(() => {
                if (!isMounted) return;
                hasLoadedLastSeenLetterRef.current = true;
            });

        return () => {
            isMounted = false;
        };
    }, [partnerProfile?.id]);

    // Letter Listener: Trigger when partner sends a letter (Store-driven)
    useEffect(() => {
        if (!isEnabled || !partnerProfile?.id || !latestPartnerLetter || !hasLoadedLastSeenLetterRef.current) return;

        const letterId = latestPartnerLetter.id;

        const lastSeenId = lastSeenLetterIdRef.current;
        if (!lastSeenId) {
            lastSeenLetterIdRef.current = letterId;
            AsyncStorage.setItem(`last_seen_letter_${partnerProfile.id}`, letterId).catch(() => { });
            return;
        }

        if (letterId !== lastSeenId) {
            lastSeenLetterIdRef.current = letterId;
            AsyncStorage.setItem(`last_seen_letter_${partnerProfile.id}`, letterId).catch(() => { });

            // Within 1 hour to avoid notifying on very old synced data
            if (latestPartnerLetter.created_at && (Date.now() - latestPartnerLetter.created_at) < 3600000) {
                triggerInteraction('letter');
            }
        }
    }, [isEnabled, latestPartnerLetter, partnerProfile?.id]);

    const triggerInteraction = (type: 'heartbeat' | 'spark' | 'connection' | 'letter') => {
        if (type === 'heartbeat') {
            // "lub-dub-LUB" Triple-Beat Intense Haptics
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            heartbeatTimerRefs.current.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100));
            heartbeatTimerRefs.current.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300));
        } else if (type === 'spark' || type === 'letter') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        setInteractionType(type);
        if (interactionResetTimerRef.current) clearTimeout(interactionResetTimerRef.current);
        interactionResetTimerRef.current = setTimeout(() => setInteractionType(null), 3500);
    };

    const pulseVal = useSharedValue(0.4);
    useEffect(() => {
        if (interactionType) {
            pulseVal.value = withRepeat(
                withSequence(
                    withTiming(0.7, { duration: 400 }),
                    withTiming(0.4, { duration: 600 })
                ),
                2,
                true
            );
        }
    }, [interactionType]);

    const overlayStyle = useAnimatedStyle(() => ({
        backgroundColor: 'rgba(0,0,0,0.35)', // Slightly dim the dash for focus
        opacity: withTiming(interactionType ? 1 : 0, { duration: 400 }),
    }));

    useEffect(() => {
        return () => {
            if (interactionResetTimerRef.current) clearTimeout(interactionResetTimerRef.current);
            heartbeatTimerRefs.current.forEach((timer) => clearTimeout(timer));
            heartbeatTimerRefs.current = [];
        };
    }, []);

    if (!interactionType || isHeavyScreenActive) return null;

    return (
        <Animated.View
            entering={ANIM_FADE_IN}
            exiting={ANIM_FADE_OUT}
            style={[styles.overlay, overlayStyle]}
            pointerEvents="none"
        >

            <View style={styles.centerContainer}>
                <Animated.View
                    entering={ANIM_ZOOM_IN}
                    exiting={ANIM_ZOOM_OUT}
                    style={styles.elementsContainer}
                >
                    {interactionType === 'heartbeat' && (
                        <View style={StyleSheet.absoluteFill}>
                            <FloatingHeart delay={0} x={-80} />
                            <FloatingHeart delay={200} x={60} />
                            <FloatingHeart delay={400} x={-20} />
                            <FloatingHeart delay={600} x={100} />
                            <FloatingHeart delay={800} x={20} />
                        </View>
                    )}

                    {interactionType === 'spark' && (
                        <View style={StyleSheet.absoluteFill}>
                            <SparkleItem delay={0} x={-40} y={-40} />
                            <SparkleItem delay={100} x={50} y={-20} />
                            <SparkleItem delay={200} x={-10} y={60} />
                            <SparkleItem delay={300} x={70} y={30} />
                            <SparkleItem delay={400} x={0} y={-80} />
                        </View>
                    )}

                    <Animated.View
                        entering={ANIM_ZOOM_IN_SIMPLE}
                        style={[
                            styles.iconCircle,
                            interactionType === 'spark' && { borderColor: Colors.dark.amber[400], backgroundColor: Colors.dark.amber[900] + '33' },
                            interactionType === 'letter' && { borderColor: Colors.dark.rose[400], backgroundColor: Colors.dark.rose[900] + '33' },
                            interactionType === 'heartbeat' && { borderColor: Colors.dark.rose[400], backgroundColor: Colors.dark.rose[900] + '33' }
                        ]}
                    >
                        {interactionType === 'heartbeat' && <Heart size={36} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />}
                        {interactionType === 'spark' && <Sparkles size={36} color={Colors.dark.amber[400]} fill={Colors.dark.amber[400]} />}
                        {interactionType === 'connection' && <Heart size={36} color={Colors.dark.rose[400]} />}
                        {interactionType === 'letter' && <Mail size={36} color={Colors.dark.rose[400]} />}
                    </Animated.View>

                    <View style={styles.textContainer}>
                        <Text style={styles.title}>
                            {interactionType === 'connection'
                                ? `${resolvedPartnerName} Joined`
                                : interactionType === 'spark'
                                    ? 'A Spark for You'
                                    : interactionType === 'letter'
                                        ? 'New Letter'
                                        : 'Thinking of You'
                            }
                        </Text>
                        <View style={[
                            styles.bar,
                            interactionType === 'spark' ? { backgroundColor: Colors.dark.amber[400] } :
                                interactionType === 'letter' ? { backgroundColor: Colors.dark.rose[400] } :
                                    { backgroundColor: Colors.dark.rose[400] }
                        ]} />
                    </View>
                </Animated.View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 99999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        width: width,
        height: height,
    },
    glowContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    glow: {
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: Colors.dark.rose[500] + '33', // 20% opacity
        // Note: Expo Blur is better but for a flash a simple colored view works too
    },
    elementsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconCircle: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    textContainer: {
        alignItems: 'center',
    },
    title: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        letterSpacing: 4,
        color: 'white',
        textTransform: 'uppercase',
        opacity: 0.8,
    },
    bar: {
        width: 30,
        height: 2,
        backgroundColor: Colors.dark.rose[400] + '66',
        marginTop: 10,
        borderRadius: 1,
    }
});
