import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
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
import { Bell, X } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../constants/Theme';
import { ANIM_ENTER, ANIM_EXIT } from '../constants/Animation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.75;

export function NotificationDrawer() {
    const insets = useSafeAreaInsets();
    const { isNotificationDrawerOpen, setNotificationDrawerOpen } = useOrbitStore();

    const translateY = useSharedValue(SCREEN_HEIGHT);

    // Close helper: animates first, THEN sets state — no mid-animation re-render
    const closeDrawer = React.useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT, (finished) => {
            if (finished) runOnJS(setNotificationDrawerOpen)(false);
        });
    }, []);

    React.useEffect(() => {
        if (isNotificationDrawerOpen) {
            translateY.value = withTiming(0, ANIM_ENTER);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
            if (translateY.value < SCREEN_HEIGHT - 10) {
                translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT);
            }
        }
    }, [isNotificationDrawerOpen]);

    const gesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 100 || event.velocityY > 500) {
                translateY.value = withTiming(SCREEN_HEIGHT, ANIM_EXIT, (finished) => {
                    if (finished) runOnJS(setNotificationDrawerOpen)(false);
                });
            } else {
                translateY.value = withTiming(0, ANIM_ENTER);
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, DRAWER_HEIGHT], [1, 0], Extrapolate.CLAMP),
    }));

    return (
        // Keep always rendered — pointerEvents driven by animated backdrop opacity, not state
        <View style={StyleSheet.absoluteFill} pointerEvents={isNotificationDrawerOpen ? 'auto' : 'none'}>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
            </Animated.View>

            {/* Swipeable Drawer */}
            <GestureDetector gesture={gesture}>
                <Animated.View style={[styles.drawer, animatedStyle, { height: DRAWER_HEIGHT + insets.bottom }]}>
                    {/* Static dark glass background — NOT inside BlurView to avoid shimmer during animation */}
                    <View style={[StyleSheet.absoluteFill, styles.drawerBg]} />

                    {/* Notch Handle */}
                    <View style={styles.handleContainer}>
                        <View style={styles.handle} />
                    </View>

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

                    <View style={styles.content}>
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconCircle}>
                                <Bell size={32} color="rgba(255,255,255,0.1)" />
                            </View>
                            <Text style={styles.emptyText}>All caught up!</Text>
                            <Text style={styles.emptySubtext}>You have no new notifications.</Text>
                        </View>
                    </View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
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
        backgroundColor: 'rgba(10,10,20,0.92)',
        borderTopLeftRadius: Radius.xl * 2,
        borderTopRightRadius: Radius.xl * 2,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
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
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
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
});
