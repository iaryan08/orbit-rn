import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity,
    FlatList, Keyboard, Dimensions, Modal
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, Easing
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Search, X, LayoutDashboard, Mail, Image as ImageIcon,
    Flame, Settings, Moon, Sparkles, Heart, BellRing, Compass, Shield,
    BookOpen, Camera, Calendar, ChevronRight, Zap, Layers
} from 'lucide-react-native';

import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../lib/store';
import { Emoji } from './Emoji';
import { Typography, Spacing } from '../constants/Theme';
import { ANIM_FADE_IN, ANIM_FADE_OUT } from '../constants/Animation';
import { format } from 'date-fns';

const { width } = Dimensions.get('window');

// ─── Static Registry (screens / modes / actions) ─────────────────────────────

const STATIC_ITEMS = [
    {
        id: 'dashboard', title: 'Dashboard', subtitle: 'Your private orbit space',
        icon: LayoutDashboard, iconColor: '#f43f5e', group: 'Screens',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(1, 'tap'); },
        keywords: ['home', 'main', 'orbit', 'dashboard', 'space'],
    },
    {
        id: 'letters', title: 'Letters', subtitle: 'Write & read messages',
        icon: Mail, iconColor: '#f59e0b', group: 'Screens',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(2, 'tap'); },
        keywords: ['letters', 'messages', 'mail', 'write', 'notes', 'inbox'],
    },
    {
        id: 'memories', title: 'Memories', subtitle: 'Photos & polaroids',
        icon: ImageIcon, iconColor: '#34d399', group: 'Screens',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(3, 'tap'); },
        keywords: ['memories', 'photos', 'gallery', 'polaroid', 'pictures'],
    },
    {
        id: 'intimacy', title: 'Intimacy', subtitle: 'Milestones & closeness',
        icon: Flame, iconColor: '#fb923c', group: 'Screens',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(4, 'tap'); },
        keywords: ['intimacy', 'flame', 'milestones', 'closeness', 'romance', 'timeline'],
    },
    {
        id: 'partner_screen', title: 'Partner', subtitle: 'Connections, libido & calendar',
        icon: Heart, iconColor: '#f43f5e', group: 'Screens',
        action: (s: any) => { s.setAppMode('lunara'); s.setTabIndex(5, 'tap'); },
        keywords: ['partner', 'connections', 'libido', 'drive', 'calendar', 'rhythm'],
    },
    {
        id: 'settings', title: 'Settings', subtitle: 'Profile, atmosphere, security',
        icon: Settings, iconColor: '#94a3b8', group: 'Screens',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(9, 'tap'); },
        keywords: ['settings', 'profile', 'account', 'wallpaper', 'atmosphere'],
    },
    {
        id: 'lunara_screen', title: 'Lunara', subtitle: 'Cycle & rhythm dashboard',
        icon: Moon, iconColor: '#a855f7', group: 'Screens',
        action: (s: any) => { s.setAppMode('lunara'); s.setTabIndex(5, 'tap'); },
        keywords: ['lunara', 'cycle', 'period', 'rhythm', 'tracking'],
    },
    {
        id: 'mode_lunara', title: 'Switch to Lunara Mode', subtitle: 'Purple theme + cycle tracking',
        icon: Moon, iconColor: '#a855f7', group: 'Modes',
        action: (s: any) => { s.setAppMode('lunara'); s.setTabIndex(5, 'tap'); },
        keywords: ['lunara mode', 'purple', 'cycle', 'switch'],
    },
    {
        id: 'mode_moon', title: 'Switch to Moon Mode', subtitle: 'Rose romantic theme',
        icon: Heart, iconColor: '#f43f5e', group: 'Modes',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(1, 'tap'); },
        keywords: ['moon mode', 'rose', 'romantic', 'switch'],
    },
    {
        id: 'notifications', title: 'Notifications', subtitle: 'Open notification drawer',
        icon: BellRing, iconColor: '#60a5fa', group: 'Actions',
        action: (s: any) => s.setNotificationDrawerOpen(true),
        keywords: ['notifications', 'alerts', 'bell', 'updates'],
    },
    {
        id: 'partner_nav', title: 'Partner (Lunara)', subtitle: 'Switch dock to Lunara 3-icon layout',
        icon: Sparkles, iconColor: '#c084fc', group: 'Actions',
        action: (s: any) => { s.setAppMode('lunara'); s.setTabIndex(5, 'tap'); },
        keywords: ['partner', 'spark', 'lunara dock', 'three icons'],
    },
    {
        id: 'intimacy_nav', title: 'Intimacy (Moon)', subtitle: 'Switch dock back to Moon layout',
        icon: Flame, iconColor: '#fb923c', group: 'Actions',
        action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(4, 'tap'); },
        keywords: ['intimacy moon', 'moon dock', 'four icons', 'flame'],
    },
];

// ─── Dynamic Results Builder ──────────────────────────────────────────────────

function buildDynamicItems(memories: any[], letters: any[], milestones: any) {
    const items: any[] = [];

    // --- Memories ---
    (memories || []).forEach((m) => {
        const dateStr = m.created_at?.toDate
            ? format(m.created_at.toDate(), 'MMM d, yyyy')
            : '';
        items.push({
            id: `memory_${m.id}`,
            title: m.title || 'Untitled Memory',
            subtitle: `📁¸ Memory · ${dateStr}${m.description ? ' · ' + m.description.slice(0, 40) : ''}`,
            icon: Camera,
            iconColor: '#34d399',
            group: 'Memories',
            action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(3, 'tap'); },
            keywords: [
                'memory', 'photo',
                (m.title || '').toLowerCase(),
                (m.description || '').toLowerCase(),
                dateStr.toLowerCase(),
            ],
        });
    });

    // --- Letters ---
    (letters || []).forEach((l) => {
        const dateStr = l.created_at?.toDate
            ? format(l.created_at.toDate(), 'MMM d, yyyy')
            : '';
        const preview = (l.content || '').slice(0, 60);
        items.push({
            id: `letter_${l.id}`,
            title: preview || 'Letter',
            subtitle: `âœ‰ï¸ Letter · ${dateStr}`,
            icon: Mail,
            iconColor: '#f59e0b',
            group: 'Letters',
            action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(2, 'tap'); },
            keywords: [
                'letter', 'message',
                (l.content || '').toLowerCase(),
                dateStr.toLowerCase(),
            ],
        });
    });

    // --- Milestones ---
    const msEntries = Object.entries(milestones || {});
    msEntries.forEach(([key, val]: any) => {
        if (!val) return;
        items.push({
            id: `milestone_${key}`,
            title: val.title || key,
            subtitle: `â¤ï¸ Milestone · ${val.date ? format(new Date(val.date), 'MMM d, yyyy') : ''}${val.my_note ? ' · ' + val.my_note.slice(0, 40) : ''}`,
            icon: Zap,
            iconColor: '#fb923c',
            group: 'Intimacy',
            action: (s: any) => { s.setAppMode('moon'); s.setTabIndex(4, 'tap'); },
            keywords: [
                'milestone', 'intimacy', 'moment',
                (val.title || key).toLowerCase(),
                (val.my_note || '').toLowerCase(),
                (val.partner_note || '').toLowerCase(),
                (val.date || '').toLowerCase(),
            ],
        });
    });

    return items;
}

// Helper to render text with custom emojis
// Helper to render text with custom emojis - Optimized with Memoization
const EmojiText = React.memo(({ text, style }: { text: string; style: any }) => {
    if (!text) return null;

    const parts = useMemo(() => {
        return text.split(/(\u2705|\u2708\uFE0F|\u2709\uFE0F|\u270B|\u270C|\u270D|\u270F\uFE0F|\u2712\uFE0F|\u2714\uFE0F|\u2716\uFE0F|\u2728|\u2733\uFE0F|\u2734\uFE0F|\u2744\uFE0F|\u2747\uFE0F|\u274C|\u274E|\u2753|\u2754|\u2755|\u2757|\u2763\uFE0F|\u2764\uFE0F|\u27A1\uFE0F|\u27B0|\u27BF|\u2934\uFE0F|\u2935\uFE0F|\u2B05\uFE0F|\u2B06\uFE0F|\u2B07\uFE0F|\u2B1B|\u2B1C|\u2B50|\u2B55|\u3030\uFE0F|\u303D\uFE0F|\u3297\uFE0F|\u3299\uFE0F|[\uD83C-\uD83E][\uDC00-\uDFFF])/);
    }, [text]);

    return (
        <Text style={style} numberOfLines={1}>
            {parts.map((part, i) => {
                if (part.match(/[\u2700-\u27BF]|[\uD83C-\uD83E][\uDC00-\uDFFF]/)) {
                    return <Emoji key={i} symbol={part} size={style.fontSize || 13} />;
                }
                return <Text key={i}>{part}</Text>;
            })}
        </Text>
    );
});

// ─── Component ────────────────────────────────────────────────────────────────

export function SearchPalette() {
    const isSearchOpen = useOrbitStore(s => s.isSearchOpen);
    const setSearchOpen = useOrbitStore(s => s.setSearchOpen);
    const toggleTabListener = useOrbitStore(s => s.toggleTabListener);
    const memories = useOrbitStore(s => s.memories);
    const letters = useOrbitStore(s => s.letters);
    const milestones = useOrbitStore(s => s.milestones);
    const insets = useSafeAreaInsets();

    // ðŸš€ Phase 7: Selective Listener Lifecycle for Search
    useEffect(() => {
        if (isSearchOpen) {
            // Search needs a broad view of data to be effective
            toggleTabListener('dashboard', true);
        } else {
            // Note: We don't disable here because the underlying screen 
            // will manage its own listeners via isActive prop.
        }
    }, [isSearchOpen, toggleTabListener]);

    const inputRef = useRef<TextInput>(null);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [query, setQuery] = useState('');

    // Build dynamic items from store data (memoized)
    const dynamicItems = useMemo(
        () => buildDynamicItems(memories, letters, milestones),
        [memories, letters, milestones]
    );
    const allItems = useMemo(() => [...STATIC_ITEMS, ...dynamicItems], [dynamicItems]);

    const results = useMemo(() => {
        if (!query.trim()) return STATIC_ITEMS; // show static by default
        const q = query.toLowerCase();
        return allItems.filter(item =>
            item.title.toLowerCase().includes(q) ||
            item.subtitle.toLowerCase().includes(q) ||
            item.keywords.some((k: string) => k.includes(q))
        );
    }, [query, allItems]);

    // ─── Animation: NO spring \u2014 use withTiming for instant stable open ──────────
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(-16);

    const show = () => {
        opacity.value = withTiming(1, ANIM_FADE_IN);
        translateY.value = withTiming(0, ANIM_FADE_IN);

        // Force immediate focus without waiting for transition
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
    };

    const hide = useCallback(() => {
        opacity.value = withTiming(0, ANIM_FADE_OUT);
        translateY.value = withTiming(-10, ANIM_FADE_OUT);
        Keyboard.dismiss();
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = setTimeout(() => {
            setSearchOpen(false);
            setQuery('');
        }, ANIM_FADE_OUT.duration + 10);
    }, [opacity, setSearchOpen, translateY]);

    useEffect(() => {
        if (isSearchOpen) show();
    }, [isSearchOpen]);

    useEffect(() => {
        return () => {
            if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        };
    }, []);

    const panelStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const lastNav = useRef(0);

    const handleSelect = (item: any) => {
        const now = Date.now();
        if (now - lastNav.current < 500) return; // Debounce fast selection
        lastNav.current = now;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        item.action(useOrbitStore.getState());
        hide();
    };

    if (!isSearchOpen) return null;

    // Group results by 'group' field
    const grouped: Record<string, any[]> = {};
    results.forEach(item => {
        const g = item.group || 'Other';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(item);
    });

    const flatData: any[] = [];
    Object.entries(grouped).forEach(([group, items]) => {
        flatData.push({ type: 'header', id: `h_${group}`, label: group });
        items.forEach(i => flatData.push({ type: 'item', ...i }));
    });

    return (
        <Modal transparent animationType="none" statusBarTranslucent onRequestClose={hide}>
            {/* Backdrop */}
            <Animated.View style={[styles.backdrop, backdropStyle]}>
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={hide} activeOpacity={1} />
            </Animated.View>

            {/* Panel */}
            <Animated.View style={[styles.panel, { top: insets.top + 12 }, panelStyle]} pointerEvents="box-none">
                <View style={[styles.panelInner, { backgroundColor: 'rgba(12, 12, 14, 0.94)', borderBottomLeftRadius: 32, borderBottomRightRadius: 32 }]}>
                    {/* Input Row */}
                    <View style={styles.inputRow}>
                        <Search size={17} color="rgba(255,255,255,0.4)" />
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            placeholder="Search screens, memories, letters..."
                            placeholderTextColor="rgba(255,255,255,0.22)"
                            value={query}
                            onChangeText={setQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                            returnKeyType="search"
                            selectionColor="rgba(168,85,247,0.6)"
                            autoFocus={true}
                        />
                        {query.length > 0 ? (
                            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <X size={16} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={hide} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <X size={16} color="rgba(255,255,255,0.25)" />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.divider} />

                    {/* Results */}
                    <FlatList
                        data={flatData}
                        keyExtractor={i => i.id}
                        style={styles.list}
                        contentContainerStyle={{ paddingBottom: 8 }}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Text style={styles.emptyText}>No results for "{query}"</Text>
                            </View>
                        }
                        renderItem={({ item }) => {
                            if (item.type === 'header') {
                                return <Text style={styles.groupHeader}>{item.label}</Text>;
                            }
                            const Icon = item.icon;
                            return (
                                <TouchableOpacity style={styles.row} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                                    <View style={[styles.iconBox, { backgroundColor: item.iconColor + '20' }]}>
                                        <Icon size={15} color={item.iconColor} />
                                    </View>
                                    <View style={styles.rowText}>
                                        <EmojiText style={styles.rowTitle} text={item.title} />
                                        <EmojiText style={styles.rowSub} text={item.subtitle} />
                                    </View>
                                    <ChevronRight size={13} color="rgba(255,255,255,0.15)" />
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </Animated.View>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
        zIndex: 200,
    },
    panel: {
        position: 'absolute',
        left: 16, right: 16,
        zIndex: 201,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        maxHeight: 500,
    },
    panelInner: {
        flex: 1,
        backgroundColor: 'rgba(10,10,20,0.6)',
    },

    // Input
    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    },
    input: {
        flex: 1, fontSize: 14,
        fontFamily: Typography.sans,
        color: 'white', padding: 0,
    },
    escBadge: {
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 5, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    escText: {
        fontSize: 12, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5,
    },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },

    // List
    list: { maxHeight: 440 },
    groupHeader: {
        fontSize: 13, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.22)',
        letterSpacing: 1.5, textTransform: 'uppercase',
        paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
    },
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 9, gap: 10,
    },
    iconBox: {
        width: 32, height: 32, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowTitle: {
        fontSize: 13, fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.88)',
    },
    rowSub: {
        fontSize: 14, fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.55)', marginTop: 1,
    },

    // Empty
    empty: { paddingVertical: 28, alignItems: 'center' },
    emptyText: {
        fontSize: 13, fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.22)',
    },
});
