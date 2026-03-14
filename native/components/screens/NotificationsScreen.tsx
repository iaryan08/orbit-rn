import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
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
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingBottom: 100 }}
            >
                <View style={styles.standardHeader}>
                    <Animated.Text style={[styles.standardTitle, titleAnimatedStyle]}>Notifications</Animated.Text>
                    <Animated.Text style={[styles.standardSubtitle, sublineAnimatedStyle]}>ALERTS · ACTIVITY</Animated.Text>
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
    standardHeader: GlobalStyles.standardHeader,
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    content: {
        flex: 1,
        paddingHorizontal: Spacing.md,
    },
    card: {
        padding: Spacing.xl,
        borderRadius: Radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    cardText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 15,
        fontFamily: Typography.sans,
        lineHeight: 24,
        textAlign: 'center',
    }
});
