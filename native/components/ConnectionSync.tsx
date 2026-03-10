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
    runOnJS,
    Easing,
    FadeIn,
    FadeOut,
    ZoomIn,
    ZoomOut,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { useOrbitStore } from '../lib/store';
import { rtdb, db } from '../lib/firebase';
import { ref, onValue, off, serverTimestamp } from 'firebase/database';
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp, doc, getDoc } from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography } from '../constants/Theme';
import { BlurView } from 'expo-blur';

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
    const { couple, profile, partnerProfile } = useOrbitStore();
    const [interactionType, setInteractionType] = useState<'heartbeat' | 'spark' | 'connection' | 'letter' | null>(null);
    const wasOnlineRef = useRef(false);
    const lastSessionIdRef = useRef<string | null>(null);

    // Heartbeat listener
    useEffect(() => {
        if (!couple?.id || !profile?.id) return;

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
                runOnJS(triggerInteraction)(type);
            }
        });

        return () => off(vibeRef, 'value', unsub);
    }, [couple?.id, profile?.id]);

    // Presence listener for "Connected" flash
    useEffect(() => {
        if (!couple?.id || !partnerProfile?.id) return;

        const partnerPresenceRef = ref(rtdb, `presence/${couple.id}/${partnerProfile.id}`);
        const unsub = onValue(partnerPresenceRef, (snap) => {
            const data = snap.val();
            const now = Date.now();
            const lastChanged = data?.last_changed || 0;
            // Best-in-Class: 5 minute buffer for background sync stability
            const isOnline = (data?.is_online || data?.in_cinema) && (now - lastChanged) < 300000;

            if (isOnline && !wasOnlineRef.current) {
                // Partner just came online!
                runOnJS(triggerInteraction)('connection');
            }
            wasOnlineRef.current = isOnline;
        });

        return () => off(partnerPresenceRef, 'value', unsub);
    }, [couple?.id, partnerProfile?.id]);

    const letters = useOrbitStore(state => state.letters);

    // Letter Listener: Trigger when partner sends a letter (Store-driven)
    useEffect(() => {
        if (!partnerProfile?.id || !letters.length) return;

        const partnerLetters = letters.filter(l => l.sender_id === partnerProfile.id);
        if (partnerLetters.length === 0) return;

        const latestLetter = partnerLetters[0]; // Already sorted by created_at desc in store
        const letterId = latestLetter.id;

        const checkLatest = async () => {
            const lastSeenId = await AsyncStorage.getItem(`last_seen_letter_${partnerProfile.id}`);

            if (!lastSeenId) {
                // Initialize on first ever load
                await AsyncStorage.setItem(`last_seen_letter_${partnerProfile.id}`, letterId);
                return;
            }

            if (letterId !== lastSeenId) {
                await AsyncStorage.setItem(`last_seen_letter_${partnerProfile.id}`, letterId);

                // Within 1 hour to avoid notifying on very old synced data
                if (latestLetter.created_at && (Date.now() - latestLetter.created_at) < 3600000) {
                    runOnJS(triggerInteraction)('letter');
                }
            }
        };

        checkLatest();
    }, [letters, partnerProfile?.id]);

    const triggerInteraction = (type: 'heartbeat' | 'spark' | 'connection' | 'letter') => {
        if (type === 'heartbeat') {
            // "lub-dub-LUB" Triple-Beat Intense Haptics
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 100);
            setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
        } else if (type === 'spark' || type === 'letter') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        setInteractionType(type);
        setTimeout(() => setInteractionType(null), 3500);
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

    if (!interactionType) return null;

    return (
        <Animated.View
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(400)}
            style={[styles.overlay, overlayStyle]}
            pointerEvents="none"
        >
            <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={styles.centerContainer}>
                <Animated.View
                    entering={ZoomIn.duration(500).springify()}
                    exiting={ZoomOut.duration(400)}
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
                        entering={ZoomIn.springify()}
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
                                ? `${partnerProfile?.display_name?.split(' ')[0] || 'Partner'} Joined`
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
        borderColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    textContainer: {
        alignItems: 'center',
    },
    title: {
        fontSize: 10,
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
