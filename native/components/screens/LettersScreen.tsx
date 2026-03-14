import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, TextInput, Switch, ScrollView, Platform, Pressable, RefreshControl, Keyboard, Alert, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';

import { useOrbitStore } from '../../lib/store';
import { auth, db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { Mail, MailOpen, Sparkles, X, Send, EyeOff, Calendar, Clock, ChevronDown, Plus } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { PagerLockGesture } from '../../components/PagerLockGesture';
import { FlashList } from '@shopify/flash-list';
import { getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { sendNotification } from '../../lib/notifications';
import { PerfChip, usePerfMonitor } from '../PerfChip';
import { TabSkeleton } from '../TabSkeleton';

const { width } = Dimensions.get('window');
const AnimatedFlashList = Animated.createAnimatedComponent<any>(FlashList);

const ZOOM_IN_ANIM = undefined;
const FADE_IN_DOWN_ANIM = undefined;

const DELAY_OPTIONS = [
    { label: 'Soon (1h)', value: 1, icon: <Clock size={14} color="white" /> },
    { label: 'Tomorrow', value: 24, icon: <Calendar size={14} color="white" /> },
    { label: '3 Days', value: 72, icon: <Sparkles size={14} color="white" /> },
    { label: 'Pick Date', value: -1, icon: <Calendar size={14} color="white" /> },
];

const CUSTOM_DATES = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    d.setHours(12, 0, 0, 0);
    return d;
});

const LetterCard = React.memo(({ item, profileId, partnerName, onSelect }: { item: any, profileId: string | undefined, partnerName: string, onSelect: (item: any) => void }) => {
    const isRead = item.is_read;
    const sName = item.sender_id === profileId ? 'You' : partnerName;
    const titleText = item.title || item.subject || 'Untitled Letter';
    const isOneTime = item?.unlock_type === 'one_time';

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            style={styles.cardWrapper}
            onPress={() => onSelect(item)}
        >
            <GlassCard style={[styles.letterCard, !isRead && styles.unreadBorder]} intensity={10}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: 12 }}>
                    <View style={[
                        styles.iconContainer,
                        isOneTime
                            ? styles.oneTimeIconBg
                            : (isRead ? styles.readIconBg : styles.unreadIconBg)
                    ]}>
                        {isOneTime ? (
                            <EyeOff size={16} color={Colors.dark.amber[400]} />
                        ) : isRead ? (
                            <MailOpen size={16} color={Colors.dark.mutedForeground} />
                        ) : (
                            <Mail size={16} color={Colors.dark.rose[400]} />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        {!isOneTime && (
                            <Text style={styles.letterTitle} numberOfLines={1}>{titleText}</Text>
                        )}
                        {isOneTime && (
                            <View style={styles.oneTimeBadge}>
                                <EyeOff size={11} color={Colors.dark.amber[400]} />
                                <Text style={styles.oneTimeBadgeText}>ONE-TIME - OPENS ONCE</Text>
                            </View>
                        )}
                    </View>
                </View>
                {isOneTime ? (
                    <Text style={styles.oneTimePreview}>This letter will self-vanish after you open it.</Text>
                ) : (
                    <Text style={styles.letterPreview} numberOfLines={3}>"{item.content}"</Text>
                )}
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
});

const LettersScreenComponent = React.memo(({ isActive = true }: { isActive?: boolean }) => {
    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const isCurrentTab = useOrbitStore(state => state.activeTabIndex === 2);
    const letters = useOrbitStore(state => state.letters);
    const sendLetterOptimistic = useOrbitStore(state => state.sendLetterOptimistic);
    const updateReadStatus = useOrbitStore(state => state.updateLetterReadOptimistic);
    const syncNow = useOrbitStore(state => state.syncNow);
    const toggleTabListener = useOrbitStore(state => state.toggleTabListener);

    const insets = useSafeAreaInsets();
    const perfStats = usePerfMonitor('LETTERS');

    const [isComposeVisible, setIsComposeVisible] = useState(false);
    const [selectedLetter, setSelectedLetter] = useState<any>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isVanish, setIsVanish] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [isFutureDelivery, setIsFutureDelivery] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

    const scrollOffset = useSharedValue(0);

    const onScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        }
    });

    React.useEffect(() => {
        if (isActive && isCurrentTab) {
            toggleTabListener('letters', true);
            return () => toggleTabListener('letters', false);
        }
    }, [isActive, isCurrentTab, toggleTabListener]);

    const partnerName = useMemo(() => getPartnerName(profile, partnerProfile), [profile, partnerProfile]);

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await syncNow();
        } finally {
            setIsRefreshing(false);
        }
    }, [syncNow]);

    const handleSend = async () => {
        if (!content.trim()) return;
        setIsSending(true);
        try {
            await sendLetterOptimistic({
                title: title.trim() || 'Untitled Letter',
                content: content.trim(),
                sender_id: profile?.id,
                receiver_id: partnerProfile?.id,
                unlock_type: isVanish ? 'one_time' : 'instant',
                is_scheduled: isFutureDelivery,
                scheduled_delivery_time: isFutureDelivery ? deliveryDate?.getTime() : null,
            });

            if (partnerProfile?.id) {
                await sendNotification({
                    recipientId: partnerProfile.id,
                    actorId: profile?.id || '',
                    type: 'letter',
                    title: 'A new letter for you 💌',
                    message: `${profile?.display_name || 'Your partner'} sent you a heartfelt message.`,
                    actionUrl: '/letters'
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsComposeVisible(false);
            setTitle('');
            setContent('');
            setIsVanish(false);
            setIsFutureDelivery(false);
            setDeliveryDate(null);
        } catch (e) {
            Alert.alert('Error', 'Failed to send letter.');
        } finally {
            setIsSending(false);
        }
    };

    const handleSelectLetter = useCallback((item: any) => {
        setSelectedLetter(item);
        if (!item.is_read && item.sender_id !== profile?.id) {
            updateReadStatus(item.id, true);
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [profile?.id, updateReadStatus]);

    const flashListRef = React.useRef<any>(null);
    const scrollToTop = () => flashListRef.current?.scrollToOffset({ offset: 0, animated: true });

    const titleStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 80], [1, 0]),
        transform: [{ translateY: interpolate(scrollOffset.value, [0, 80], [0, -10]) }]
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [60, 100], [0, 1]),
        transform: [{ translateY: interpolate(scrollOffset.value, [60, 100], [10, 0]) }]
    }));

    const renderItem = useCallback(({ item }: any) => (
        <LetterCard
            item={item}
            profileId={profile?.id}
            partnerName={partnerName}
            onSelect={handleSelectLetter}
        />
    ), [profile?.id, partnerName, handleSelectLetter]);

    const listHeader = useMemo(() => (
        <View style={styles.standardHeader}>
            <Animated.View style={[styles.headerTitleRow, titleStyle]}>
                <Text style={styles.standardTitle}>Letters</Text>
                <TouchableOpacity style={styles.addBtn} onPress={() => setIsComposeVisible(true)}>
                    <Plus color="white" size={20} strokeWidth={2.5} />
                </TouchableOpacity>
            </Animated.View>
            <Animated.Text style={[styles.standardSubtitle, titleStyle]}>PEARLS OF THOUGHT & HEART</Animated.Text>
        </View>
    ), [titleStyle]);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Letters" scrollOffset={scrollOffset} count={letters?.length} onPress={scrollToTop} />
            </Animated.View>

            <AnimatedFlashList
                ref={flashListRef}
                data={letters}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={140}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 150, paddingHorizontal: 16 }}
                onScroll={onScroll}
                scrollEventThrottle={16}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="white" />}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Mail size={40} color="rgba(255,255,255,0.05)" />
                        <Text style={styles.emptyText}>No letters yet.</Text>
                    </View>
                }
            />

            <Modal
                isVisible={isComposeVisible}
                onBackdropPress={() => !isSending && setIsComposeVisible(false)}
                onSwipeComplete={() => !isSending && setIsComposeVisible(false)}
                swipeDirection={['down']}
                style={styles.modal}
                avoidKeyboard
                propagateSwipe
                useNativeDriverForBackdrop
            >
                <View style={styles.composerCard}>
                    <View style={styles.modalHandle} />
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setIsComposeVisible(false)} disabled={isSending}>
                            <X size={24} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.modalLabel}>{isSending ? 'SENDING...' : 'NEW LETTER'}</Text>
                        <TouchableOpacity onPress={handleSend} disabled={isSending || !content.trim()} style={[styles.sendBtn, (!content.trim() || isSending) && { opacity: 0.5 }]}>
                            {isSending ? <ActivityIndicator size="small" color="white" /> : <Send size={20} color="white" />}
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.composerBody} keyboardShouldPersistTaps="handled">
                        <TextInput
                            style={styles.subjectInput}
                            placeholder="Subject..."
                            placeholderTextColor="rgba(255,255,255,0.3)"
                            value={title}
                            onChangeText={setTitle}
                        />
                        <TextInput
                            style={styles.mainInput}
                            placeholder="Write from the heart..."
                            placeholderTextColor="rgba(255,255,255,0.2)"
                            multiline
                            value={content}
                            onChangeText={setContent}
                        />

                        <View style={styles.optionRow}>
                            <View>
                                <Text style={styles.optionTitle}>Vanish Mode</Text>
                                <Text style={styles.optionDesc}>Letter disappears after reading</Text>
                            </View>
                            <Switch value={isVanish} onValueChange={setIsVanish} trackColor={{ true: Colors.dark.rose[500] }} />
                        </View>

                        <View style={styles.optionRow}>
                            <View>
                                <Text style={styles.optionTitle}>Scheduled Delivery</Text>
                                <Text style={styles.optionDesc}>Open at a specific time</Text>
                            </View>
                            <Switch value={isFutureDelivery} onValueChange={setIsFutureDelivery} trackColor={{ true: Colors.dark.rose[500] }} />
                        </View>

                        {isFutureDelivery && (
                            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setIsDatePickerVisible(true)}>
                                <Calendar size={16} color="white" />
                                <Text style={styles.datePickerText}>
                                    {deliveryDate ? format(deliveryDate, 'PPP p') : 'Select delivery time...'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            </Modal>

            {selectedLetter && (
                <Modal
                    isVisible={!!selectedLetter}
                    onBackdropPress={() => setSelectedLetter(null)}
                    onSwipeComplete={() => setSelectedLetter(null)}
                    swipeDirection={['down']}
                    style={styles.modal}
                    propagateSwipe
                >
                    <View style={styles.readerCard}>
                        <View style={styles.modalHandle} />
                        <View style={styles.readerHeader}>
                            <Text style={styles.readerLabel}>LETTER FROM {selectedLetter.sender_id === profile?.id ? 'YOU' : partnerName.toUpperCase()}</Text>
                            <TouchableOpacity onPress={() => setSelectedLetter(null)}>
                                <X size={24} color="white" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.readerBody}>
                            <Text style={styles.readerTitle}>{selectedLetter.title || 'Untitled'}</Text>
                            <Text style={styles.readerContent}>{selectedLetter.content}</Text>
                            <Text style={styles.readerDate}>
                                SENT ON {selectedLetter.created_at?.toDate ? selectedLetter.created_at.toDate().toLocaleString() : 'RECENT'}
                            </Text>
                        </ScrollView>
                    </View>
                </Modal>
            )}

            {isDatePickerVisible && (
                <DatePickerModal
                    visible={isDatePickerVisible}
                    onClose={() => setIsDatePickerVisible(false)}
                    onSelect={(date: Date) => {
                        setDeliveryDate(date);
                        setIsDatePickerVisible(false);
                    }}
                />
            )}
        </View>
    );
});

const DatePickerModal = ({ visible, onClose, onSelect }: any) => (
    <Modal isVisible={visible} onBackdropPress={onClose} style={{ justifyContent: 'center', padding: 20 }}>
        <GlassCard intensity={20} style={{ padding: 24, borderRadius: 24 }}>
            <Text style={{ color: 'white', fontSize: 18, fontFamily: Typography.serifBold, marginBottom: 16 }}>Delivery Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {CUSTOM_DATES.map((date, i) => (
                    <TouchableOpacity
                        key={i}
                        onPress={() => onSelect(date)}
                        style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, marginRight: 8, alignItems: 'center', width: 80 }}
                    >
                        <Text style={{ color: 'white', fontSize: 12, fontFamily: Typography.sansBold }}>{format(date, 'MMM')}</Text>
                        <Text style={{ color: 'white', fontSize: 20, fontFamily: Typography.serifBold }}>{format(date, 'd')}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity onPress={onClose} style={{ alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: Typography.sans }}>Cancel</Text>
            </TouchableOpacity>
        </GlassCard>
    </Modal>
);

export const LettersScreen = LettersScreenComponent;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    stickyHeader: { position: 'absolute', left: 0, right: 0, zIndex: 1000, alignItems: 'center' },
    standardHeader: GlobalStyles.standardHeader,
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, width: '100%', paddingRight: 4 },
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.dark.rose[500], justifyContent: 'center', alignItems: 'center' },
    cardWrapper: { marginBottom: 16 },
    letterCard: { padding: 20, borderRadius: 24 },
    unreadBorder: { borderColor: Colors.dark.rose[400], borderWidth: 1 },
    iconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    unreadIconBg: { backgroundColor: 'rgba(251,113,133,0.1)' },
    readIconBg: { backgroundColor: 'rgba(255,255,255,0.05)' },
    oneTimeIconBg: { backgroundColor: 'rgba(251,191,36,0.1)' },
    letterTitle: { color: 'white', fontSize: 18, fontFamily: Typography.serifBold },
    letterPreview: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: Typography.sans, lineHeight: 20 },
    oneTimeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(251,191,36,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
    oneTimeBadgeText: { color: Colors.dark.amber[400], fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 1 },
    oneTimePreview: { color: Colors.dark.amber[400], fontSize: 14, fontFamily: Typography.sans, fontStyle: 'italic' },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    footerRow: { gap: 4 },
    footerLabel: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
    footerValue: { fontSize: 12, fontFamily: Typography.sansBold, color: 'white' },
    footerValueDate: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)' },
    modal: { margin: 0, justifyContent: 'flex-end' },
    composerCard: { height: '90%', backgroundColor: '#070708', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    modalLabel: { fontSize: 11, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.dark.rose[500], justifyContent: 'center', alignItems: 'center' },
    composerBody: { flex: 1 },
    subjectInput: { fontSize: 24, fontFamily: Typography.serifBold, color: 'white', marginBottom: 20 },
    mainInput: { fontSize: 18, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.8)', minHeight: 200, textAlignVertical: 'top' },
    optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    optionTitle: { color: 'white', fontSize: 16, fontFamily: Typography.sansBold },
    optionDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: Typography.sans },
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 16, marginTop: 8 },
    datePickerText: { color: 'white', fontSize: 14, fontFamily: Typography.sans },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, gap: 16 },
    emptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 16, fontFamily: Typography.serif },
    readerCard: { height: '80%', backgroundColor: '#070708', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
    readerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    readerLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: Colors.dark.rose[400], letterSpacing: 1.5 },
    readerBody: { flex: 1 },
    readerTitle: { fontSize: 32, fontFamily: Typography.serifBold, color: 'white', marginBottom: 16 },
    readerContent: { fontSize: 18, fontFamily: Typography.serif, color: 'rgba(255,255,255,0.9)', lineHeight: 30, marginBottom: 40 },
    readerDate: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 },
    viewerContent: { fontSize: 18, fontFamily: Typography.serif, color: 'rgba(255,255,255,0.9)', lineHeight: 30, marginBottom: 40 },
    viewerFooter: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 24 },
    viewerAuthor: { color: 'white', fontSize: 18, fontFamily: Typography.serifBold, marginBottom: 8 },
    viewerDate: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: Typography.sans },
});
