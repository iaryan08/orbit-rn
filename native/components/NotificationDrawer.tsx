import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Alert } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withTiming,
    withSpring,
    useSharedValue,
    interpolate,
    Extrapolate,
    runOnJS,
    Easing
} from 'react-native-reanimated';
import { Bell, X, Heart, Mail, Image as ImageIcon, Smile, Sparkles, MessageSquare, Megaphone, Calendar, Trash2 } from 'lucide-react-native';
import { ScrollView, FlatList, TouchableOpacity } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Colors, Spacing, Radius, Typography } from '../constants/Theme';
import { ANIM_ENTER, ANIM_EXIT } from '../constants/Animation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { markAsRead, deleteNotification, clearAllNotifications } from '../lib/notifications';
import { getPartnerName } from '../lib/utils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function NotificationDrawer() {
    const insets = useSafeAreaInsets();
    const { isNotificationDrawerOpen, setNotificationDrawerOpen, notifications, profile, partnerProfile, couple } = useOrbitStore();
    const actorLabel = getPartnerName(profile, partnerProfile);
    const maxDrawerHeight = React.useMemo(
        () => SCREEN_HEIGHT - Math.max(insets.top, 8),
        [insets.top]
    );
    const minDrawerHeight = React.useMemo(
        () => Math.round(maxDrawerHeight * 0.7),
        [maxDrawerHeight]
    );
    const collapsedOffset = React.useMemo(
        () => maxDrawerHeight - minDrawerHeight,
        [maxDrawerHeight, minDrawerHeight]
    );

    const translateY = useSharedValue(SCREEN_HEIGHT);
    const dragStartY = useSharedValue(SCREEN_HEIGHT);

    // Close helper: animates first, THEN sets state — no mid-animation re-render
    const closeDrawer = React.useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT, (finished) => {
            if (finished) runOnJS(setNotificationDrawerOpen)(false);
        });
    }, []);

    React.useEffect(() => {
        if (isNotificationDrawerOpen) {
            translateY.value = withTiming(collapsedOffset, {
                duration: 220,
                easing: Easing.out(Easing.cubic),
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
            if (translateY.value < SCREEN_HEIGHT - 10) {
                translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT);
            }
        }
    }, [isNotificationDrawerOpen, collapsedOffset]);

    const gesture = Gesture.Pan()
        .onStart(() => {
            dragStartY.value = translateY.value;
        })
        .onUpdate((event) => {
            const next = dragStartY.value + event.translationY;
            const clamped = Math.max(0, Math.min(SCREEN_HEIGHT, next));
            translateY.value = clamped;
        })
        .onEnd((event) => {
            const projected = translateY.value + event.velocityY * 0.12;
            const isSwipingDown = event.translationY > 18 || event.velocityY > 220;
            const isSwipingUp = event.translationY < -18 || event.velocityY < -220;

            // Hard close on long downward swipe.
            if (projected > collapsedOffset + 140 || event.translationY > 180 || event.velocityY > 1200) {
                translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT, (finished) => {
                    if (finished) runOnJS(setNotificationDrawerOpen)(false);
                });
                return;
            }

            // Directional snap behavior.
            if (isSwipingUp) {
                translateY.value = withSpring(0, {
                    damping: 22,
                    stiffness: 240,
                    overshootClamping: true,
                });
                return;
            }

            if (isSwipingDown) {
                translateY.value = withSpring(collapsedOffset, {
                    damping: 22,
                    stiffness: 240,
                    overshootClamping: true,
                });
                return;
            }

            // Neutral release -> nearest snap point.
            const toExpanded = Math.abs(translateY.value - 0);
            const toCollapsed = Math.abs(translateY.value - collapsedOffset);
            translateY.value = withSpring(toExpanded <= toCollapsed ? 0 : collapsedOffset, {
                damping: 22,
                stiffness: 240,
                overshootClamping: true,
            });
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, SCREEN_HEIGHT], [1, 0], Extrapolate.CLAMP),
    }));

    return (
        // Keep always rendered — pointerEvents driven by animated backdrop opacity, not state
        <View style={StyleSheet.absoluteFill} pointerEvents={isNotificationDrawerOpen ? 'auto' : 'none'}>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
            </Animated.View>

            {/* Drawer */}
            <Animated.View style={[styles.drawer, animatedStyle, { height: maxDrawerHeight }]}>
                    {/* Static dark glass background — NOT inside BlurView to avoid shimmer during animation */}
                    <View style={[StyleSheet.absoluteFill, styles.drawerBg]} />

                    {/* Notch Handle */}
                    <GestureDetector gesture={gesture}>
                        <View style={styles.handleContainer}>
                            <View style={styles.handle} />
                        </View>
                    </GestureDetector>

                    <GestureDetector gesture={gesture}>
                        <View style={styles.header}>
                            <View style={styles.headerLeft}>
                                <View style={styles.iconContainer}>
                                    <Bell size={22} color={Colors.dark.rose[500]} fill={Colors.dark.rose[500] + '20'} />
                                </View>
                                <View>
                                    <Text style={styles.title}>Notifications</Text>
                                    <Text style={styles.subtitle}>WHATS NEW IN ORBIT</Text>
                                </View>
                            </View>
                            <View style={styles.headerActions}>
                                {notifications.length > 0 && (
                                    <Pressable
                                        onPress={() => {
                                            if (!profile?.id) return;
                                            Alert.alert(
                                                'Clear all notifications?',
                                                'This will permanently remove all notifications.',
                                                [
                                                    { text: 'Cancel', style: 'cancel' },
                                                    {
                                                        text: 'Clear',
                                                        style: 'destructive',
                                                        onPress: async () => {
                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                            useOrbitStore.setState({ notifications: [] });
                                                            await clearAllNotifications(profile.id);
                                                        }
                                                    }
                                                ]
                                            );
                                        }}
                                        style={styles.clearAllButton}
                                    >
                                        <Trash2 size={14} color="rgba(255,255,255,0.6)" />
                                    </Pressable>
                                )}
                                <Pressable
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        closeDrawer();
                                    }}
                                    style={styles.closeButton}
                                >
                                    <X size={20} color="rgba(255,255,255,0.4)" />
                                </Pressable>
                            </View>
                        </View>
                    </GestureDetector>

                    <View style={styles.content}>
                        {notifications.length === 0 ? (
                            <View style={styles.emptyState}>
                                <View style={styles.emptyIconCircle}>
                                    <Bell size={32} color="rgba(255,255,255,0.1)" />
                                </View>
                                <Text style={styles.emptyText}>All caught up!</Text>
                                <Text style={styles.emptySubtext}>You have no new notifications.</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={notifications}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
                                showsVerticalScrollIndicator={false}
                                nestedScrollEnabled
                                renderItem={({ item }) => {
                                    const Icon = getNotificationIcon(item.type);
                                    const timeStr = item.created_at ? formatDistanceToNow(item.created_at, { addSuffix: true }) : 'just now';
                                    const { titleText, messageText } = getDisplayCopy(item, actorLabel);

                                    return (
                                        <TouchableOpacity
                                            style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                if (!item.is_read && profile?.id) {
                                                    useOrbitStore.setState((state) => ({
                                                        notifications: state.notifications.map((notification) =>
                                                            notification.id === item.id
                                                                ? { ...notification, is_read: true }
                                                                : notification
                                                        )
                                                    }));
                                                    markAsRead(profile.id, item.id);
                                                }
                                                closeDrawer();
                                            }}
                                        >
                                            <View style={[styles.itemIconContainer, { backgroundColor: getNotificationColor(item.type) + '20' }]}>
                                                <Icon size={18} color={getNotificationColor(item.type)} />
                                            </View>
                                            <View style={styles.itemTextContainer}>
                                                <View style={styles.itemHeader}>
                                                    <Text style={styles.itemTitle} numberOfLines={2}>{titleText}</Text>
                                                </View>
                                                <Text style={styles.itemTime}>{timeStr}</Text>
                                                <Text style={styles.itemMessage} numberOfLines={2}>{messageText}</Text>
                                            </View>
                                            <View style={styles.itemRightActions}>
                                                {!item.is_read && <View style={styles.unreadDot} />}
                                                <TouchableOpacity
                                                    onPress={async () => {
                                                        if (!profile?.id) return;
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        useOrbitStore.setState((state) => ({
                                                            notifications: state.notifications.filter((notification) => notification.id !== item.id)
                                                        }));
                                                        await deleteNotification(profile.id, item.id);
                                                    }}
                                                    style={styles.itemDeleteButton}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                >
                                                    <X size={14} color="rgba(255,255,255,0.5)" />
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )}
                    </View>
                </Animated.View>
        </View>
    );
}

function normalizeNotificationLine(text: any, actorLabel: string) {
    if (!text || typeof text !== 'string') return '';
    const replaced = text
        .replace(/\byour partner\b/gi, actorLabel || 'Partner')
        .replace(/\bpartner\b/gi, actorLabel || 'Partner')
        .replace(/\r\n/g, '\n');
    const cleaned = replaced
        .split('\n')
        .map((line) => line.trim())
        .filter((line, idx, arr) => {
            const symbolOnly = line.length <= 4 && !/[A-Za-z0-9]/.test(line);
            if (!symbolOnly) return true;
            return arr.length <= 1 || idx === 0;
        })
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return cleaned;
}

function inferActorLabel(item: any, fallbackActor: string) {
    const actorName = item?.actor_name;
    if (typeof actorName === 'string' && actorName.trim()) return actorName.trim();

    const title = typeof item?.title === 'string' ? item.title.replace(/\r\n/g, ' ').trim() : '';
    const sentMatch = title.match(/^(.{1,60}?)\s+sent\b/i);
    if (sentMatch?.[1]) {
        let actor = sentMatch[1].replace(/\s+/g, ' ').trim();
        const chunks = actor.split(' ').filter(Boolean) as string[];
        if (chunks.length > 1 && chunks.length <= 3 && chunks.every((c: string) => /^[A-Za-z]+$/.test(c) && c.length <= 3)) {
            actor = chunks.join('');
        }
        return actor;
    }

    return fallbackActor || 'Partner';
}

function isLikelyBrokenText(text: string) {
    if (!text) return true;
    const words = text.split(' ').filter(Boolean);
    if (words.length < 4) return false;
    const shortWords = words.filter(w => w.length <= 3).length;
    return shortWords / words.length > 0.65;
}

function defaultCopyByType(type: string, actor: string) {
    switch (type) {
        case 'heartbeat':
            return {
                titleText: `${actor} sent a Heartbeat`,
                messageText: `${actor} shared a heartbeat with you.`,
            };
        case 'spark':
            return {
                titleText: `${actor} sent a Spark`,
                messageText: `${actor} is thinking about you right now.`,
            };
        case 'letter':
            return {
                titleText: `${actor} sent a Letter`,
                messageText: `A new letter from ${actor} is waiting for you.`,
            };
        case 'memory':
        case 'moment':
            return {
                titleText: `${actor} shared a Moment`,
                messageText: `${actor} added a new memory to your shared space.`,
            };
        default:
            return {
                titleText: `${actor} sent an update`,
                messageText: `You have a new update from ${actor}.`,
            };
    }
}

function getDisplayCopy(item: any, fallbackActor: string) {
    const actor = inferActorLabel(item, fallbackActor);
    const rawTitle = normalizeNotificationLine(item?.title, actor);
    const rawMessage = normalizeNotificationLine(item?.message, actor);
    const defaults = defaultCopyByType(item?.type || '', actor);

    const titleText = isLikelyBrokenText(rawTitle) ? defaults.titleText : rawTitle || defaults.titleText;
    let messageText = rawMessage || defaults.messageText;

    if (/^partner\b/i.test(messageText)) {
        messageText = messageText.replace(/^partner\b/i, actor);
    }
    if (isLikelyBrokenText(messageText)) {
        messageText = defaults.messageText;
    }

    return { titleText, messageText };
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },
    drawer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: Radius.xl * 2,
        borderTopRightRadius: Radius.xl * 2,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
        zIndex: 9999,
    },
    // Solid dark glass — no BlurView shimmer during slide animation
    drawerBg: {
        backgroundColor: 'rgba(9,10,16,0.98)',
        borderTopLeftRadius: Radius.xl * 2,
        borderTopRightRadius: Radius.xl * 2,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    handleContainer: {
        width: '100%',
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    title: {
        fontSize: 24,
        fontFamily: Typography.serif,
        color: 'white',
    },
    subtitle: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        marginTop: 2,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    clearAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        borderRadius: 999,
        paddingHorizontal: 10,
        height: 32,
    },
    clearAllText: {
        fontSize: 9,
        letterSpacing: 1.1,
        color: 'rgba(255,255,255,0.65)',
        fontFamily: Typography.sansBold,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 100,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    emptyText: {
        fontSize: 20,
        fontFamily: Typography.serif,
        color: 'white',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.4)',
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: Radius.lg,
        marginBottom: 8,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,254,0.04)',
    },
    unreadItem: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(251,113,133,0.12)',
    },
    itemIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    itemTextContainer: {
        flex: 1,
    },
    itemHeader: {
        marginBottom: 2,
    },
    itemTitle: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'white',
        lineHeight: 18,
    },
    itemTime: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.3,
        marginBottom: 6,
    },
    itemMessage: {
        fontSize: 13,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.6)',
        lineHeight: 18,
    },
    unreadDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.dark.rose[500],
        marginLeft: 12,
    },
    itemRightActions: {
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
        gap: 8,
    },
    itemDeleteButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
});

function getNotificationIcon(type: string) {
    switch (type) {
        case 'mood': return Smile;
        case 'letter': return Mail;
        case 'memory': return ImageIcon;
        case 'moment': return ImageIcon;
        case 'intimacy': return Heart;
        case 'spark': return Sparkles;
        case 'heartbeat': return Heart;
        case 'announcement': return Megaphone;
        case 'bucket_list': return Sparkles;
        case 'calendar': return Calendar;
        default: return Bell;
    }
}

function getNotificationColor(type: string) {
    switch (type) {
        case 'mood': return '#A78BFA';
        case 'letter': return '#60A5FA';
        case 'memory': return '#F472B6';
        case 'intimacy': return '#FB7185';
        case 'spark': return '#FBBF24';
        case 'announcement': return '#34D399';
        default: return Colors.dark.rose[400];
    }
}
