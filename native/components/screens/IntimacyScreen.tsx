import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { Flame } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { useOrbitStore } from '../../lib/store';

import { MilestoneCard } from '../MilestoneCard';
import { Heart, Sparkles, MapPin, Camera, Music, Gift, Coffee, Star, Plus, Check, Trash2, ChevronDown, ChevronUp, Trophy, Target, Lock, Unlock } from 'lucide-react-native';
import { addBucketItem, toggleBucketItem, deleteBucketItem } from '../../lib/auth';
import { TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';

// Local milestone configurations

const MILESTONES = [
    { id: 'first_meet', title: 'First Meeting', description: 'WHERE IT ALL BEGAN', prompt: 'Where did you first lock eyes?', icon: <MapPin size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_kiss', title: 'First Kiss', description: 'THAT MAGICAL MOMENT', prompt: 'Tell the story of that first spark...', icon: <Heart size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_date', title: 'First Date', description: 'OUR FIRST ADVENTURE', prompt: 'What made our first date so special?', icon: <Sparkles size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_memory', title: 'First Memory', description: 'CORE MEMORY UNLOCKED', prompt: 'A moment that stays with you forever...', icon: <Camera size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_song', title: 'Our Song', description: 'THE RHYTHM OF US', prompt: 'Why is this our melody?', icon: <Music size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_surprise', title: 'First Surprise', description: 'LITTLE MOMENTS', prompt: 'That time you were truly caught off guard...', icon: <Gift size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_trip', title: 'First Trip', description: 'WANDERLUST TOGETHER', prompt: 'Our first horizon together...', icon: <MapPin size={22} color={Colors.dark.indigo[400]} /> },
];

export function IntimacyScreen() {
    const insets = useSafeAreaInsets();
    const { milestones, bucketList, profile } = useOrbitStore();

    // Scroll tracking for morphing header
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    const [newItem, setNewItem] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isPrivate, setIsPrivate] = useState(false);
    const [showBucket, setShowBucket] = useState(true);

    const filteredBucket = useMemo(() => {
        return bucketList.filter(item => {
            if (!item.is_private) return true;
            return item.created_by === profile?.id;
        });
    }, [bucketList, profile?.id]);

    const completedCount = bucketList.filter(i => i.is_completed).length;
    const totalCount = bucketList.length;
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount);

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        setIsAdding(true);
        try {
            await addBucketItem(newItem.trim(), '', isPrivate);
            setNewItem('');
            setIsPrivate(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAdding(false);
        }
    };

    const handleToggle = async (id: string, completed: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await toggleBucketItem(id, !completed);
    };

    const handleDelete = async (id: string) => {
        Alert.alert(
            "Remove Dream?",
            "This will remove this item from your shared bucket list. You can always add it back later.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        await deleteBucketItem(id);
                    }
                }
            ]
        );
    };

    // Morphing: Title fades and scales down (Delayed)
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [10, 60], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [10, 60], [1, 0.95], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
    }));

    // Morphing: HeaderPill fades and slides in (Delayed)
    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [65, 110], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [65, 110], [5, 0], Extrapolate.CLAMP) }]
    }));

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            {/* Sticky Header Pill */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Intimacy" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: insets.top + Spacing.lg, paddingBottom: 160 }}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <View style={styles.badgeRow}>
                        <View style={styles.badgeDot} />
                        <Text style={styles.badgeText}>DEEP CONNECTION</Text>
                        <Text style={styles.badgeCount}>15</Text>
                    </View>
                    <Animated.Text style={[styles.title, titleAnimatedStyle]}>Intimacy</Animated.Text>
                    <Animated.Text style={[styles.subtitle, sublineAnimatedStyle]}>Preserve your most precious milestones.</Animated.Text>
                </View>

                <View style={styles.content}>
                    {/* Premium Bucket List Section */}
                    <GlassCard style={styles.bucketSection} intensity={10}>
                        <View style={styles.bucketHeader}>
                            <View style={styles.bucketTitleRow}>
                                <View style={styles.iconContainer}>
                                    <Target size={22} color={Colors.dark.rose[400]} />
                                </View>
                                <View>
                                    <Text style={styles.bucketTitle}>Our Bucket List</Text>
                                    <Text style={styles.bucketSubtitle}>DREAMS WE'LL CHASE TOGETHER</Text>
                                </View>
                            </View>

                            <View style={styles.progressContainer}>
                                <Svg width={48} height={48} viewBox="0 0 36 36" style={styles.progressSvg}>
                                    <Circle
                                        cx="18"
                                        cy="18"
                                        r="15.9155"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.05)"
                                        strokeWidth="3"
                                    />
                                    <Circle
                                        cx="18"
                                        cy="18"
                                        r="15.9155"
                                        fill="none"
                                        stroke={Colors.dark.rose[500]}
                                        strokeWidth="3"
                                        strokeDasharray={`${progress * 100}, 100`}
                                        strokeLinecap="round"
                                    />
                                </Svg>
                                <View style={styles.progressTextContainer}>
                                    <Text style={styles.progressCompleted}>{completedCount}</Text>
                                    <View style={styles.progressDivider} />
                                    <Text style={styles.progressTotal}>{totalCount}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.bucketBody}>
                            <View style={styles.inputBar}>
                                <TouchableOpacity
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setIsPrivate(!isPrivate);
                                    }}
                                    style={styles.privateToggle}
                                >
                                    {isPrivate ? <Lock size={18} color={Colors.dark.amber[400]} /> : <Unlock size={18} color="rgba(255,255,255,0.2)" />}
                                </TouchableOpacity>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder={isPrivate ? "Add a private dream..." : "Add a new shared dream..."}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={newItem}
                                    onChangeText={setNewItem}
                                    onSubmitEditing={handleAdd}
                                    returnKeyType="done"
                                />
                                <TouchableOpacity
                                    style={[styles.addBtn, !newItem.trim() && { opacity: 0.5 }]}
                                    onPress={handleAdd}
                                    disabled={isAdding || !newItem.trim()}
                                >
                                    <Plus size={20} color="white" />
                                </TouchableOpacity>
                            </View>

                            {filteredBucket.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.bucketItem,
                                        item.is_completed && styles.bucketItemCompleted
                                    ]}
                                    onPress={() => handleToggle(item.id, item.is_completed)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.checkbox, item.is_completed && styles.checkboxChecked]}>
                                        {item.is_completed && <Check size={12} color="white" strokeWidth={3} />}
                                    </View>

                                    <Text style={[styles.itemText, item.is_completed && styles.itemTextDone]}>
                                        {item.title}
                                    </Text>

                                    {item.is_completed && (
                                        <Trophy size={16} color={Colors.dark.amber[400]} style={styles.trophyIcon} />
                                    )}

                                    <TouchableOpacity
                                        onPress={() => handleDelete(item.id)}
                                        style={styles.deleteBtn}
                                    >
                                        <Trash2 size={16} color="rgba(255,255,255,0.15)" />
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </GlassCard>

                    <Text style={styles.sectionTitle}>MILESTONES</Text>
                    {MILESTONES.map((m) => (
                        <MilestoneCard
                            key={m.id}
                            id={m.id}
                            title={m.title}
                            description={m.description}
                            prompt={m.prompt}
                            icon={m.icon}
                            existingData={milestones?.[m.id]}
                        />
                    ))}
                </View>
            </Animated.ScrollView>
        </KeyboardAvoidingView>
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
        paddingTop: 100,
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    badgeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.dark.rose[500],
    },
    badgeText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    badgeCount: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
    },
    title: {
        fontSize: 56,
        color: Colors.dark.foreground,
        marginTop: Spacing.xs,
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
        width: '100%',
    },
    particle: {
        position: 'absolute',
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
    },
    bucketSection: {
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.xl,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.1)',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    bucketHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    bucketTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(225, 29, 72, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.1)',
    },
    bucketTitle: {
        color: 'white',
        fontSize: 20,
        fontFamily: Typography.serif,
        letterSpacing: -0.5,
    },
    bucketSubtitle: {
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
        marginTop: 2,
    },
    progressContainer: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressSvg: {
        transform: [{ rotate: '-90deg' }],
    },
    progressTextContainer: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressCompleted: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        lineHeight: 10,
    },
    progressDivider: {
        width: 8,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginVertical: 1,
    },
    progressTotal: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 7,
        fontFamily: Typography.sansBold,
        lineHeight: 8,
    },
    bucketBody: {
        padding: 16,
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingLeft: 12,
        paddingRight: 6,
        height: 52,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    privateToggle: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
    },
    textInput: {
        flex: 1,
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sans,
    },
    addBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: Colors.dark.rose[500],
        alignItems: 'center',
        justifyContent: 'center',
    },
    bucketItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 8,
        gap: 12,
    },
    bucketItemCompleted: {
        backgroundColor: 'rgba(225, 29, 72, 0.05)',
        borderColor: 'rgba(225, 29, 72, 0.1)',
        opacity: 0.7,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: Colors.dark.rose[500],
        borderColor: Colors.dark.rose[500],
        shadowColor: Colors.dark.rose[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
    },
    itemText: {
        flex: 1,
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sansBold,
    },
    itemTextDone: {
        color: 'rgba(255,255,255,0.3)',
        textDecorationLine: 'line-through',
    },
    trophyIcon: {
        opacity: 0.6,
    },
    deleteBtn: {
        padding: 4,
    },
    sectionTitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
        marginLeft: Spacing.md,
        marginBottom: Spacing.md,
    }
});
