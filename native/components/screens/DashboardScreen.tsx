import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, RefreshControl, KeyboardAvoidingView, Platform, Alert, Modal, TextInput } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { auth, db, rtdb } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref as dbRef, set } from 'firebase/database';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import {
    LayoutDashboard, Image as ImageIcon, Camera, Lock, Plus, Flame, Heart, Zap, Activity, Smile, Thermometer, Moon, Search, Bell, Sparkles
} from 'lucide-react-native';
import { Svg, Defs, LinearGradient as SvgGradient, Stop, Rect as SvgRect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { PolaroidStack } from '../../components/PolaroidStack';
import { PartnerHeader } from '../../components/PartnerHeader';
import {
    RelationshipStats,
    IntimacyAlert,
    ConnectionBoard,
    ImportantDatesCountdown,
    LocationWidget,
    DailyInspirationWidget,
    MenstrualPhaseWidget,
} from '../../components/DashboardWidgets';
import { GlassCard } from '../../components/GlassCard';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate, withDelay, withTiming, Easing, runOnJS, LinearTransition, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { getPublicStorageUrl } from '../../lib/storage';
import { SharedCanvas } from '../../components/SharedCanvas';
import { getTodayIST, getPartnerName } from '../../lib/utils';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { submitPolaroid } from '../../lib/auth';
import { storage } from '../../lib/firebase';
import { updateWeatherAndLocation } from '../../lib/weather';
import { PerfChip, usePerfMonitor } from '../../components/PerfChip';

const { width } = Dimensions.get('window');

export function DashboardScreen() {
    // 🚀 Performance Optimization: Using granular selectors to avoid whole-screen re-renders
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const couple = useOrbitStore(s => s.couple);
    const fetchData = useOrbitStore(s => s.fetchData);
    const polaroids = useOrbitStore(s => s.polaroids);
    const letters = useOrbitStore(s => s.letters);
    const memories = useOrbitStore(s => s.memories);
    const moods = useOrbitStore(s => s.moods);
    const milestones = useOrbitStore(s => s.milestones);
    const cycleLogs = useOrbitStore(s => s.cycleLogs);
    const idToken = useOrbitStore(s => s.idToken);
    const setTabIndex = useOrbitStore(s => s.setTabIndex);
    const activeTabIndex = useOrbitStore(s => s.activeTabIndex);
    const appMode = useOrbitStore(s => s.appMode);
    const addPolaroidOptimistic = useOrbitStore(s => s.addPolaroidOptimistic);
    const isLiteMode = useOrbitStore(s => s.isLiteMode);

    const isPagerScrollEnabled = useOrbitStore(state => state.isPagerScrollEnabled);
    const toggleDebugMode = useOrbitStore(s => s.toggleDebugMode);
    const isDebugMode = useOrbitStore(s => s.isDebugMode);

    const [user, setUser] = useState<any>(auth.currentUser);
    const insets = useSafeAreaInsets();

    const perfStats = usePerfMonitor('Dashboard');

    const isFemale = profile?.gender === 'female';
    const isLunara = appMode === 'lunara';
    const today = getTodayIST();
    const partnerId = partnerProfile?.id;
    const partnerLogsToday = (partnerId && cycleLogs[partnerId]) ? cycleLogs[partnerId][today] : null;

    // Period detection for widget visibility
    const userLogsToday = (profile?.id && cycleLogs[profile.id]) ? cycleLogs[profile.id][today] : null;
    const isOnPeriod = userLogsToday?.is_period === true || userLogsToday?.flow;

    // Polaroid Upload State
    const [isTitleModalVisible, setIsTitleModalVisible] = useState(false);
    const [polaroidTitle, setPolaroidTitle] = useState('');
    const [pendingPolaroidUri, setPendingPolaroidUri] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [isProcessingPick, setIsProcessingPick] = useState(false);

    const handlePolaroidUpload = async (useCamera: boolean = false) => {
        if (isProcessingPick) return;
        setIsProcessingPick(true);

        requestAnimationFrame(async () => {
            try {
                const permissionFn = useCamera
                    ? ImagePicker.requestCameraPermissionsAsync
                    : ImagePicker.requestMediaLibraryPermissionsAsync;

                const { status } = await permissionFn();
                if (status !== 'granted') {
                    Alert.alert('Permission Needed', `Please allow ${useCamera ? 'camera' : 'gallery'} access to share Polaroids.`);
                    return;
                }

                const launchFn = useCamera
                    ? ImagePicker.launchCameraAsync
                    : ImagePicker.launchImageLibraryAsync;

                const result = await launchFn({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });

                if (result.canceled) return;

                // Open Title Modal
                setPendingPolaroidUri(result.assets[0].uri);
                setIsTitleModalVisible(true);
            } catch (error: any) {
                console.error('Polaroid upload error:', error);
                Alert.alert('Upload Failed', `Could not pick your photo: ${error.message || 'Unknown error'}`);
            } finally {
                setIsProcessingPick(false);
            }
        });
    };
    const confirmPolaroidUpload = async () => {
        if (!pendingPolaroidUri) return;

        // INSTANT UI FEEDBACK: Close modal and add to local state immediately
        setIsTitleModalVisible(false);
        const titleToSend = polaroidTitle || 'A moment shared';
        const uriToProcess = pendingPolaroidUri;

        addPolaroidOptimistic(uriToProcess, titleToSend);

        setPolaroidTitle('');
        setPendingPolaroidUri(null);

        // Perform background work (Compression + Storage + Firestore)
        setIsUploading(true);
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // 1. Safety Check: Prohibit RAW formats (DNG/RAW/NEF) to save 10-year storage
            const extension = uriToProcess.split('.').pop()?.toLowerCase();
            const forbidden = ['dng', 'raw', 'nef', 'arw', 'cr2'];
            if (extension && forbidden.includes(extension)) {
                Alert.alert('High-Res Only', 'RAW files are too large for our 10-year storage plan. Please select a standard high-res photo.');
                setIsUploading(false);
                return;
            }

            // 2. High-End Transform (2.2K Retina WEBP @ 0.85)
            const manipResult = await ImageManipulator.manipulateAsync(
                uriToProcess,
                [{ resize: { width: 2200 } }],
                { compress: 0.85, format: ImageManipulator.SaveFormat.WEBP }
            );

            // 3. Direct-to-Cloud Upload
            const todayStr = getTodayIST();
            const uploadBase = process.env.EXPO_PUBLIC_UPLOAD_URL?.replace(/\/$/, '');
            if (!uploadBase) {
                throw new Error('Upload configuration missing (EXPO_PUBLIC_UPLOAD_URL)');
            }

            const cleanPath = `polaroids/${auth.currentUser?.uid}_${todayStr}_${Date.now()}.webp`;
            const r2Url = `${uploadBase}/${cleanPath}`;

            const blob = await fetch(manipResult.uri).then(r => r.blob());

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', r2Url, true);
                if (process.env.EXPO_PUBLIC_UPLOAD_SECRET) {
                    xhr.setRequestHeader('Authorization', `Bearer ${process.env.EXPO_PUBLIC_UPLOAD_SECRET}`);
                }
                xhr.setRequestHeader('Content-Type', 'image/webp');
                xhr.onerror = () => reject(new Error('Network error during Polaroid upload'));
                xhr.timeout = 50000;
                xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Cloud upload failed (Status: ${xhr.status})`));
                xhr.send(blob as any);
            });

            // 4. Metadata Broadcast
            const metaRes = await submitPolaroid(cleanPath, titleToSend, todayStr);
            if (metaRes.error) {
                throw new Error(`Sync failed: ${metaRes.error}`);
            }

            // LEVERAGE DELTA SYNC: Do not call fetchData manually.
        } catch (err: any) {
            console.error('[InstantCRUD] Polaroid background failure:', err);
            Alert.alert('Upload Failed', err.message || 'Check your internet connection.');
        } finally {
            setIsUploading(false);
        }
    };

    const [refreshing, setRefreshing] = useState(false);

    // Local scroll tracking
    const scrollOffset = useSharedValue(0);
    const scrollRef = React.useRef<any>(null);
    const scrollToTop = () => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
    };
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    const onRefresh = useCallback(async () => {
        if (!user?.uid) return;
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await Promise.all([
                useOrbitStore.getState().syncNow(),
                updateWeatherAndLocation()
            ]);
        } finally {
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        // Initial user sync
        if (auth.currentUser) {
            setUser(auth.currentUser);
            // Defer heavy weather update to prevent boot lag
            setTimeout(() => {
                updateWeatherAndLocation();
            }, 1000);
        }
    }, []);

    // Morphing: Standardized thresholds for professional overlap - Silky Smooth [20-150] range
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [20, 150], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [20, 150], [1, 0.96], Extrapolate.CLAMP) },
        ]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [10, 120], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [120, 180], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [120, 180], [10, 0], Extrapolate.CLAMP) }]
    }));

    // Avatar Morphing Style: Smooth fade-out 
    const avatarMorphStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [20, 150], [1, 0], Extrapolate.CLAMP),
    }));

    // Entry Animations for Widgets - Optimized to avoid blinks on remount
    const widgetOpacity = useSharedValue(1);
    const widgetTranslateY = useSharedValue(0);

    const widgetAnimatedStyle = useAnimatedStyle(() => ({
        opacity: widgetOpacity.value,
        transform: [{ translateY: widgetTranslateY.value }]
    }));

    const myPolaroid = useMemo(() => {
        if (!user?.uid) return null;
        return polaroids.find(p => p.user_id === user.uid) || null;
    }, [polaroids, user?.uid]);

    const partnerPolaroid = useMemo(() => {
        if (!user?.uid) return null;
        return polaroids.find(p => p.user_id !== user.uid) || null;
    }, [polaroids, user?.uid]);

    const periodSupportHistory = useMemo(() => [
        { id: '1', text: isFemale ? "HE BROUGHT FLOWERS" : "YOU BROUGHT FLOWERS", type: 'gift' },
        { id: '2', text: isFemale ? "HE COOKED DINNER" : "YOU COOKED DINNER", type: 'act' },
        { id: '3', text: "GENTLE MASSAGE", type: 'touch' },
    ], [isFemale]);

    // Don't block hook definition sequence — if no user after auth check, parent layout handles redirect
    if (!user) return <View style={styles.container} />;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >


            <Animated.ScrollView
                ref={scrollRef}
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 50, paddingBottom: 100 }]}
                showsVerticalScrollIndicator={false}
                scrollEnabled={isPagerScrollEnabled}
                onScroll={scrollHandler}
                scrollEventThrottle={isLiteMode ? 32 : 16}
                nestedScrollEnabled={true}
                removeClippedSubviews={isLiteMode}
                overScrollMode="never"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="white"
                        colors={[Colors.dark.rose[400]]}
                        progressViewOffset={insets.top + 20}
                    />
                }
            >
                <View style={styles.feedSection}>
                    <Animated.View
                        style={[styles.headerTitleContainer, avatarMorphStyle]}
                        renderToHardwareTextureAndroid={true}
                    >
                        <PartnerHeader
                            profile={profile}
                            partnerProfile={partnerProfile}
                            coupleId={couple?.id}
                            isActive={activeTabIndex === 1}
                        />
                    </Animated.View>

                    {/* Quick Actions Row - Premium Gradient Borders */}
                    <View style={styles.quickActionsContainer}>
                        <TouchableOpacity
                            style={styles.quickActionGlass}
                            onPress={() => {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                // Lock logic: Toggle shared canvas interaction lock
                                // In a real app, this could also be a biometric lock
                                Alert.alert("Canvas Locked", "Drawing is now disabled to protect your shared art.");
                            }}
                        >
                            <LinearGradient
                                colors={['rgba(25, 25, 30, 0.95)', 'rgba(10, 10, 12, 1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[StyleSheet.absoluteFill, { padding: 1.5, borderRadius: 26 }]}
                            >
                                <View style={styles.quickActionInner}>
                                    <Lock size={20} color="white" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.quickActionGlass}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); useOrbitStore.getState().setMoodDrawerOpen(true); }}
                        >
                            <LinearGradient
                                colors={['rgba(30, 30, 45, 0.95)', 'rgba(15, 15, 20, 1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[StyleSheet.absoluteFill, { padding: 1, borderRadius: 26 }]}
                            >
                                <View style={styles.quickActionInner}>
                                    <Plus size={20} color="white" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.quickActionGlass}
                            onPress={() => {
                                Alert.alert(
                                    "Daily Polaroid",
                                    "Share a moment from today!",
                                    [
                                        { text: "Take Photo", onPress: () => handlePolaroidUpload(true) },
                                        { text: "Choose from Library", onPress: () => handlePolaroidUpload(false) },
                                        { text: "Cancel", style: "cancel" }
                                    ]
                                );
                            }}
                        >
                            <LinearGradient
                                colors={['rgba(40, 20, 20, 0.95)', 'rgba(20, 10, 10, 1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[StyleSheet.absoluteFill, { padding: 1.5, borderRadius: 26 }]}
                            >
                                <View style={styles.quickActionInner}>
                                    <Camera size={20} color="white" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.quickActionGlass}
                            onPress={() => {
                                if (!couple?.id || !profile?.id) return;
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                // Broadcast Spark event (Heartbeat) - SYNC WITH WEB
                                const vibeRef = dbRef(rtdb, `vibrations/${couple.id}`);
                                set(vibeRef, {
                                    senderId: profile.id,
                                    timestamp: Date.now(),
                                    type: 'spark'
                                });
                            }}
                        >
                            <LinearGradient
                                colors={['rgba(35, 25, 45, 0.95)', 'rgba(15, 10, 25, 1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[StyleSheet.absoluteFill, { padding: 1.5, borderRadius: 26 }]}
                            >
                                <View style={styles.quickActionInner}>
                                    <Sparkles size={20} color="white" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>

                    <Animated.View style={[styles.widgetsGrid, widgetAnimatedStyle]}>
                        {/* Passion Alert - Immersive Glass Card */}
                        <IntimacyAlert
                            profile={profile}
                            partnerProfile={partnerProfile}
                            cycleLogs={cycleLogs}
                            isActive={activeTabIndex === 1}
                        />




                        <View style={styles.borderBottomWrapper}>
                            <RelationshipStats
                                couple={couple}
                                lettersCount={letters.length}
                                memoriesCount={memories.length}
                                isActive={activeTabIndex === 1}
                            />
                        </View>

                        {/* Quick Logging - ONLY ON PERIOD DAYS FOR MAIN DASHBOARD */}
                        {isFemale && isOnPeriod && (
                            <View style={styles.borderBottomWrapper}>
                                <View style={styles.quickLoggingSection}>
                                    <View style={styles.supportHeader}>
                                        <Plus size={16} color={Colors.dark.indigo[400]} />
                                        <Text style={styles.supportTitle}>Quick Log</Text>
                                    </View>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                        <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                            <Smile size={14} color="white" />
                                            <Text style={styles.logChipText}>Happy</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                            <Thermometer size={14} color="white" />
                                            <Text style={styles.logChipText}>Cramps</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                            <Moon size={14} color="white" />
                                            <Text style={styles.logChipText}>Tired</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                            <Activity size={14} color="white" />
                                            <Text style={styles.logChipText}>Bloated</Text>
                                        </TouchableOpacity>
                                    </ScrollView>
                                </View>
                            </View>
                        )}

                        {/* Recent Support History - ONLY ON PERIOD DAYS FOR MAIN DASHBOARD */}
                        {isOnPeriod && (
                            <View style={styles.borderBottomWrapper}>
                                <View style={styles.supportHistorySection}>
                                    <View style={styles.supportHeader}>
                                        <Heart size={16} color={Colors.dark.rose[400]} />
                                        <Text style={styles.supportTitle}>Support History</Text>
                                    </View>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                        {periodSupportHistory.map(item => (
                                            <View key={item.id} style={styles.supportChip}>
                                                <Text style={styles.supportChipText}>{item.text}</Text>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            </View>
                        )}


                        <View style={styles.borderBottomWrapper}>
                            <ImportantDatesCountdown
                                milestones={milestones}
                                partnerProfile={partnerProfile}
                                couple={couple}
                                isActive={activeTabIndex === 1}
                            />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <ConnectionBoard
                                profile={profile}
                                partnerProfile={partnerProfile}
                                cycleLogs={cycleLogs}
                                isActive={activeTabIndex === 1}
                            />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <GlassCard style={[styles.placeholderCard, { padding: 0 }]} intensity={10}>
                                <View style={styles.polaroidHeader}>
                                    <View style={styles.polaroidTitleRow}>
                                        <Camera size={20} color={Colors.dark.indigo[400]} />
                                        <Text style={styles.polaroidTitle}>Daily Polaroid</Text>
                                    </View>
                                    <View style={styles.momentBadge}>
                                        <Text style={styles.momentBadgeText}>Moment</Text>
                                    </View>
                                </View>
                                <View style={styles.stackSection}>
                                    <PolaroidStack
                                        userPolaroid={polaroids.find(p => p.user_id === profile?.id && p.polaroid_date === today) || null}
                                        partnerPolaroid={polaroids.find(p => p.user_id === partnerProfile?.id && p.polaroid_date === today) || null}
                                        partnerName={getPartnerName(profile, partnerProfile)}
                                        onUploadPress={handlePolaroidUpload}
                                        authToken={idToken}
                                        isActive={activeTabIndex === 1}
                                    />
                                </View>
                            </GlassCard>
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <LocationWidget
                                profile={profile}
                                partnerProfile={partnerProfile}
                                isActive={activeTabIndex === 1}
                            />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <DailyInspirationWidget variant="card" />
                        </View>
                    </Animated.View>
                </View>

                {/* Full Width Shared Canvas */}
                <SharedCanvas isActive={activeTabIndex === 1} />

                <Animated.View style={styles.feedSection}>
                    <View style={styles.borderBottomWrapper}>
                        <MenstrualPhaseWidget />
                    </View>
                </Animated.View>
                <View style={{ height: 120 }} />
            </Animated.ScrollView>

            {/* Sticky Header Pill & Profile - Pin to Top with proper Z-Index */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill
                    title="Space"
                    scrollOffset={scrollOffset}
                    onPress={scrollToTop}
                    onLongPress={toggleDebugMode}
                />
            </Animated.View>

            {isDebugMode && (
                <View style={{ position: 'absolute', top: insets.top + 4, right: 16, zIndex: 10001 }}>
                    <PerfChip name="DASHBOARD" stats={perfStats} />
                </View>
            )}
            {/* Premium Dark Title Modal */}
            {
                isTitleModalVisible && (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 99999, justifyContent: 'center', padding: 24 }]}>
                        <Animated.View entering={FadeIn.duration(400)} style={styles.titleModalCard}>
                            <Text style={styles.titleModalHeader}>Daily Polaroid</Text>
                            <Text style={styles.titleModalSub}>Add a title to your shared moment</Text>

                            <View style={styles.titleInputContainer}>
                                <TextInput
                                    style={styles.titleInput}
                                    placeholder="E.g. Sunday Morning..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={polaroidTitle}
                                    onChangeText={setPolaroidTitle}
                                    maxLength={24}
                                    autoFocus
                                />
                            </View>

                            <View style={styles.titleModalActions}>
                                <TouchableOpacity
                                    style={styles.titleModalCancel}
                                    onPress={() => {
                                        setIsTitleModalVisible(false);
                                        setPendingPolaroidUri(null);
                                        setPolaroidTitle('');
                                    }}
                                >
                                    <Text style={styles.titleModalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.titleModalShare, isUploading && { opacity: 0.5 }]}
                                    onPress={confirmPolaroidUpload}
                                    disabled={isUploading}
                                >
                                    <Text style={styles.titleModalShareText}>
                                        {isUploading ? 'Uploading...' : 'Share'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </View>
                )
            }
        </KeyboardAvoidingView >
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
        zIndex: 1000, // Elevated zIndex
        pointerEvents: 'box-none',
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
    // Removed alignItems: center to allow HeaderPill internal alignment
    headerProfileBtn: {
        position: 'absolute',
        right: Spacing.md,
        top: 4, // Vertically center within the 60px header
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
        color: 'rgba(255,255,255,0.4)',
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
        overflow: 'hidden'
    },
    quickActionInner: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 28,
        margin: 1.5,
    },
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
        margin: Spacing.sm, // Reduced margin
        borderRadius: Radius.xl,
        padding: Spacing.md, // Tightened
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
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
        color: 'rgba(255,255,255,0.25)',
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
        color: 'rgba(255,255,255,0.4)',
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
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
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.6)',
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
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
    },
    feedScroll: {
        flex: 1,
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
        color: 'rgba(255,255,255,0.5)',
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
        color: 'rgba(255,255,255,0.5)',
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
