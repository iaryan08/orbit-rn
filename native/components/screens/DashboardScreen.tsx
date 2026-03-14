import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, RefreshControl, KeyboardAvoidingView, Platform, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { PagerLockGesture } from '../../components/PagerLockGesture';
import { auth, db, storage, rtdb } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import {
    LayoutDashboard, Image as ImageIcon, Camera, Lock, Plus, Flame, Heart, Zap, Activity, Smile, Thermometer, Moon, Search, Bell, Sparkles, MessageCircle
} from 'lucide-react-native';
import { Svg, Defs, LinearGradient as SvgGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import { PolaroidStack } from '../../components/PolaroidStack';
import { PartnerHeader } from '../../components/PartnerHeader';
import { NativeViewGestureHandler } from 'react-native-gesture-handler';
import { PremiumTabLoader } from '../../components/PremiumTabLoader';
import { RelationshipStats } from '../../components/dashboard/RelationshipStats';
import { IntimacyAlert } from '../../components/dashboard/IntimacyAlert';
import { ConnectionBoard } from '../../components/dashboard/ConnectionBoard';
import { ImportantDatesCountdown } from '../../components/dashboard/ImportantDatesCountdown';
import { LocationWidget } from '../../components/dashboard/LocationWidget';
import { DailyInspirationWidget } from '../../components/dashboard/DailyInspirationWidget';
import { OnThisDayWidget } from '../../components/dashboard/OnThisDayWidget';
import { MenstrualPhaseWidget } from '../../components/dashboard/MenstrualPhaseWidget';
import { GlassCard } from '../../components/GlassCard';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { CommentDrawer } from '../../components/CommentDrawer';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { getPublicStorageUrl } from '../../lib/storage';
import { SharedCanvas } from '../../components/SharedCanvas';
import { getTodayIST, getPartnerName, normalizeDate } from '../../lib/utils';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { submitPolaroid } from '../../lib/auth';
import { sendNotification } from '../../lib/notifications';
import { updateWeatherAndLocation } from '../../lib/weather';
import { PerfChip, usePerfMonitor } from '../../components/PerfChip';

const { width, height } = Dimensions.get('window');
const SHARED_CANVAS_PLACEHOLDER_HEIGHT = Math.round(width * 1.2);
const DASHBOARD_PRELOAD_DISTANCE = 700;
const DEFERRED_CARD_HEIGHT = 320;
const MODAL_ANIM_INC = undefined;

export function DashboardScreen({ isActive = true }: { isActive?: boolean }) {
    const [user, setUser] = useState<any>(auth.currentUser);
    const insets = useSafeAreaInsets();

    // Selectors
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const couple = useOrbitStore(s => s.couple);
    const polaroids = useOrbitStore(s => s.polaroids);
    const letters = useOrbitStore(s => s.letters);
    const memories = useOrbitStore(s => s.memories);
    const milestones = useOrbitStore(s => s.milestones);
    const cycleLogs = useOrbitStore(s => s.cycleLogs);
    const idToken = useOrbitStore(s => s.idToken);
    const activeTabIndex = useOrbitStore(s => s.activeTabIndex);
    const addPolaroidOptimistic = useOrbitStore(s => s.addPolaroidOptimistic);
    const addCommentOptimistic = useOrbitStore(s => s.addCommentOptimistic);
    const openMediaViewer = useOrbitStore(s => s.openMediaViewer);
    const isLiteMode = useOrbitStore(s => s.isLiteMode);

    // Presence Tracking
    const [partnerPresence, setPartnerPresence] = useState<{ isOnline: boolean; inCinema: boolean; isFresh: boolean } | null>(null);
    const [serverOffset, setServerOffset] = useState(0);

    useEffect(() => {
        const offsetRef = ref(rtdb, '.info/serverTimeOffset');
        const unsub = onValue(offsetRef, (snap) => {
            setServerOffset(snap.val() || 0);
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!isActive || !couple?.id || !profile?.id) return;

        const presenceRef = ref(rtdb, `presence/${couple.id}`);
        const unsub = onValue(presenceRef, (snapshot) => {
            const allPresence = snapshot.val() || {};
            const pId = partnerProfile?.id || Object.keys(allPresence).find(uid => uid !== profile.id);
            const data = pId ? allPresence[pId] : null;

            if (!data) {
                setPartnerPresence(null);
                return;
            }

            const isOnline = !!data?.is_online;
            const inCinema = !!data?.in_cinema;
            const lastChanged = typeof data?.last_changed === 'number'
                ? data.last_changed
                : ((isOnline || inCinema) ? (Date.now() + serverOffset) : 0);

            const isFresh = (Date.now() + serverOffset) - lastChanged < 900_000;
            setPartnerPresence({ isOnline, inCinema, isFresh });
        });

        return () => unsub();
    }, [couple?.id, isActive, profile?.id, serverOffset, partnerProfile?.id]);

    // Performance Tuning
    const isAndroid = Platform.OS === 'android';
    const shouldUseAggressiveDeferral = isLiteMode || isAndroid;
    const sharedCanvasPreloadDistance = shouldUseAggressiveDeferral ? 240 : 900;

    const isPagerScrollEnabled = useOrbitStore(state => state.isPagerScrollEnabled);
    const toggleDebugMode = useOrbitStore(s => s.toggleDebugMode);
    const isDebugMode = useOrbitStore(s => s.isDebugMode);

    const perfStats = usePerfMonitor('Dashboard');

    const isFemale = profile?.gender === 'female';
    const today = getTodayIST();

    // Derived States
    const userLogsToday = (profile?.id && cycleLogs[profile.id]) ? cycleLogs[profile.id][today] : null;
    const isOnPeriod = userLogsToday?.is_period === true || userLogsToday?.flow;

    // Polaroid Upload
    const [isTitleModalVisible, setIsTitleModalVisible] = useState(false);
    const [polaroidTitle, setPolaroidTitle] = useState('');
    const [pendingPolaroidUri, setPendingPolaroidUri] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingPick, setIsProcessingPick] = useState(false);
    const [commentingPolaroid, setCommentingPolaroid] = useState<any>(null);

    const openComments = useCallback((item: any) => {
        setCommentingPolaroid(item);
    }, []);

    const handleAddComment = useCallback((id: string, text: string) => {
        if (!text.trim()) return;
        addCommentOptimistic(id, 'polaroid', text);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [addCommentOptimistic]);

    const handlePolaroidUpload = async (useCamera: boolean = false) => {
        if (isProcessingPick) return;
        setIsProcessingPick(true);

        try {
            const permissionFn = useCamera
                ? ImagePicker.requestCameraPermissionsAsync
                : ImagePicker.requestMediaLibraryPermissionsAsync;

            const { status } = await permissionFn();
            if (status !== 'granted') {
                Alert.alert('Permission Needed', 'Access required to share Polaroids.');
                return;
            }

            const launchFn = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
            const result = await launchFn({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled) {
                setPendingPolaroidUri(result.assets[0].uri);
                setIsTitleModalVisible(true);
            }
        } catch (error) {
            console.error('Pick error:', error);
        } finally {
            setIsProcessingPick(false);
        }
    };

    const confirmPolaroidUpload = async () => {
        if (!pendingPolaroidUri) return;
        setIsTitleModalVisible(false);
        const title = polaroidTitle || 'A moment shared';
        const uri = pendingPolaroidUri;

        addPolaroidOptimistic(uri, title);
        setPolaroidTitle('');
        setPendingPolaroidUri(null);
        setIsUploading(true);

        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const manip = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 2200 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.WEBP });

            const uploadBase = process.env.EXPO_PUBLIC_UPLOAD_URL?.replace(/\/$/, '');
            if (!uploadBase) throw new Error('Missing upload URL');

            const path = `polaroids/${auth.currentUser?.uid}_${today}_${Date.now()}.webp`;
            const r2Url = `${uploadBase}/${path}`;

            const blob = await fetch(manip.uri).then(r => r.blob());
            const xhr = new XMLHttpRequest();
            await new Promise<void>((resolve, reject) => {
                xhr.open('PUT', r2Url, true);
                if (process.env.EXPO_PUBLIC_UPLOAD_SECRET) xhr.setRequestHeader('Authorization', `Bearer ${process.env.EXPO_PUBLIC_UPLOAD_SECRET}`);
                xhr.setRequestHeader('Content-Type', 'image/webp');
                xhr.onload = () => (xhr.status === 200) ? resolve() : reject(new Error('Upload failed'));
                xhr.onerror = () => reject(new Error('Network error'));
                xhr.send(blob as any);
            });

            await submitPolaroid(path, title, today);
        } catch (err: any) {
            Alert.alert('Upload Failed', err.message);
        } finally {
            setIsUploading(false);
        }
    };

    // Scrolling & Deferral
    const [refreshing, setRefreshing] = useState(false);
    const [sharedCanvasMountY, setSharedCanvasMountY] = useState<number | null>(null);
    const [shouldMountSharedCanvas, setShouldMountSharedCanvas] = useState(false);
    const [deferredMountPositions, setDeferredMountPositions] = useState<Record<string, number | null>>({});
    const [deferredMounts, setDeferredMounts] = useState<Record<string, boolean>>({
        polaroids: !shouldUseAggressiveDeferral,
        location: !shouldUseAggressiveDeferral,
        inspiration: !shouldUseAggressiveDeferral,
        menstrual: !shouldUseAggressiveDeferral,
        onThisDay: !shouldUseAggressiveDeferral,
    });

    const scrollOffset = useSharedValue(0);
    const scrollRef = React.useRef<any>(null);
    const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

    const maybeMountDeferred = useCallback((scrollY: number, vh: number) => {
        if (!shouldUseAggressiveDeferral) return;

        // Shared Canvas check
        if (!shouldMountSharedCanvas && sharedCanvasMountY !== null) {
            if (scrollY + vh + sharedCanvasPreloadDistance >= sharedCanvasMountY) setShouldMountSharedCanvas(true);
        }

        // Widgets Check
        setDeferredMounts(prev => {
            const next = { ...prev };
            let changed = false;
            Object.keys(deferredMountPositions).forEach(key => {
                const mountY = deferredMountPositions[key];
                if (!next[key] && mountY !== null && scrollY + vh + DASHBOARD_PRELOAD_DISTANCE >= mountY) {
                    next[key] = true;
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [shouldUseAggressiveDeferral, shouldMountSharedCanvas, sharedCanvasMountY, sharedCanvasPreloadDistance, deferredMountPositions]);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (e) => {
            scrollOffset.value = e.contentOffset.y;
            runOnJS(maybeMountDeferred)(e.contentOffset.y, e.layoutMeasurement.height);
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await Promise.all([useOrbitStore.getState().syncNow(), updateWeatherAndLocation()]);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (isActive && auth.currentUser) {
            setUser(auth.currentUser);

            // 🚀 Phase 8: Real-time syncing for Dashboard
            const { toggleTabListener } = useOrbitStore.getState();
            toggleTabListener('dashboard', true);

            const t = setTimeout(() => updateWeatherAndLocation(), 1000);
            return () => {
                clearTimeout(t);
                toggleTabListener('dashboard', false);
            };
        }
    }, [isActive]);

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 80], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [0, 80], [1, 0.95], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [60, 100], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [60, 100], [10, 0], Extrapolate.CLAMP) }]
    }));

    const myPolaroid = useMemo(() => {
        if (!user?.uid) return null;
        return polaroids
            .filter(p => p.user_id === user.uid)
            .sort((a, b) => normalizeDate(b.created_at).getTime() - normalizeDate(a.created_at).getTime())[0] || null;
    }, [polaroids, user?.uid]);

    const partnerPolaroid = useMemo(() => {
        if (!user?.uid) return null;
        return polaroids
            .filter(p => p.user_id !== user.uid)
            .sort((a, b) => normalizeDate(b.created_at).getTime() - normalizeDate(a.created_at).getTime())[0] || null;
    }, [polaroids, user?.uid]);

    const periodSupportHistory = useMemo(() => [
        { id: '1', text: isFemale ? "HE BROUGHT FLOWERS" : "YOU BROUGHT FLOWERS" },
        { id: '2', text: isFemale ? "HE COOKED DINNER" : "YOU COOKED DINNER" },
        { id: '3', text: "GENTLE MASSAGE" },
    ], [isFemale]);

    const createLayoutHandler = (key: string) => (e: any) => {
        const y = e.nativeEvent.layout.y;
        if (key === 'canvas') setSharedCanvasMountY(y);
        else setDeferredMountPositions(prev => ({ ...prev, [key]: y }));
    };

    useEffect(() => {
        if (isActive && user?.uid && couple?.id) {
            useOrbitStore.getState().toggleTabListener('dashboard', true);
            return () => useOrbitStore.getState().toggleTabListener('dashboard', false);
        }
    }, [isActive, user?.uid, couple?.id]);

    if (!user) return <View style={styles.container} />;

    return (
        <KeyboardAvoidingView style={styles.container} behavior={isAndroid ? undefined : 'padding'}>
            <Animated.ScrollView
                ref={scrollRef}
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 80 }]}
                onScroll={scrollHandler}
                scrollEventThrottle={32}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" progressViewOffset={insets.top + 20} />}
            >
                <View style={styles.feedSection}>
                    <Animated.View style={[styles.headerTitleContainer, titleAnimatedStyle]}>
                        <PartnerHeader profile={profile} partnerProfile={partnerProfile} coupleId={couple?.id} isActive={activeTabIndex === 1} />
                    </Animated.View>

                    <Animated.View style={[styles.quickActionsContainer, titleAnimatedStyle]}>
                        <TouchableOpacity style={styles.quickActionGlass} onPress={() => Alert.alert("Canvas Locked", "Art protected.")}>
                            <View style={[styles.quickActionInner, styles.quickActionInnerNeutral]}><Lock size={20} color="white" /></View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickActionGlass} onPress={() => useOrbitStore.getState().setMoodDrawerOpen(true)}>
                            <View style={[styles.quickActionInner, styles.quickActionInnerIndigo]}><Plus size={20} color="white" /></View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickActionGlass} onPress={() => Alert.alert("Daily Polaroid", "Share!", [{ text: "Camera", onPress: () => handlePolaroidUpload(true) }, { text: "Library", onPress: () => handlePolaroidUpload(false) }, { text: "Cancel" }])}>
                            <View style={[styles.quickActionInner, styles.quickActionInnerRose]}><Camera size={20} color="white" /></View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickActionGlass} onPress={async () => {
                            if (partnerProfile?.id) await sendNotification({ recipientId: partnerProfile.id, actorId: profile.id, actorName: profile.display_name, type: 'spark', title: 'Spark ✨', message: 'Thinking of you.', actionUrl: '/dashboard' });
                        }}>
                            <View style={[styles.quickActionInner, styles.quickActionInnerViolet]}><Sparkles size={20} color="white" /></View>
                        </TouchableOpacity>
                    </Animated.View>

                    <View style={styles.widgetsGrid}>
                        <IntimacyAlert profile={profile} partnerProfile={partnerProfile} cycleLogs={cycleLogs} isActive={activeTabIndex === 1} />
                        <View style={styles.borderBottomWrapper}>
                            <RelationshipStats
                                couple={couple}
                                lettersCount={letters.length}
                                memoriesCount={memories.length}
                                isActive={activeTabIndex === 1}
                            />
                        </View>

                        {isFemale && isOnPeriod && (
                            <View style={styles.borderBottomWrapper}>
                                <View style={styles.quickLoggingSection}>
                                    <View style={styles.supportHeader}><Plus size={16} color={Colors.dark.indigo[400]} /><Text style={styles.supportTitle}>Quick Log</Text></View>
                                    <PagerLockGesture>
                                        <NativeViewGestureHandler disallowInterruption>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                                {['Happy', 'Cramps', 'Tired', 'Bloated'].map(tag => (
                                                    <TouchableOpacity key={tag} style={styles.logChip}><Text style={styles.logChipText}>{tag}</Text></TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </NativeViewGestureHandler>
                                    </PagerLockGesture>
                                </View>
                            </View>
                        )}

                        {isOnPeriod && (
                            <View style={styles.borderBottomWrapper}>
                                <View style={styles.supportHistorySection}>
                                    <View style={styles.supportHeader}><Heart size={16} color={Colors.dark.rose[400]} /><Text style={styles.supportTitle}>Support History</Text></View>
                                    <PagerLockGesture>
                                        <NativeViewGestureHandler disallowInterruption>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                                {periodSupportHistory.map(item => (
                                                    <View key={item.id} style={styles.supportChip}><Text style={styles.supportChipText}>{item.text}</Text></View>
                                                ))}
                                            </ScrollView>
                                        </NativeViewGestureHandler>
                                    </PagerLockGesture>
                                </View>
                            </View>
                        )}

                        <View style={styles.borderBottomWrapper}><ImportantDatesCountdown milestones={milestones} partnerProfile={partnerProfile} couple={couple} isActive={activeTabIndex === 1} /></View>
                        <View style={styles.borderBottomWrapper}><ConnectionBoard profile={profile} partnerProfile={partnerProfile} cycleLogs={cycleLogs} isActive={activeTabIndex === 1} /></View>

                        <View style={styles.borderBottomWrapper} onLayout={createLayoutHandler('onThisDay')}>
                            {deferredMounts.onThisDay ? <OnThisDayWidget /> : <View style={styles.deferredSectionPlaceholder} />}
                        </View>

                        <View style={styles.borderBottomWrapper} onLayout={createLayoutHandler('polaroids')}>
                            {deferredMounts.polaroids ? (
                                <GlassCard style={[styles.placeholderCard, { padding: 0 }]} intensity={10}>
                                    <View style={styles.polaroidHeader}>
                                        <View style={styles.polaroidTitleRow}><Camera size={20} color={Colors.dark.indigo[400]} /><Text style={styles.polaroidTitle}>Daily Polaroid</Text></View>
                                        <View style={styles.momentBadge}><Text style={styles.momentBadgeText}>Moment</Text></View>
                                    </View>
                                    <View style={styles.stackSection}>
                                        <PolaroidStack userPolaroid={myPolaroid} partnerPolaroid={partnerPolaroid} partnerName={getPartnerName(profile, partnerProfile)} onPress={(p) => p?.image_url && openMediaViewer([p.image_url], 0, p.user_id || undefined, p.id, 'polaroid')} onUploadPress={handlePolaroidUpload} authToken={idToken} isActive={activeTabIndex === 1} />
                                    </View>

                                    {/* Dashboard Polaroid Comments - Removed per user request (keep in MV only) */}
                                </GlassCard>
                            ) : <View style={styles.deferredSectionPlaceholder} />}
                        </View>

                        <View style={styles.borderBottomWrapper} onLayout={createLayoutHandler('location')}>
                            {deferredMounts.location ? <LocationWidget profile={profile} partnerProfile={partnerProfile} isActive={activeTabIndex === 1} /> : <View style={styles.deferredSectionPlaceholder} />}
                        </View>

                        <View style={styles.borderBottomWrapper} onLayout={createLayoutHandler('inspiration')}>
                            {deferredMounts.inspiration ? <DailyInspirationWidget variant="card" /> : <View style={styles.deferredSectionPlaceholder} />}
                        </View>
                    </View>
                </View>

                <View onLayout={createLayoutHandler('canvas')}>
                    {shouldMountSharedCanvas ? <SharedCanvas isActive={activeTabIndex === 1} /> : (
                        <View style={styles.sharedCanvasPlaceholder}>
                            <View style={styles.sharedCanvasPlaceholderBadge}><Text style={styles.sharedCanvasPlaceholderLabel}>SHARED GUESTBOOK</Text></View>
                            <ActivityIndicator color="rgba(255,255,255,0.3)" size="small" style={{ marginTop: 20 }} />
                        </View>
                    )}
                </View>

                {isActive && (
                    <View style={styles.stickyHeader} pointerEvents="box-none">
                        <Animated.View style={[styles.headerPillContainer, headerPillStyle]}>
                            {/* Small Couple Avatar Morph - Better than a text pill for the Home screen */}
                            <View style={styles.smallCoupleHeader}>
                                <ProfileAvatar 
                                    url={getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken)} 
                                    size={36} 
                                    borderWidth={1.5}
                                    borderColor="rgba(255,255,255,0.1)"
                                />
                                <ProfileAvatar 
                                    url={getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken)} 
                                    size={36} 
                                    borderWidth={1.5} 
                                    borderColor={
                                        (partnerPresence?.isFresh && partnerPresence?.inCinema)
                                            ? Colors.dark.emerald[400]
                                            : (partnerPresence?.isFresh && partnerPresence?.isOnline)
                                                ? Colors.dark.amber[400]
                                                : "rgba(255,255,255,0.1)"
                                    }
                                    style={{ marginLeft: -12 }}
                                />
                            </View>
                        </Animated.View>
                    </View>
                )}

                {/* Always-visible Profile Trigger for Quick Settings Access - Fixed in top right */}
                {isActive && (
                    <TouchableOpacity 
                        style={[styles.headerProfileBtn, { top: insets.top + 4 }]} 
                        onPress={() => useOrbitStore.getState().setTabIndex(9, 'tap')}
                    >
                        <ProfileAvatar 
                            url={getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken)} 
                            size={44} 
                            borderWidth={1}
                            borderColor="rgba(255,255,255,0.15)"
                        />
                    </TouchableOpacity>
                )}

                {isDebugMode && (
                    <View style={[styles.debugToolbar, { top: insets.top + 60 }]}>
                        <PerfChip name="Dashboard" stats={perfStats} />
                    </View>
                )}

                <Modal
                    visible={isTitleModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIsTitleModalVisible(false)}
                >
                    <View style={GlobalStyles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                            <GlassCard style={styles.titleModalCard} intensity={20}>
                                <Text style={styles.titleModalHeader}>Add a Title</Text>
                                <Text style={styles.titleModalSub}>Give this moment a name...</Text>

                                <View style={styles.titleInputContainer}>
                                    <TextInput
                                        style={styles.titleInput}
                                        placeholder="Our morning coffee..."
                                        placeholderTextColor="rgba(255,255,255,0.35)"
                                        value={polaroidTitle}
                                        onChangeText={setPolaroidTitle}
                                        autoFocus
                                        maxLength={40}
                                    />
                                </View>

                                <View style={styles.titleModalActions}>
                                    <TouchableOpacity
                                        style={styles.titleModalCancel}
                                        onPress={() => {
                                            setIsTitleModalVisible(false);
                                            setPendingPolaroidUri(null);
                                        }}
                                    >
                                        <Text style={styles.titleModalCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.titleModalShare}
                                        onPress={confirmPolaroidUpload}
                                    >
                                        <Text style={styles.titleModalShareText}>Share Moment</Text>
                                    </TouchableOpacity>
                                </View>
                            </GlassCard>
                        </KeyboardAvoidingView>
                    </View>
                </Modal>
            </Animated.ScrollView>

            <CommentDrawer
                visible={!!commentingPolaroid}
                onClose={() => setCommentingPolaroid(null)}
                memory={commentingPolaroid}
                profile={profile}
                idToken={idToken}
                onAddComment={handleAddComment}
            />
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
        alignItems: 'center',
    },
    headerPillContainer: {
        marginTop: 6,
    },
    smallCoupleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    debugToolbar: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 999,
        pointerEvents: 'box-none',
        flexDirection: 'row',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    headerProfileBtn: {
        position: 'absolute',
        right: Spacing.md,
        top: 4,
        zIndex: 1010,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 26,
        overflow: 'hidden',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 0,
        paddingBottom: 100,
    },
    feedSection: {
        width: '100%',
        maxWidth: 480,
        alignSelf: 'center',
    },
    headerTitleContainer: {
        paddingHorizontal: Spacing.md,
        paddingTop: 20,
        paddingBottom: 2,
    },
    standardHeader: {
        paddingHorizontal: Spacing.xl,
        paddingTop: 20,
        paddingBottom: 24,
    },
    standardTitle: {
        fontSize: 32,
        fontFamily: Typography.serifBold,
        color: 'white',
        letterSpacing: -0.5,
    },
    standardSubtitle: {
        fontSize: 11,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.65)',
        letterSpacing: 1.5,
        marginTop: 4,
    },
    quickActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        paddingTop: 12,
        paddingBottom: 40,
        paddingHorizontal: Spacing.xl,
    },
    quickActionGlass: {
        width: 56,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: '#09090b',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    quickActionInner: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 28,
        margin: 1,
    },
    quickActionInnerNeutral: { backgroundColor: '#111216' },
    quickActionInnerIndigo: { backgroundColor: '#151926' },
    quickActionInnerRose: { backgroundColor: '#201215' },
    quickActionInnerViolet: { backgroundColor: '#181327' },
    widgetsGrid: {
        flexDirection: 'column',
    },
    borderBottomWrapper: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
        width: '100%',
    },
    stackSection: {
        height: 380,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
    },
    placeholderCard: {
        margin: Spacing.sm,
        borderRadius: Radius.xl,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    polaroidHeader: {
        padding: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    polaroidTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    polaroidTitle: {
        color: 'white',
        fontSize: 22,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.2,
    },
    momentBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    momentBadgeText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 1.5,
    },
    canvasArea: {
        height: 240,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomLeftRadius: Radius.xl,
        borderBottomRightRadius: Radius.xl,
        overflow: 'hidden',
    },
    artStroke: {
        position: 'absolute',
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
    },
    canvasArt: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    canvasText: {
        color: 'rgba(255,255,255,0.5)',
        marginTop: Spacing.md,
        fontSize: 13,
        fontFamily: Typography.serifItalic,
    },
    passionAlertWrapper: {
        margin: Spacing.sm,
        marginBottom: Spacing.xs,
    },
    passionAlertCard: {
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    passionIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    passionTextContent: {
        flex: 1,
    },
    passionAlertTitle: {
        color: 'white',
        fontSize: 20,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.3,
    },
    passionAlertSub: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 13,
        fontFamily: Typography.serifItalic,
        marginTop: 2,
    },
    supportHistorySection: {
        paddingVertical: 20,
        paddingHorizontal: Spacing.sm,
    },
    supportHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    supportTitle: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 1.5,
    },
    supportScroll: {
        gap: 12,
    },
    supportChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    supportChipText: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: 1,
    },
    quickLoggingSection: {
        paddingVertical: 20,
        paddingHorizontal: Spacing.sm,
    },
    logChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginRight: 8,
    },
    logChipText: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
    },
    feedScroll: {
        flex: 1,
    },
    sharedCanvasPlaceholder: {
        width: '100%',
        height: SHARED_CANVAS_PLACEHOLDER_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: '#070707',
        marginVertical: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    sharedCanvasPlaceholderBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(108, 21, 36, 0.52)',
        borderWidth: 1,
        borderColor: 'rgba(251,113,133,0.5)',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    sharedCanvasPlaceholderLabel: {
        color: '#f4b3c0',
        fontSize: 13,
        letterSpacing: 1.3,
        fontWeight: '700',
    },
    sharedCanvasPlaceholderText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        fontFamily: Typography.sans,
    },
    polaroidCommentsArea: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    polaroidCommentsPreview: {
        marginBottom: 12,
        gap: 4,
    },
    viewAllCommentsText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: Typography.sans,
        marginBottom: 4,
    },
    polaroidCommentItem: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontFamily: Typography.sans,
    },
    commentUserText: {
        fontFamily: Typography.sansBold,
        color: 'white',
    },
    polaroidThoughtsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    polaroidThoughtsPlaceholder: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontFamily: Typography.sans,
    },
    deferredSectionPlaceholder: {
        width: '100%',
        height: DEFERRED_CARD_HEIGHT,
        backgroundColor: '#050507',
    },
    titleModalCard: {
        backgroundColor: '#111111',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        width: '100%',
    },
    titleModalHeader: {
        fontSize: 18,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 0.5,
    },
    titleModalSub: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.75)',
        marginTop: 4,
        marginBottom: 24,
    },
    titleInputContainer: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    titleInput: {
        color: 'white',
        fontSize: 16,
        fontFamily: Typography.sans,
    },
    titleModalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    titleModalCancel: {
        flex: 1,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleModalCancelText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        fontFamily: Typography.sansBold,
    },
    titleModalShare: {
        flex: 2,
        height: 48,
        backgroundColor: Colors.dark.rose[500],
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    titleModalShareText: {
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sansBold,
    },
});
