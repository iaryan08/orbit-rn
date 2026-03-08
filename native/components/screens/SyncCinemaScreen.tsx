import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Dimensions, Platform, Alert, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSequence, runOnJS, withDelay } from 'react-native-reanimated';
import { ANIM_FADE_IN, ANIM_FADE_OUT, ANIM_MICRO } from '../../constants/Animation';
import { BlurView } from 'expo-blur';
import { getPartnerName } from '../../lib/utils';
import { useOrbitStore } from '../../lib/store';
import { getPublicStorageUrl } from '../../lib/storage';
import { rtdb } from '../../lib/firebase';
import { ref, update, set, onDisconnect, onValue } from 'firebase/database';
import * as Haptics from 'expo-haptics';
import { Film, X, Plus } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Emoji } from '../Emoji';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ReactionType = 'laugh' | 'heartbeat' | 'tap' | 'emoji-preset';

const BASE_EMOJIS = ['✨', '🥺', '😘', '🍿'];


export function SyncCinemaScreen() {
    const { profile, couple, activeTabIndex, setTabIndex, partnerProfile, idToken } = useOrbitStore();
    const isFocused = activeTabIndex === 0;
    const insets = useSafeAreaInsets();


    const [partnerInCinema, setPartnerInCinema] = useState(false);
    const [incomingReaction, setIncomingReaction] = useState<{ type: ReactionType; emoji?: string; senderName?: string; senderId?: string } | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState(BASE_EMOJIS[0]);
    const [customEmojis, setCustomEmojis] = useState<string[]>([]);

    const partnerName = getPartnerName(profile, partnerProfile);

    const partnerAvatarUrl = React.useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const myAvatarUrl = React.useMemo(() =>
        getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken),
        [profile?.idToken, profile?.avatar_url]);


    const reactionScale = useSharedValue(0);
    const reactionOpacity = useSharedValue(0);

    // Emoji tray entrance animation matching NavbarDock's ANIM_FADE_IN
    const trayTranslationY = useSharedValue(150);
    const trayOpacity = useSharedValue(0);
    const instructionsOpacity = useSharedValue(0);

    // Custom Emoji Modal State
    const [showEmojiModal, setShowEmojiModal] = useState(false);
    const [emojiInput, setEmojiInput] = useState('');

    const lastBroadcastAt = useRef(0);

    // Track presence
    useEffect(() => {
        if (!isFocused || !couple?.id || !profile?.id) return;

        const presenceRef = ref(rtdb, `presence/${couple.id}/${profile.id}`);
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);

        update(presenceRef, {
            in_cinema: true,
            is_online: true,
            last_changed: Date.now()
        });
        onDisconnect(presenceRef).update({
            in_cinema: null,
            is_online: false
        });

        // Zero-cost storage scaling: Tell Firebase servers to securely delete our ephemeral event node memory when we leave
        onDisconnect(broadcastRef).remove();


        return () => {
            // Add a small delay so rapid tab switching doesn't accidentally clear the state
            // after it was just re-established.
            setTimeout(() => {
                const currentTab = useOrbitStore.getState().activeTabIndex;
                if (currentTab !== 0) { // 0 is SyncCinema
                    update(presenceRef, {
                        in_cinema: null,
                        last_changed: Date.now()
                    }).catch(() => { });
                }
            }, 1000);
        };

    }, [isFocused, couple?.id, profile?.id]);

    // Listen for partner presence and events
    useEffect(() => {
        if (!couple?.id || !partnerProfile?.id) return;

        // Presence listener
        const presenceRef = ref(rtdb, `presence/${couple.id}/${partnerProfile.id}`);
        const unsubPresence = onValue(presenceRef, (snap) => {
            setPartnerInCinema(!!snap.val()?.in_cinema);
        });

        // Broadcasts listener (for reactions)
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${partnerProfile.id}`);
        const unsubBroadcasts = onValue(broadcastRef, (snap) => {
            const data = snap.val();
            if (!data) return;

            // Must be a cinema_event within the last 5 seconds to prevent stale popups
            if (data.event === 'cinema_event' && data.timestamp && (Date.now() - data.timestamp < 5000)) {
                // Determine if this is a new event (very rough debounce based on time, ideally we'd use event IDs)
                handleIncomingEvent(data.payload);
            }
        });

        return () => {
            unsubPresence();
            unsubBroadcasts();
        };
    }, [couple?.id, partnerProfile?.id]);

    const handleIncomingEvent = (event: any) => {
        if (!event || event.senderId === profile?.id) return;

        let type = event.type || event.event;
        let emoji = event.emoji;

        // Handle Web-style 'navigation' events (swipes, double taps)
        if (event.event === 'navigation') {
            type = 'tap';
            emoji = event.navEvent === 'double_tap' ? '✨' : (event.direction === 'up' ? '😂' : '😢');
        }

        if (event.event === 'reaction' || event.event === 'emoji-preset' || event.event === 'navigation') {
            setIncomingReaction({
                type,
                emoji,
                senderId: event.senderId,
                senderName: partnerName
            });

            reactionScale.value = 0;
            reactionOpacity.value = 1;

            reactionScale.value = withSequence(
                withTiming(1.2, { duration: 200 }),
                withTiming(1, { duration: 100 })
            );

            reactionOpacity.value = withDelay(2000, withTiming(0, { duration: 400 }, (finished) => {
                if (finished) runOnJS(setIncomingReaction)(null);
            }));

            if (type === 'heartbeat') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            } else {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        }
    };


    const showReaction = (type: ReactionType, emoji?: string) => {
        setIncomingReaction({
            type,
            emoji,
            senderId: profile?.id,
            senderName: profile?.display_name
        });
        reactionScale.value = 0;
        reactionOpacity.value = 1;

        reactionScale.value = withSequence(
            withTiming(1.2, { duration: 200 }),
            withTiming(1, { duration: 100 })
        );

        reactionOpacity.value = withDelay(2000, withTiming(0, { duration: 400 }, (finished) => {
            if (finished) {
                runOnJS(setIncomingReaction)(null);
            }
        }));
    };

    const handleAction = (type: ReactionType, emoji?: string) => {
        if (type === 'heartbeat') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        showReaction(type, emoji);

        // Throttle network broadcast (max 1 DB write every 500ms per user) to drastically reduce DB cost
        // Visuals and haptics continue to be instantaneous, but network respects bounds.
        const now = Date.now();
        if (now - lastBroadcastAt.current < 500) return;
        lastBroadcastAt.current = now;

        // Broadcast to RTDB natively using the exact same structure as web SyncEngine
        if (couple?.id && profile?.id) {
            const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
            set(broadcastRef, {
                event: 'cinema_event',
                timestamp: Date.now(),
                payload: {
                    event: type === 'emoji-preset' ? 'emoji-preset' : 'reaction',
                    type: type,
                    emoji: emoji || null,
                    senderId: profile.id,
                    senderName: profile.display_name // Include senderName for cross-platform visibility
                }
            });
        }

        // Instantly hide instructions on any action
        instructionsOpacity.value = 0;
    };


    const SINGLE_EMOJI_REGEX = /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u;

    const handleAddEmojiPrompt = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmojiInput('');
        setShowEmojiModal(true);
    };

    const submitCustomEmoji = () => {
        const trimmed = emojiInput.trim();
        if (SINGLE_EMOJI_REGEX.test(trimmed)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            // Only add if it's a valid single emoji
            setCustomEmojis(prev => {
                const next = [trimmed, ...prev.filter(e => e !== trimmed)].slice(0, 3);
                return next;
            });
            setSelectedEmoji(trimmed);
            handleAction('emoji-preset', trimmed);
            setShowEmojiModal(false);
            setEmojiInput('');
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Invalid Emoji", "You must enter exactly 1 emoji character.");
        }
    };


    const doubleTapGesture = Gesture.Tap()
        .enabled(partnerInCinema)
        .numberOfTaps(2)
        .maxDuration(180)
        .onEnd(() => {
            runOnJS(handleAction)('tap', '✨');
        });

    const tapGesture = Gesture.Tap()
        .enabled(partnerInCinema)
        .maxDuration(180)
        .requireExternalGestureToFail(doubleTapGesture)
        .onEnd(() => {
            runOnJS(handleAction)('tap', selectedEmoji);
        });


    const longPressGesture = Gesture.LongPress()
        .enabled(partnerInCinema)
        .minDuration(250)
        .onBegin(() => {
            runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        })
        .onStart(() => {
            runOnJS(handleAction)('heartbeat');
        });

    const swipeGesture = Gesture.Pan()
        .enabled(partnerInCinema)
        .activeOffsetY([-10, 10]) // Only capture vertical swipes. Let horizontal swipes fall through to PagerView.
        .onEnd((e: any) => {
            if (e.translationY < -50) {
                runOnJS(handleAction)('laugh');
            } else if (e.translationY > 50) {
                runOnJS(handleAction)('tap', '😢');
            }
        });

    // CRITICAL: LongPress MUST come before Swipe in Exclusive for it to trigger DURING the press.
    // If Swipe (Pan) is first, it waits until the finger is lifted to fail.
    const composed = Gesture.Exclusive(longPressGesture, swipeGesture, doubleTapGesture, tapGesture);

    const animatedReactionStyle = useAnimatedStyle(() => ({
        opacity: reactionOpacity.value,
        transform: [{ scale: reactionScale.value }]
    }));

    const animatedTrayStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: trayTranslationY.value }],
        opacity: trayOpacity.value,
    }));

    const animatedInstructionsStyle = useAnimatedStyle(() => ({
        opacity: instructionsOpacity.value,
    }));

    useEffect(() => {
        if (isFocused) {
            trayTranslationY.value = withDelay(100, withTiming(0, ANIM_MICRO));
            trayOpacity.value = withDelay(100, withTiming(1, ANIM_MICRO));
            instructionsOpacity.value = 0.5;
            instructionsOpacity.value = withDelay(4000, withTiming(0, { duration: 1000 }));
        } else {
            trayTranslationY.value = 150; // instant exit to match dock
            trayOpacity.value = 0;
            instructionsOpacity.value = 0;
        }
    }, [isFocused]);

    if (!isFocused) return null;


    return (
        <View style={styles.container}>
            <GestureDetector gesture={composed}>
                <View style={StyleSheet.absoluteFill}>

                    {/* HUD */}
                    <View style={styles.hudContainer} pointerEvents="none">
                        <View style={styles.partnerInfo}>
                            {partnerAvatarUrl ? (
                                <Image source={{ uri: partnerAvatarUrl }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                    <Text style={styles.avatarText}>{partnerName.charAt(0)}</Text>
                                </View>
                            )}
                            {partnerInCinema ? (
                                <View style={styles.presenceTag}>
                                    <Text style={styles.presenceText}>{partnerName} in Cinema</Text>
                                </View>
                            ) : (
                                <View style={{ marginLeft: 16 }}>
                                    <Text style={styles.watchingAloneText}>Watching Alone</Text>
                                </View>
                            )}
                        </View>

                        <Animated.View style={[styles.instructionsContainer, animatedInstructionsStyle]}>
                            <Film size={48} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.instructionText}>TAP TO NUDGE</Text>
                            <Text style={styles.instructionText}>HOLD FOR PING</Text>
                            <Text style={styles.instructionText}>SWIPE UP TO LAUGH · DOWN TO CRY</Text>
                        </Animated.View>
                    </View>

                    {/* Reaction Overlay */}
                    {incomingReaction && (
                        <Animated.View style={[styles.reactionOverlay, animatedReactionStyle]} pointerEvents="none">
                            <View style={{ alignItems: 'center' }}>
                                <Animated.View style={[
                                    styles.reactionContainer,
                                    animatedReactionStyle,
                                    incomingReaction.type === 'heartbeat' && {
                                        shadowColor: (incomingReaction.senderId === partnerProfile?.id ? partnerProfile?.gender : profile?.gender) === 'female' ? '#f43f5e' : '#0ea5e9',
                                        shadowOffset: { width: 0, height: 0 },
                                        shadowOpacity: 0.9,
                                        shadowRadius: 80,
                                        elevation: 0,
                                        borderRadius: 70,
                                    }
                                ]}>
                                    {incomingReaction.type === 'heartbeat' ? (
                                        (incomingReaction.senderId === partnerProfile?.id && partnerAvatarUrl) ? (
                                            <Image
                                                source={{ uri: partnerAvatarUrl }}
                                                style={{
                                                    width: 140,
                                                    height: 140,
                                                    borderRadius: 70,
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(255,255,255,0.1)'
                                                }}
                                            />
                                        ) : (incomingReaction.senderId === profile?.id && myAvatarUrl) ? (
                                            <Image
                                                source={{ uri: myAvatarUrl }}
                                                style={{
                                                    width: 140,
                                                    height: 140,
                                                    borderRadius: 70,
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(255,255,255,0.1)'
                                                }}
                                            />
                                        ) : (
                                            <Emoji symbol="❤️" size={100} style={{ textShadowColor: 'rgba(244,63,94,0.8)' }} />
                                        )
                                    ) : (
                                        <Emoji
                                            symbol={incomingReaction.type === 'laugh' ? '😂' : (incomingReaction.emoji || '✨')}
                                            style={[
                                                styles.reactionEmoji,
                                                {
                                                    textShadowColor: incomingReaction.type === 'laugh' ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.6)',
                                                    textShadowRadius: 40
                                                }
                                            ]}
                                        />
                                    )}
                                </Animated.View>

                                {/* Universal Name Badge */}
                                {incomingReaction.senderName && (
                                    <Animated.View style={[
                                        styles.reactionSenderBadge,
                                        animatedReactionStyle,
                                        {
                                            borderColor: (incomingReaction.senderId === partnerProfile?.id ? partnerProfile?.gender : profile?.gender) === 'female' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                            backgroundColor: (incomingReaction.senderId === partnerProfile?.id ? partnerProfile?.gender : profile?.gender) === 'female' ? 'rgba(244, 63, 94, 0.05)' : 'rgba(56, 189, 248, 0.05)',
                                        }
                                    ]}>
                                        <Text style={[
                                            styles.reactionSenderText,
                                            { color: (incomingReaction.senderId === partnerProfile?.id ? partnerProfile?.gender : profile?.gender) === 'female' ? '#fb7185' : '#7dd3fc' }
                                        ]}>
                                            {incomingReaction.senderName}
                                        </Text>
                                    </Animated.View>
                                )}
                            </View>
                        </Animated.View>
                    )}
                </View>
            </GestureDetector>

            {/* Emoji Tray */}
            <Animated.View style={[styles.trayContainer, { bottom: Math.max(insets.bottom, 16) }, animatedTrayStyle]} pointerEvents="box-none">
                <View style={[
                    styles.emojiTray,
                    { borderColor: partnerInCinema ? 'rgba(16, 185, 129, 0.5)' : 'rgba(225, 29, 72, 0.4)' }
                ]}>
                    {[...BASE_EMOJIS, ...customEmojis].map((emoji) => (
                        <TouchableOpacity
                            key={emoji}
                            disabled={!partnerInCinema}
                            style={[
                                styles.emojiBtn,
                                selectedEmoji === emoji && styles.emojiBtnSelected,
                                { opacity: partnerInCinema ? 1 : 0.5 }
                            ]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setSelectedEmoji(emoji);
                                handleAction('emoji-preset', emoji);
                            }}
                        >
                            <Emoji symbol={emoji} size={18} />
                        </TouchableOpacity>
                    ))}

                    {customEmojis.length < 3 && (
                        <TouchableOpacity
                            disabled={!partnerInCinema}
                            style={[styles.emojiBtn, { opacity: partnerInCinema ? 1 : 0.5 }]}
                            onPress={handleAddEmojiPrompt}
                        >
                            <Plus size={20} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>

            {/* Custom Emoji Modal */}
            <Modal
                visible={showEmojiModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowEmojiModal(false)}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add Custom Emoji</Text>
                        <Text style={styles.modalDesc}>Enter exactly ONE emoji.</Text>
                        <TextInput
                            style={[styles.modalInput, { fontFamily: 'AppleColorEmoji' }]}
                            value={emojiInput}
                            onChangeText={setEmojiInput}
                            autoFocus={true}
                            maxLength={5}
                            selectionColor="#f43f5e"
                        />
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                                onPress={() => setShowEmojiModal(false)}
                            >
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, { backgroundColor: 'rgba(244,63,94,0.8)' }]}
                                onPress={submitCustomEmoji}
                            >
                                <Text style={styles.modalBtnText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        right: 20,
        zIndex: 50,
    },
    closeBtn: {
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    hudContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    partnerInfo: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 40,
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    avatarPlaceholder: {
        backgroundColor: 'rgba(244,63,94,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#f43f5e',
        fontWeight: 'bold',
        fontSize: 18,
    },
    presenceTag: {
        marginLeft: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(16,185,129,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.3)',
        overflow: 'hidden',
    },
    presenceText: {
        color: '#34d399',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    watchingAloneText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    instructionsContainer: {
        alignItems: 'center',
        opacity: 0.3,
        gap: 8,
    },
    instructionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },
    reactionSenderBadge: {
        marginTop: 100, // Adjusted for "full screen" feel
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 99,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reactionSenderText: {
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    reactionOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactionContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactionEmoji: {
        fontSize: 120,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 30,
    },
    trayContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center'
    },
    emojiTray: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        height: 52,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
        minWidth: 220,
    },
    emojiBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
    },
    emojiBtnSelected: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    emojiText: {
        fontSize: 18,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        backgroundColor: '#1a1a1a', // Replaced BlurView with solid dark color to fix Render Crash
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    modalTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalDesc: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        marginBottom: 20,
    },
    modalInput: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(244,63,94,0.4)',
        borderRadius: 16,
        padding: 16,
        color: 'white',
        fontSize: 32,
        minWidth: 100,
        textAlign: 'center',
        marginBottom: 24,
    },
    modalBtnRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    modalBtn: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    modalBtnText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    }
});
