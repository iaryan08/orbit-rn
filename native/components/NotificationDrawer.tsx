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
import { markAsRead, deleteNotification, clearAllNotifications, getDisplayCopy } from '../lib/notifications';
import { getPartnerName } from '../lib/utils';
import { FlashList } from '@shopify/flash-list';
import { ProfileAvatar } from './ProfileAvatar';
import { getPublicStorageUrl } from '../lib/storage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function NotificationDrawer() {
    const insets = useSafeAreaInsets();
    const isNotificationDrawerOpen = useOrbitStore(s => s.isNotificationDrawerOpen);
    const setNotificationDrawerOpen = useOrbitStore(s => s.setNotificationDrawerOpen);
    const notifications = useOrbitStore(s => s.notifications);
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const idToken = useOrbitStore(s => s.idToken);
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
            // Instagram-style: if we are at the top (translateY == 0) and swiping down, unlock drawer movement
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
        <View style={StyleSheet.absoluteFill} pointerEvents={isNotificationDrawerOpen ? 'auto' : 'none'}>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
            </Animated.View>

            {/* Drawer */}
            <Animated.View style={[styles.drawer, animatedStyle, { height: maxDrawerHeight }]}>
                <View style={[StyleSheet.absoluteFill, styles.drawerBg]} />

                {/* Notch Handle */}
                <GestureDetector gesture={gesture}>
                    <View style={styles.handleContainer}>
                        <View style={styles.handle} />
                    </View>
                </GestureDetector>

                <GestureDetector gesture={Gesture.Race(gesture, Gesture.Native())}>
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
                        <FlashList
                            // @ts-ignore - FlashList types can be finicky in some environments
                            estimatedItemSize={100}
                            data={notifications}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }) => {
                                const Icon = getNotificationIcon(item.type);
                                const timeStr = item.created_at ? formatMinimalTime(item.created_at) : '';
                                const { titleText, messageText } = getDisplayCopy(item, actorLabel);

                                const actorAvatarUrl = getPublicStorageUrl(
                                    item.actor_avatar_url || (item.actor_id === partnerProfile?.id ? partnerProfile?.avatar_url : null),
                                    'avatars',
                                    idToken
                                );

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
                                        <View style={styles.itemAvatarContainer}>
                                            <ProfileAvatar
                                                url={actorAvatarUrl}
                                                size={36}
                                                borderWidth={1.5}
                                                borderColor={getNotificationColor(item.type) + '40'}
                                                fallbackText={actorLabel[0]}
                                            />
                                            <View style={[styles.typeIconBadge, { backgroundColor: getNotificationColor(item.type) }]}>
                                                <Icon size={10} color="white" />
                                            </View>
                                        </View>
                                        <View style={styles.itemTextContainer}>
                                            <View style={styles.itemHeader}>
                                                <Text style={styles.itemTitle} numberOfLines={2}>{titleText}</Text>
                                            </View>
                                            <Text style={styles.itemMessage} numberOfLines={3}>
                                                {messageText}{' '}
                                                <Text style={styles.inlineTime}>{timeStr}</Text>
                                            </Text>
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
        backgroundColor: 'rgba(255,255,255,0.45)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    title: {
        fontSize: 20,
        fontFamily: Typography.serif,
        color: 'white',
    },
    subtitle: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.65)',
        letterSpacing: 1.2,
        marginTop: 1,
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
        fontSize: 13,
        letterSpacing: 1.1,
        color: 'rgba(255,255,255,0.85)',
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
        color: 'rgba(255,255,255,0.65)',
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
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
    itemAvatarContainer: {
        marginRight: 16,
        position: 'relative'
    },
    typeIconBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#090A10'
    },
    itemTextContainer: {
        flex: 1,
    },
    itemHeader: {
        marginBottom: 2,
    },
    itemTitle: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: 'white',
        lineHeight: 16,
    },
    itemTime: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.2,
        marginBottom: 4,
    },
    inlineTime: {
        fontSize: 12,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.4)',
    },
    itemMessage: {
        fontSize: 12,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.82)',
        lineHeight: 16,
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

function formatMinimalTime(date: Date | string | number) {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return `${weeks}w`;
}
