import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { Bell } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';

export function NotificationsScreen() {
    const insets = useSafeAreaInsets();
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    // Morphing: Title fades and scales down (Delayed)
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [85, 125], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [85, 125], [1, 0.95], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
    }));

    // Morphing: HeaderPill fades and slides in (Delayed)
    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [105, 135], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [105, 135], [5, 0], Extrapolate.CLAMP) }]
    }));

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Notifications" scrollOffset={scrollOffset} />
            </Animated.View>
            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingBottom: 100 }}
            >
                <View style={styles.header}>
                    <Bell size={32} color={Colors.dark.foreground} />
                    <Animated.Text style={[styles.title, titleAnimatedStyle]}>Notifications</Animated.Text>
                    <Animated.Text style={[styles.subtitle, sublineAnimatedStyle]}>Stay updated with your partner.</Animated.Text>
                </View>

                <View style={styles.content}>
                    <GlassCard style={styles.card} intensity={20}>
                        <Text style={styles.cardText}>
                            You have no new notifications right now.
                        </Text>
                    </GlassCard>
                </View>
            </Animated.ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    stickyHeader: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: 'box-none',
    },
    header: {
        alignItems: 'flex-start',
        paddingTop: 80, // Moved higher
        paddingHorizontal: Spacing.sm, // Extreme viewport optimization
        paddingBottom: Spacing.xl,
    },
    title: {
        fontSize: 48,
        color: Colors.dark.foreground,
        marginTop: Spacing.sm,
        marginBottom: 8,
        fontFamily: Typography.serif,
        letterSpacing: -1,
        textAlign: 'left',
    },
    subtitle: {
        fontSize: 16,
        color: Colors.dark.mutedForeground,
        textAlign: 'left',
    },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
    },
    card: {
        padding: Spacing.xl,
        borderRadius: Radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardText: {
        color: Colors.dark.mutedForeground,
        fontSize: 15,
        lineHeight: 24,
        textAlign: 'center',
    }
});
