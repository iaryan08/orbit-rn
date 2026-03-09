import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withTiming,
    useSharedValue,
    withSpring,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { X, Heart, Sparkles, Check, Plus, Trash2 } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { clearMood } from '../lib/auth';
import { Emoji } from './Emoji';
import { getTodayIST } from '../lib/utils';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DRAWER_HEIGHT = SCREEN_HEIGHT * 0.85;

const SUGGESTIONS = ['happy', 'loved', 'excited', 'calm', 'sad', 'tired', 'grateful', 'flirty', 'missing you badly', 'cuddly', 'romantic', 'passionate', 'craving you', 'playful'];

const MOOD_EMOJIS: Record<string, string> = {
    happy: '😊',
    loved: '🥰',
    excited: '🤩',
    calm: '😌',
    sad: '😢',
    tired: '😴',
    grateful: '🙏',
    flirty: '😉',
    'missing you badly': '🥹',
    cuddly: '🫂',
    romantic: '🌹',
    passionate: '❤️‍🔥',
    'craving you': '🔥',
    playful: '😈'
};


export function MoodLoggerDrawer() {
    const insets = useSafeAreaInsets();
    const { isMoodDrawerOpen, setMoodDrawerOpen, profile, moods } = useOrbitStore();

    const [selectedMood, setSelectedMood] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const translateY = useSharedValue(DRAWER_HEIGHT);

    React.useEffect(() => {
        if (isMoodDrawerOpen) {
            // High-Value: Pre-select today's vibe if it exists
            const today = getTodayIST();
            const currentMood = (moods || []).find(m => m.user_id === profile?.id && m.mood_date === today);
            if (currentMood) {
                setSelectedMood(currentMood.emoji);
                setNote(currentMood.mood_text || '');
            }

            translateY.value = withSpring(0, {
                damping: 20,
                stiffness: 150,
                overshootClamping: true
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            translateY.value = withSpring(SCREEN_HEIGHT, {
                damping: 20,
                stiffness: 150,
                overshootClamping: true
            });
        }
    }, [isMoodDrawerOpen]);

    const gesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (event.translationY > 100 || event.velocityY > 500) {
                runOnJS(setMoodDrawerOpen)(false);
            } else {
                translateY.value = withSpring(0, { damping: 20, stiffness: 150, overshootClamping: true });
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(translateY.value, [0, DRAWER_HEIGHT], [1, 0], Extrapolate.CLAMP),
    }));

    const handleSave = () => {
        if (!selectedMood || !profile?.id) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const { submitMoodOptimistic } = useOrbitStore.getState();
        submitMoodOptimistic(profile.id, selectedMood, note.trim());

        setMoodDrawerOpen(false);
        // Reset for next time
        setSelectedMood(null);
        setNote('');
    };

    const selectMood = (tag: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (selectedMood === tag) {
            setSelectedMood(null);
        } else {
            setSelectedMood(tag);
        }
    };

    const handleClearVibe = () => {
        if (!profile?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const { clearMoodOptimistic } = useOrbitStore.getState();
        clearMoodOptimistic(profile.id);
        setMoodDrawerOpen(false);
        setSelectedMood(null);
        setNote('');
    };

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents={isMoodDrawerOpen ? 'auto' : 'none'}>
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoodDrawerOpen(false)} />
            </Animated.View>

            <Animated.View style={[styles.drawer, animatedStyle, { height: DRAWER_HEIGHT + insets.bottom }]}>
                <View style={[StyleSheet.absoluteFill, styles.drawerBg]}>

                    <GestureDetector gesture={gesture}>
                        <View style={styles.handleWrapper}>
                            <View style={styles.handleContainer}>
                                <View style={styles.handle} />
                            </View>

                            <View style={styles.header}>
                                <View>
                                    <Text style={styles.title}>Update Mood</Text>
                                    <Text style={styles.subtitle}>SYNC YOUR VIBE WITH PARTNER</Text>
                                </View>
                                <TouchableOpacity onPress={() => setMoodDrawerOpen(false)} style={styles.closeBtn}>
                                    <X size={20} color="rgba(255,255,255,0.4)" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </GestureDetector>

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <Section title="CURRENT MOOD" icon={<Sparkles size={16} color={Colors.dark.indigo[400]} />}>
                            <View style={styles.tagGrid}>
                                {SUGGESTIONS.map(tag => {
                                    const isSelected = selectedMood === tag;
                                    return (
                                        <Pressable
                                            key={tag}
                                            onPress={() => selectMood(tag)}
                                            style={({ pressed }) => [
                                                styles.tag,
                                                isSelected && styles.tagSelected,
                                                { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
                                            ]}
                                        >
                                            <Emoji symbol={MOOD_EMOJIS[tag]} size={28} />
                                            <Text style={[styles.tagText, isSelected && styles.tagTextSelected]} numberOfLines={2}>
                                                {tag === 'missing you badly' ? 'Missing You' : tag.charAt(0).toUpperCase() + tag.slice(1)}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                                <TouchableOpacity
                                    style={[styles.tag, styles.tagPlaceholder]}
                                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                                >
                                    <Plus size={20} color="rgba(255,255,255,0.2)" />
                                    <Text style={styles.tagTextPlaceholder}>Custom</Text>
                                </TouchableOpacity>
                            </View>
                        </Section>

                        {selectedMood && (
                            <Section title="OPTIONAL NOTE" icon={<Heart size={16} color={Colors.dark.rose[400]} />}>
                                <View style={styles.noteContainer}>
                                    <TextInput
                                        style={styles.noteInput}
                                        placeholder="Add a little note..."
                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                        value={note}
                                        onChangeText={setNote}
                                        multiline
                                        maxLength={100}
                                    />
                                </View>
                            </Section>
                        )}

                        <TouchableOpacity
                            style={[styles.saveBtn, !selectedMood && styles.saveBtnDisabled]}
                            onPress={handleSave}
                            disabled={!selectedMood}
                        >
                            <>
                                <Check size={20} color="white" />
                                <Text style={styles.saveBtnText}>SHARE VIBE</Text>
                            </>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.clearBtn} onPress={handleClearVibe}>
                            <Trash2 size={14} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.clearBtnText}>REMOVE MOOD</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Animated.View>
        </View>
    );
}

function Section({ title, icon, children }: any) {
    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                {icon}
                <Text style={styles.sectionTitle}>{title}</Text>
            </View>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)' },
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
        zIndex: 9999
    },
    drawerBg: {
        backgroundColor: 'rgba(10,10,20,0.95)',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    handleWrapper: {
        backgroundColor: 'transparent',
    },
    handleContainer: { height: 32, alignItems: 'center', justifyContent: 'center' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
    header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20 },
    title: { fontSize: 28, fontFamily: Typography.serif, color: 'white' },
    subtitle: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginTop: 4 },
    closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 60 },
    section: { marginBottom: 32 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    sectionTitle: { fontSize: 11, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 },
    tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
    tag: { width: '31.5%', height: 94, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', gap: 4, paddingHorizontal: 4, marginBottom: 8 },
    tagSelected: { backgroundColor: Colors.dark.indigo[400] + '20', borderColor: Colors.dark.indigo[400] },
    tagPlaceholder: { borderStyle: 'dashed', backgroundColor: 'transparent' },
    tagEmoji: { fontSize: 28 },
    tagText: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, textAlign: 'center' },
    tagTextSelected: { color: Colors.dark.indigo[400] },
    tagTextPlaceholder: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5, marginTop: 2 },
    noteContainer: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 },
    noteInput: { color: 'white', fontSize: 15, fontFamily: Typography.serifItalic, minHeight: 60, textAlignVertical: 'top' },
    saveBtn: { height: 64, borderRadius: 32, backgroundColor: Colors.dark.indigo[400], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    saveBtnDisabled: { opacity: 0.5, backgroundColor: 'rgba(255,255,255,0.05)', shadowOpacity: 0 },
    saveBtnText: { color: 'white', fontFamily: Typography.sansBold, fontSize: 15, letterSpacing: 2 },
    clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, opacity: 0.6 },
    clearBtnText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 1.5 }
});
