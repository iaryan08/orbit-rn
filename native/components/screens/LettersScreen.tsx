import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Modal, TextInput, Switch, ScrollView, KeyboardAvoidingView, Platform, Pressable, RefreshControl } from 'react-native';
import { useOrbitStore } from '../../lib/store';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { Mail, MailOpen, Sparkles, X, Send, EyeOff, Calendar, Clock, ChevronDown } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { FlashList } from '@shopify/flash-list';
import { getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';

const { width } = Dimensions.get('window');
const AnimatedFlashList = Animated.createAnimatedComponent<any>(FlashList);

export function LettersScreen() {
    const { profile, partnerProfile, letters, couple } = useOrbitStore();
    const insets = useSafeAreaInsets();
    const partnerName = getPartnerName(profile, partnerProfile);

    const [selectedLetter, setSelectedLetter] = useState<any>(null);
    const [isComposeVisible, setIsComposeVisible] = useState(false);
    const [isVanishMode, setIsVanishMode] = useState(false);
    const [isScheduled, setIsScheduled] = useState(false);
    const [deliveryDelay, setDeliveryDelay] = useState<number | null>(null); // in hours
    const [customDeliveryDate, setCustomDeliveryDate] = useState<Date | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async () => {
        if (!profile?.id) return;
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const { fetchData } = useOrbitStore.getState();
            await fetchData(profile.id);
        } finally {
            setRefreshing(false);
        }
    }, [profile?.id]);

    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    const DELAY_OPTIONS = [
        { label: 'Soon (1h)', value: 1, icon: <Clock size={14} color="white" /> },
        { label: 'Tomorrow', value: 24, icon: <Calendar size={14} color="white" /> },
        { label: '3 Days', value: 72, icon: <Sparkles size={14} color="white" /> },
        { label: 'Pick Date', value: -1, icon: <Calendar size={14} color="white" /> },
    ];

    const CUSTOM_DATES = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i + 1);
        d.setHours(12, 0, 0, 0); // Default to noon
        return d;
    });

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [85, 125], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [85, 125], [1, 0.95], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [105, 135], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [105, 135], [10, 0], Extrapolate.CLAMP) }]
    }));

    const renderItem = useCallback(({ item }: { item: any }) => {
        const isRead = item.is_read;
        const pName = getPartnerName(profile, partnerProfile);
        const sName = item.sender_id === profile?.id ? 'You' : pName;

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cardWrapper}
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedLetter(item);

                    // Mark as read if it's from partner and unread
                    if (item.sender_id !== profile?.id && !item.is_read) {
                        const letterRef = doc(db, 'couples', couple?.id, 'letters', item.id);
                        updateDoc(letterRef, { is_read: true }).catch(err => console.error("Error marking letter read:", err));
                    }
                }}
            >
                <GlassCard style={[styles.letterCard, !isRead && styles.unreadBorder]} intensity={10}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: 12 }}>
                        <View style={[
                            styles.iconContainer,
                            isRead ? styles.readIconBg : styles.unreadIconBg
                        ]}>
                            {isRead ? (
                                <MailOpen size={16} color={Colors.dark.mutedForeground} />
                            ) : (
                                <Mail size={16} color={Colors.dark.rose[400]} />
                            )}
                        </View>
                        <Text style={styles.letterTitle} numberOfLines={1}>
                            {item.title || "Untitled Letter"}
                        </Text>
                    </View>
                    <Text style={styles.letterPreview} numberOfLines={3}>
                        "{item.content}"
                    </Text>
                    <View style={styles.cardFooter}>
                        <View style={styles.footerRow}>
                            <Text style={styles.footerLabel}>FROM</Text>
                            <Text style={styles.footerValue}>{sName}</Text>
                        </View>
                        <View style={styles.footerRow}>
                            <Text style={styles.footerLabel}>DATE</Text>
                            <Text style={styles.footerValueDate}>
                                {item.created_at?.toDate ? item.created_at.toDate().toLocaleDateString() : (typeof item.created_at === 'number' ? new Date(item.created_at).toLocaleDateString() : 'Recent')}
                            </Text>
                        </View>
                    </View>
                </GlassCard>
            </TouchableOpacity>
        );
    }, [profile, partnerProfile]);

    const handleSend = async () => {
        if (!content.trim() || !profile?.id || !couple?.id) return;

        try {
            const lettersRef = collection(db, 'couples', couple?.id, 'letters');

            const deliveryDelayMs = (customDeliveryDate ? customDeliveryDate.getTime() - Date.now() : (deliveryDelay || 0) * 60 * 60 * 1000);
            const scheduledDeliveryTime = isScheduled ? Date.now() + deliveryDelayMs : null;

            const letterData = {
                content: content.trim(),
                title: title.trim() || 'Untitled Letter',
                sender_id: profile.id,
                receiver_id: partnerProfile?.id || '',
                created_at: serverTimestamp(),
                is_read: false,
                is_vanish: isVanishMode,
                is_scheduled: isScheduled,
                scheduled_delivery_time: scheduledDeliveryTime,
            };

            await addDoc(lettersRef, letterData);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsComposeVisible(false);
            setTitle('');
            setContent('');
            setIsVanishMode(false);
            setIsScheduled(false);
            setDeliveryDelay(null);
        } catch (error) {
            console.error("Error sending letter:", error);
        }
    };

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Letters" scrollOffset={scrollOffset} count={letters?.length} />
            </Animated.View>

            <AnimatedFlashList
                data={letters as any}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={180}
                contentContainerStyle={[styles.listContent, { paddingTop: insets.top + Spacing.lg }]}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="white"
                        colors={[Colors.dark.rose[400]]}
                        progressViewOffset={insets.top + 20}
                    />
                }
                ListHeaderComponent={
                    <View style={styles.pageHeader}>
                        <Animated.View style={[styles.badgeRow, sublineAnimatedStyle]}>
                            <View style={styles.badgeDot} />
                            <Text style={styles.badgeText}>SHARED CORRESPONDENCE</Text>
                            <Text style={styles.badgeCount}>{letters ? letters.length : 0}</Text>
                        </Animated.View>
                        <Animated.Text style={[styles.headerTitle, titleAnimatedStyle]}>Letters</Animated.Text>
                        <Animated.Text style={[styles.headerSubtitle, sublineAnimatedStyle]}>Bridge the Distance</Animated.Text>

                        {letters && letters.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(200)} style={styles.featuredContainer}>
                                <GlassCard style={styles.featuredCard} intensity={10}>
                                    <View style={styles.featuredTag}>
                                        <Text style={styles.featuredTagText}>NEWEST MESSAGE</Text>
                                    </View>
                                    <Text style={styles.featuredLetterSubtitle}>"{letters[0].content}"</Text>
                                    <View style={styles.featuredFooter}>
                                        <Text style={styles.featuredFrom}>FROM {letters[0].sender_id === profile?.id ? 'YOU' : partnerName.toUpperCase()}</Text>
                                        <TouchableOpacity
                                            style={styles.featuredBtn}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setSelectedLetter(letters[0]);
                                            }}
                                        >
                                            <Text style={styles.featuredBtnText}>READ FULL</Text>
                                        </TouchableOpacity>
                                    </View>
                                </GlassCard>
                            </Animated.View>
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <GlassCard style={styles.emptyCard} intensity={10}>
                            <View style={{ alignItems: 'center' }}>
                                <Mail size={40} color="rgba(255,255,255,0.08)" style={{ marginBottom: 24 }} />
                                <Text style={styles.emptyTitle}>The shared path is quiet</Text>
                                <Text style={styles.emptySubtext}>
                                    Your shared space is waiting for its first letter. Bridge the distance with a heartfelt message.
                                </Text>
                            </View>
                        </GlassCard>
                    </View>
                }
            />

            <Modal
                visible={!!selectedLetter}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setSelectedLetter(null)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View style={styles.modalBlur} />
                    <Animated.View entering={ZoomIn} style={styles.modalContent}>
                        <GlassCard style={styles.viewerCard} intensity={10}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setSelectedLetter(null)} style={styles.closeBtn}>
                                    <X size={24} color="white" />
                                </TouchableOpacity>
                                <Text style={styles.modalLabel}>CORRESPONDENCE</Text>
                                <View style={{ width: 44 }} />
                            </View>
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.viewerScroll}>
                                <Text style={styles.viewerTitle}>{selectedLetter?.title || "Untitled"}</Text>
                                <View style={styles.viewerDivider} />
                                <Text style={styles.viewerContent}>{selectedLetter?.content}</Text>
                                <View style={styles.viewerFooter}>
                                    <Text style={styles.viewerAuthor}>— {selectedLetter?.sender_id === profile?.id ? 'You' : partnerName}</Text>
                                </View>
                            </ScrollView>
                        </GlassCard>
                    </Animated.View>
                </View>
            </Modal>

            <Modal
                visible={isComposeVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsComposeVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <Animated.View entering={ZoomIn} style={styles.modalContent}>
                        <GlassCard style={styles.composerCard} contentStyle={{ flex: 1 }} intensity={10}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={() => setIsComposeVisible(false)} style={styles.closeBtn}>
                                    <X size={24} color="white" />
                                </TouchableOpacity>
                                <Text style={styles.modalLabel}>COMPOSE</Text>
                                <TouchableOpacity
                                    onPress={handleSend}
                                    style={styles.sendBtn}
                                >
                                    <Send size={20} color="white" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.composerBody}>
                                <ScrollView
                                    style={styles.composerScroll}
                                    contentContainerStyle={styles.composerScrollContent}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    <TextInput
                                        style={styles.titleInput}
                                        placeholder="Title of your heart..."
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={title}
                                        onChangeText={setTitle}
                                        selectionColor={Colors.dark.rose[400]}
                                        autoFocus
                                    />
                                    <View style={styles.contentInputWrapper}>
                                        <TextInput
                                            style={styles.contentInput}
                                            placeholder="Begin your letter..."
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            multiline
                                            value={content}
                                            onChangeText={setContent}
                                            blurOnSubmit={false}
                                            selectionColor={Colors.dark.rose[400]}
                                            textAlignVertical="top"
                                        />
                                    </View>
                                </ScrollView>

                                <View style={styles.composerFooter}>
                                    <TouchableOpacity
                                        style={styles.optionsToggle}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            setIsOptionsExpanded(!isOptionsExpanded);
                                        }}
                                    >
                                        <View style={styles.optionsToggleHeader}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Sparkles size={14} color={Colors.dark.rose[400]} />
                                                <Text style={styles.optionsToggleTitle}>LETTER SETTINGS</Text>
                                            </View>
                                            <Animated.View style={{ transform: [{ rotate: isOptionsExpanded ? '180deg' : '0deg' }] }}>
                                                <ChevronDown size={18} color="rgba(255,255,255,0.4)" />
                                            </Animated.View>
                                        </View>
                                    </TouchableOpacity>

                                    {isOptionsExpanded && (
                                        <Animated.View entering={FadeInDown} style={styles.expandedOptions}>
                                            <View style={styles.controlRow}>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                        <View style={[styles.optionIconBox, isVanishMode && styles.activeIconBox]}>
                                                            <EyeOff size={16} color={isVanishMode ? 'white' : 'rgba(255,255,255,0.4)'} />
                                                        </View>
                                                        <View>
                                                            <Text style={styles.controlTitle}>Vanish Mode</Text>
                                                            <Text style={styles.controlDesc}>Self-destructs after opening</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <Switch
                                                    value={isVanishMode}
                                                    onValueChange={setIsVanishMode}
                                                    trackColor={{ false: '#333', true: Colors.dark.rose[900] }}
                                                    thumbColor={isVanishMode ? Colors.dark.rose[400] : '#666'}
                                                />
                                            </View>

                                            <View style={[styles.controlRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }]}>
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                        <View style={[styles.optionIconBox, isScheduled && styles.activeIconBox]}>
                                                            <Calendar size={16} color={isScheduled ? 'white' : 'rgba(255,255,255,0.4)'} />
                                                        </View>
                                                        <View>
                                                            <Text style={styles.controlTitle}>Future Delivery</Text>
                                                            <Text style={styles.controlDesc}>Surprise them later</Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <Switch
                                                    value={isScheduled}
                                                    onValueChange={(val) => {
                                                        setIsScheduled(val);
                                                        if (val && !deliveryDelay) setDeliveryDelay(1);
                                                    }}
                                                    trackColor={{ false: '#333', true: Colors.dark.rose[900] }}
                                                    thumbColor={isScheduled ? Colors.dark.rose[400] : '#666'}
                                                />
                                            </View>

                                            {isScheduled && (
                                                <View style={styles.delayOptions}>
                                                    {DELAY_OPTIONS.map((opt) => (
                                                        <TouchableOpacity
                                                            key={opt.value}
                                                            style={[
                                                                styles.delayChip,
                                                                (deliveryDelay === opt.value && !customDeliveryDate) && styles.delayChipActive,
                                                                (opt.value === -1 && customDeliveryDate) && styles.delayChipActive
                                                            ]}
                                                            onPress={() => {
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                if (opt.value === -1) {
                                                                    setDeliveryDelay(null);
                                                                    setCustomDeliveryDate(CUSTOM_DATES[0]);
                                                                } else {
                                                                    setDeliveryDelay(opt.value);
                                                                    setCustomDeliveryDate(null);
                                                                }
                                                            }}
                                                        >
                                                            {opt.icon}
                                                            <Text style={[
                                                                styles.delayText,
                                                                ((deliveryDelay === opt.value && !customDeliveryDate) || (opt.value === -1 && customDeliveryDate)) && styles.delayTextActive
                                                            ]}>
                                                                {opt.label}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            )}

                                            {isScheduled && customDeliveryDate && (
                                                <Animated.View entering={FadeInDown} style={styles.customDatePicker}>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                                                        {CUSTOM_DATES.map((date) => {
                                                            const isSelected = customDeliveryDate && date.toDateString() === customDeliveryDate.toDateString();
                                                            return (
                                                                <TouchableOpacity
                                                                    key={date.toISOString()}
                                                                    style={[styles.dateChip, isSelected && styles.dateChipActive]}
                                                                    onPress={() => {
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        setCustomDeliveryDate(date);
                                                                    }}
                                                                >
                                                                    <Text style={[styles.dateDay, isSelected && styles.dateTextActive]}>{format(date, 'EEE').toUpperCase()}</Text>
                                                                    <Text style={[styles.dateNum, isSelected && styles.dateTextActive]}>{format(date, 'd')}</Text>
                                                                    <Text style={[styles.dateMonth, isSelected && styles.dateTextActive]}>{format(date, 'MMM').toUpperCase()}</Text>
                                                                </TouchableOpacity>
                                                            );
                                                        })}
                                                    </ScrollView>
                                                </Animated.View>
                                            )}
                                        </Animated.View>
                                    )}
                                </View>
                            </View>
                        </GlassCard>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>

            <TouchableOpacity
                style={[styles.fab, { bottom: 100 }]}
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setIsComposeVisible(true);
                }}
            >
                <Sparkles size={24} color="white" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    stickyHeader: { position: 'absolute', left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none' },
    pageHeader: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl, paddingTop: 100 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dark.rose[500] },
    badgeText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 2 },
    badgeCount: { color: 'rgba(255,255,255,0.2)', fontSize: 10, fontFamily: Typography.sansBold },
    headerTitle: { fontSize: 56, fontFamily: Typography.serif, color: Colors.dark.foreground, letterSpacing: -1, marginTop: Spacing.xs, marginBottom: 8 },
    headerSubtitle: { fontSize: 16, color: Colors.dark.mutedForeground, marginTop: 2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 20 },
    modalBlur: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,12,0.8)' },
    modalContent: { flex: 0.9, width: '100%' },
    viewerCard: { flex: 1 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
    closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    modalLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
    viewerScroll: { padding: 32 },
    viewerTitle: { fontSize: 32, fontFamily: Typography.serif, color: 'white', marginBottom: 16 },
    viewerDivider: { width: 40, height: 2, backgroundColor: Colors.dark.rose[500], marginBottom: 32 },
    viewerContent: { fontSize: 18, fontFamily: Typography.serif, color: 'rgba(255,255,255,0.85)', lineHeight: 30 },
    viewerFooter: { marginTop: 48, alignItems: 'flex-end' },
    viewerAuthor: { fontSize: 16, fontFamily: Typography.serifItalic, color: Colors.dark.rose[400] },
    composerCard: { flex: 1, backgroundColor: '#070709' },
    sendBtn: { width: 44, height: 44, backgroundColor: Colors.dark.rose[600], borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    composerBody: { flex: 1 },
    composerScroll: { flex: 1 },
    composerScrollContent: { padding: 32, paddingBottom: 120, flexGrow: 1 },
    titleInput: { fontSize: 32, fontFamily: Typography.serif, color: 'white', marginBottom: 32, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
    contentInputWrapper: { flex: 1, minHeight: 400 },
    contentInput: { fontSize: 19, fontFamily: Typography.serif, color: 'rgba(255,255,255,0.8)', lineHeight: 32, textAlignVertical: 'top' },
    composerFooter: { backgroundColor: '#0A0A0C', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    optionsToggle: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)' },
    optionsToggleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    optionsToggleTitle: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
    expandedOptions: { paddingHorizontal: 16, paddingBottom: 16 },
    optionIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    activeIconBox: { backgroundColor: Colors.dark.rose[900], borderColor: Colors.dark.rose[500] },
    controlRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 16 },
    controlTitle: { fontSize: 14, fontFamily: Typography.sansBold, color: 'white' },
    controlDesc: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
    delayOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, width: '100%' },
    delayChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    delayChipActive: { backgroundColor: Colors.dark.rose[900], borderColor: Colors.dark.rose[500] },
    delayText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: Typography.sansBold },
    delayTextActive: { color: 'white' },
    customDatePicker: { marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)', paddingTop: 16 },
    dateScroll: { gap: 10, paddingRight: 40 },
    dateChip: { width: 56, height: 74, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)', justifyContent: 'center', alignItems: 'center', gap: 2 },
    dateChipActive: { backgroundColor: Colors.dark.rose[900], borderColor: Colors.dark.rose[500] },
    dateTextActive: { color: 'white' },
    dateDay: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
    dateNum: { fontSize: 18, fontFamily: Typography.serif, color: 'white' },
    dateMonth: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)' },
    listContent: { padding: Spacing.md, paddingBottom: 160 },
    cardWrapper: { marginBottom: Spacing.lg },
    letterCard: { padding: 24, backgroundColor: 'rgba(18,18,22,0.6)' },
    unreadBorder: { borderColor: 'rgba(251,113,133,0.3)' },
    iconContainer: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    readIconBg: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
    unreadIconBg: { backgroundColor: 'rgba(251,113,133,0.1)', borderColor: 'rgba(251,113,133,0.2)' },
    letterTitle: { flex: 1, color: Colors.dark.foreground, fontSize: 18, fontWeight: '600', letterSpacing: -0.5 },
    letterPreview: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 24, fontStyle: 'italic', marginBottom: Spacing.lg },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 16 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footerLabel: { fontSize: 9, fontWeight: '900', color: 'rgba(255,255,255,0.25)', letterSpacing: 1.5 },
    footerValue: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
    footerValueDate: { fontSize: 10, color: 'rgba(255,255,255,0.55)' },
    emptyContainer: { marginTop: 40, paddingHorizontal: Spacing.md },
    emptyCard: { padding: 40, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    emptyTitle: { color: Colors.dark.foreground, fontSize: 22, fontFamily: Typography.serif, marginBottom: Spacing.sm },
    emptySubtext: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: Typography.serif, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 },
    featuredContainer: { marginTop: 32, marginBottom: 10 },
    featuredCard: { padding: 24, borderRadius: Radius.xl, backgroundColor: 'rgba(251,113,133,0.05)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.2)' },
    featuredTag: { alignSelf: 'flex-start', backgroundColor: Colors.dark.rose[500], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 16 },
    featuredTagText: { fontSize: 8, fontFamily: Typography.sansBold, color: 'white', letterSpacing: 1 },
    featuredLetterSubtitle: { fontSize: 18, fontFamily: Typography.serifItalic, color: 'white', lineHeight: 28, marginBottom: 20 },
    featuredFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    featuredFrom: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    featuredBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    featuredBtnText: { fontSize: 9, fontFamily: Typography.sansBold, color: 'white', letterSpacing: 1 },
    fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.dark.rose[500], justifyContent: 'center', alignItems: 'center' },
});
