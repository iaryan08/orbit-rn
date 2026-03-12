import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { Flame } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { useOrbitStore } from '../../lib/store';

import { MilestoneCard } from '../MilestoneCard';
import { Heart, Sparkles, MapPin, Camera, Music, Gift, Coffee, Star, Plus, Check, Trash2, ChevronDown, ChevronUp, Trophy, Target, Lock, Unlock, MessageSquare, Waves, Moon, Infinity, CloudMoon, Home, Film, HeartPulse } from 'lucide-react-native';
import { addBucketItem } from '../../lib/auth';
import { TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';

// Local milestone configurations

const MILESTONES = [
    { id: 'first_talk', title: 'First Talk', description: 'The Beginning', prompt: 'When was the first talk?', icon: <MessageSquare size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_hug', title: 'First Hug', description: 'Warm Embrace', prompt: 'First meaningful hug?', icon: <Heart size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_kiss', title: 'First Kiss', description: 'That Magic', prompt: 'How did the first kiss begin?', icon: <Heart size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_french_kiss', title: 'First French Kiss', description: 'The Spark', prompt: 'First deep kiss?', icon: <Flame size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_sex', title: 'First Sex', description: 'Pure Connection', prompt: 'First encounter?', icon: <Sparkles size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_oral', title: 'First Oral Sex', description: 'Shared Pleasure', prompt: 'When was this shared?', icon: <Waves size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_time_together', title: 'First Bedtime', description: 'Sweet Dreams', prompt: 'First night together?', icon: <Moon size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_surprise', title: 'First Surprise', description: 'Little Moments', prompt: 'First intimate surprise?', icon: <Gift size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_memory', title: 'First Memory', description: 'Core Memory', prompt: 'A favorite early memory?', icon: <Camera size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_confession', title: 'First Confession', description: 'Open Hearts', prompt: 'What was the first secret?', icon: <Unlock size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_promise', title: 'First Promise', description: 'Eternal Word', prompt: 'First meaningful promise?', icon: <Infinity size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_night_together', title: 'First Night Apart', description: 'Missing You', prompt: 'How was the first night apart?', icon: <CloudMoon size={22} color={Colors.dark.indigo[400]} /> },
    { id: 'first_time_alone', title: 'First Time Alone', description: 'Our Space', prompt: 'First private evening with your partner?', icon: <Home size={22} color={Colors.dark.rose[500]} /> },
    { id: 'first_movie_date', title: 'First Movie Date', description: 'Reel Love', prompt: 'First movie date with your partner?', icon: <Film size={22} color={Colors.dark.amber[400]} /> },
    { id: 'first_intimate_moment', title: 'First Intimate Moment', description: 'Romantic Spark', prompt: 'First romantic expression to your partner?', icon: <HeartPulse size={22} color={Colors.dark.indigo[400]} /> },
];

export function IntimacyScreen({ isActive = true }: { isActive?: boolean }) {
    const insets = useSafeAreaInsets();
    const { milestones, bucketList, profile } = useOrbitStore();
    const isAndroidPerformanceMode = Platform.OS === 'android';

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

    const completedCount = filteredBucket.filter(i => i.is_completed).length;
    const totalCount = filteredBucket.length;
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount);

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        if (isAdding) return;
        const title = newItem.trim();
        setIsAdding(true);
        const result = await addBucketItem(title, '', isPrivate);
        setIsAdding(false);
        if (result?.error) {
            Alert.alert('Could not add item', result.error);
            return;
        }
        setNewItem('');
        setIsPrivate(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleToggle = (id: string, completed: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const { updateBucketItemOptimistic } = useOrbitStore.getState();
        updateBucketItemOptimistic(id, !completed);
    };

    const handleDelete = (id: string) => {
        Alert.alert(
            "Remove Dream?",
            "This will remove this item from your shared bucket list.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        const { deleteBucketItemOptimistic } = useOrbitStore.getState();
                        deleteBucketItemOptimistic(id);
                    }
                }
            ]
        );
    };

    // Morphing: Title fades and scales down (Further Delayed for Premium Dominance)
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [80, 130], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [80, 130], [1, 0.9], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [60, 110], [1, 0], Extrapolate.CLAMP),
    }));

    // Morphing: HeaderPill fades and slides in (Precise sync with title exit)
    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [120, 160], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [120, 160], [8, 0], Extrapolate.CLAMP) }]
    }));

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            {/* Sticky Header Pill */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, !isAndroidPerformanceMode && headerPillStyle]}>
                <HeaderPill title="Intimacy" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                onScroll={isAndroidPerformanceMode ? undefined : scrollHandler}
                scrollEventThrottle={32}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                removeClippedSubviews={isAndroidPerformanceMode}
            >
                <View style={styles.standardHeader}>
                    <Animated.Text style={[styles.standardTitle, !isAndroidPerformanceMode && titleAnimatedStyle]}>Intimacy</Animated.Text>
                    <Animated.Text style={[styles.standardSubtitle, !isAndroidPerformanceMode && sublineAnimatedStyle]}>Precious · Milestones</Animated.Text>
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
                                    <Text style={styles.bucketSubtitle}>Dreams We'll Chase Together</Text>
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
                                    style={[styles.privateToggle, isPrivate && styles.privateToggleActive]}
                                >
                                    {isPrivate ? <Lock size={18} color={Colors.dark.rose[500]} /> : <Unlock size={18} color="rgba(255,255,255,0.4)" />}
                                </TouchableOpacity>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Add to our bucket list..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={newItem}
                                    onChangeText={setNewItem}
                                    selectionColor={Colors.dark.rose[500]}
                                    onSubmitEditing={handleAdd}
                                />
                                <TouchableOpacity
                                    style={[styles.addBtn, !newItem.trim() && { opacity: 0.5 }]}
                                    onPress={handleAdd}
                                    disabled={!newItem.trim() || isAdding}
                                >
                                    <Plus size={20} color="white" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.bucketListContainer}>
                                {filteredBucket.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        onPress={() => handleToggle(item.id, item.is_completed)}
                                        style={({ pressed }) => [
                                            styles.bucketItem,
                                            item.is_completed && styles.bucketItemCompleted,
                                            { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                                        ]}
                                    >
                                        <View style={[styles.itemCheck, item.is_completed && styles.itemCheckActive]}>
                                            {item.is_completed && <Check size={12} color="white" strokeWidth={3} />}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemTitle, item.is_completed && styles.itemTitleCompleted]}>
                                                {item.title}
                                            </Text>
                                        </View>
                                        {item.is_completed && <Trophy size={16} color={Colors.dark.amber[400]} style={{ opacity: 0.8 }} />}
                                        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                                            <Trash2 size={16} color="rgba(255,255,255,0.2)" />
                                        </TouchableOpacity>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </GlassCard>

                    <Text style={styles.sectionTitle}>Milestones</Text>
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
    standardHeader: GlobalStyles.standardHeader,
    headerTitleContainer: {
        paddingHorizontal: Spacing.md,
        paddingTop: 20,
        paddingBottom: 2,
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
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
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
        backgroundColor: 'rgba(225, 29, 72, 0.03)',
        borderRadius: 24,
        paddingLeft: 12,
        paddingRight: 6,
        height: 52,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(225, 29, 72, 0.15)',
        shadowColor: Colors.dark.rose[500],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    privateToggle: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 4,
    },
    privateToggleActive: {
        backgroundColor: 'rgba(225, 29, 72, 0.1)',
        borderColor: 'rgba(225, 29, 72, 0.2)',
        borderWidth: 1,
    },
    input: {
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
    bucketListContainer: {
        marginTop: 8,
    },
    bucketItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 100,
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
    itemCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemCheckActive: {
        backgroundColor: Colors.dark.rose[500],
        borderColor: Colors.dark.rose[500],
        shadowColor: Colors.dark.rose[500],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
    },
    itemTitle: {
        flex: 1,
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sansBold,
    },
    itemTitleCompleted: {
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
