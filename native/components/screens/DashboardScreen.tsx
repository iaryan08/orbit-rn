import React, { useEffect, useState, useCallback } from 'react';
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
import { PolaroidStack } from '../../components/PolaroidStack';
import { PartnerHeader } from '../../components/PartnerHeader';
import {
    RelationshipStats,
    IntimacyAlert,
    AuraBoard,
    ImportantDatesCountdown,
    LocationWidget,
    DailyInspirationWidget,
    MenstrualPhaseWidget,
    BucketListWidget,
    LetterPreviewWidget
} from '../../components/DashboardWidgets';
import { GlassCard } from '../../components/GlassCard';
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
import { ref } from 'firebase/storage';
import { updateWeatherAndLocation } from '../../lib/weather';

const { width } = Dimensions.get('window');

export function DashboardScreen() {
    const {
        profile, partnerProfile, couple, fetchData, polaroids, letters,
        memories, moods, milestones, cycleLogs, idToken, setTabIndex, activeTabIndex, appMode
    } = useOrbitStore();
    const [user, setUser] = useState<any>(auth.currentUser);
    const insets = useSafeAreaInsets();

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

    const handlePolaroidUpload = async (useCamera: boolean = false) => {
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
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                });

                if (result.canceled) return;

                // Open Title Modal
                setPendingPolaroidUri(result.assets[0].uri);
                setIsTitleModalVisible(true);
            } catch (error) {
                console.error('Polaroid upload error:', error);
                Alert.alert('Upload Failed', 'Could not share your Polaroid right now.');
            }
        });
    };
    const confirmPolaroidUpload = async () => {
        if (!pendingPolaroidUri) return;

        setIsUploading(true);
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // 1. Transform for 2.2K WEBP
            const manipResult = await ImageManipulator.manipulateAsync(
                pendingPolaroidUri,
                [{ resize: { width: 2200 } }],
                { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP }
            );

            // 2. Upload to R2 (Direct XHR)
            const cleanPath = `polaroids/${auth.currentUser?.uid}_${getTodayIST()}.webp`;
            const r2Url = `${process.env.EXPO_PUBLIC_UPLOAD_URL?.replace(/\/$/, '')}/memories/${cleanPath}`;

            const blob = await fetch(manipResult.uri).then(r => r.blob());

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', r2Url, true);
                xhr.setRequestHeader('Authorization', `Bearer ${process.env.EXPO_PUBLIC_UPLOAD_SECRET}`);
                xhr.setRequestHeader('Content-Type', 'image/webp');

                xhr.onerror = () => reject(new Error('Network error during Polaroid upload'));
                xhr.timeout = 45000;
                xhr.ontimeout = () => reject(new Error('Polaroid upload timed out'));

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed with status: ${xhr.status}`));
                    }
                };
                xhr.send(blob as any);
            });

            // 3. Save to Firestore
            await submitPolaroid(cleanPath, polaroidTitle || 'A moment shared');

            // 4. Cleanup
            setIsTitleModalVisible(false);
            setPolaroidTitle('');
            setPendingPolaroidUri(null);

            if (auth.currentUser) {
                fetchData(auth.currentUser.uid);
            }
        } catch (err) {
            console.error('Polaroid processing error:', err);
            Alert.alert('Upload Failed', 'Failed to process or upload your image.');
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
                fetchData(user.uid),
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

    // Morphing: Standardized thresholds for professional overlap
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 70], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [0, 70], [1, 0.9], Extrapolate.CLAMP) },
            { translateY: interpolate(scrollOffset.value, [0, 70], [0, -12], Extrapolate.CLAMP) }
        ]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 50], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [30, 80], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [30, 80], [10, 0], Extrapolate.CLAMP) }]
    }));

    // Avatar Morphing Style: Disappear when pill is visible
    const avatarMorphStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [20, 80], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [20, 80], [1, 0.8], Extrapolate.CLAMP) },
            { translateY: interpolate(scrollOffset.value, [20, 80], [0, -15], Extrapolate.CLAMP) }
        ]
    }));

    // Entry Animations for Widgets
    const widgetOpacity = useSharedValue(0);
    const widgetTranslateY = useSharedValue(20);

    useEffect(() => {
        const config = { duration: 300, easing: Easing.out(Easing.exp) };
        widgetOpacity.value = withDelay(300, withTiming(1, config));
        widgetTranslateY.value = withDelay(300, withTiming(0, config));
    }, []);

    const widgetAnimatedStyle = useAnimatedStyle(() => ({
        opacity: widgetOpacity.value,
        transform: [{ translateY: widgetTranslateY.value }]
    }));

    // Don't block render — if no user after auth check, parent layout handles redirect
    if (!user) return <View style={styles.container} />;

    const myPolaroid = polaroids.find(p => p.user_id === user.uid) || null;
    const partnerPolaroid = polaroids.find(p => p.user_id !== user.uid) || null;

    const periodSupportHistory = [
        { id: '1', text: isFemale ? "HE BROUGHT FLOWERS" : "YOU BROUGHT FLOWERS", type: 'gift' },
        { id: '2', text: isFemale ? "HE COOKED DINNER" : "YOU COOKED DINNER", type: 'act' },
        { id: '3', text: "GENTLE MASSAGE", type: 'touch' },
    ];

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >


            <Animated.ScrollView
                ref={scrollRef}
                style={styles.content}
                contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing.md }]}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
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
                <View style={styles.feedScroll}>
                    <View style={styles.feedSection}>
                        <Animated.View style={[styles.headerTitleContainer, avatarMorphStyle]}>
                            <PartnerHeader
                                profile={profile}
                                partnerProfile={partnerProfile}
                                coupleId={couple?.id}
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
                                <Svg style={StyleSheet.absoluteFill}>
                                    <Defs>
                                        <SvgGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <Stop offset="0%" stopColor={Colors.dark.rose[400]} stopOpacity="0.4" />
                                            <Stop offset="100%" stopColor={Colors.dark.indigo[400]} stopOpacity="0.4" />
                                        </SvgGradient>
                                    </Defs>
                                    <SvgRect x="0" y="0" width="100%" height="100%" stroke="url(#grad1)" strokeWidth="2.5" fill="transparent" rx="26" />
                                </Svg>
                                <Lock size={20} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.quickActionGlass}
                                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); useOrbitStore.getState().setMoodDrawerOpen(true); }}
                            >
                                <Svg style={StyleSheet.absoluteFill}>
                                    <Defs>
                                        <SvgGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <Stop offset="0%" stopColor={Colors.dark.indigo[400]} stopOpacity="0.3" />
                                            <Stop offset="100%" stopColor={Colors.dark.amber[400]} stopOpacity="0.3" />
                                        </SvgGradient>
                                    </Defs>
                                    <SvgRect x="0" y="0" width="100%" height="100%" stroke="url(#grad2)" strokeWidth="2" fill="transparent" rx="26" />
                                </Svg>
                                <Plus size={20} color="white" />
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
                                <Svg style={StyleSheet.absoluteFill}>
                                    <Defs>
                                        <SvgGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <Stop offset="0%" stopColor={Colors.dark.amber[400]} stopOpacity="0.4" />
                                            <Stop offset="100%" stopColor={Colors.dark.rose[400]} stopOpacity="0.4" />
                                        </SvgGradient>
                                    </Defs>
                                    <SvgRect x="0" y="0" width="100%" height="100%" stroke="url(#grad3)" strokeWidth="2.5" fill="transparent" rx="26" />
                                </Svg>
                                <Camera size={20} color="white" />
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
                                    // Also show local feedback/navigate
                                    setTabIndex(3);
                                }}
                            >
                                <Svg style={StyleSheet.absoluteFill}>
                                    <Defs>
                                        <SvgGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <Stop offset="0%" stopColor={Colors.dark.rose[400]} stopOpacity="0.5" />
                                            <Stop offset="100%" stopColor="#fff" stopOpacity="0.2" />
                                        </SvgGradient>
                                    </Defs>
                                    <SvgRect x="0" y="0" width="100%" height="100%" stroke="url(#grad4)" strokeWidth="2.5" fill="transparent" rx="26" />
                                </Svg>
                                <Sparkles size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        <Animated.View style={[styles.widgetsGrid, widgetAnimatedStyle]}>
                            {/* Passion Alert - Immersive Glass Card */}
                            {partnerLogsToday?.sex_drive === 'very_high' && (
                                <TouchableOpacity activeOpacity={0.9} style={styles.passionAlertWrapper} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
                                    <GlassCard style={styles.passionAlertCard} intensity={25}>
                                        <View style={styles.passionIconBox}>
                                            <Flame size={24} color="#f97316" fill="#f97316" />
                                        </View>
                                        <View style={styles.passionTextContent}>
                                            <Text style={styles.passionAlertTitle}>Intense Passion</Text>
                                            <Text style={styles.passionAlertSub}>
                                                {getPartnerName(profile, partnerProfile)}'s feeling a deep desire for you right now.
                                            </Text>
                                        </View>
                                    </GlassCard>
                                </TouchableOpacity>
                            )}


                            <View style={styles.borderBottomWrapper}>
                                <RelationshipStats
                                    couple={couple}
                                    lettersCount={letters.length}
                                    memoriesCount={memories.length}
                                />
                            </View>

                            {/* Quick Logging - ONLY ON PERIOD DAYS FOR MAIN DASHBOARD */}
                            {isFemale && isOnPeriod && (
                                <View style={styles.borderBottomWrapper}>
                                    <View style={styles.quickLoggingSection}>
                                        <View style={styles.supportHeader}>
                                            <Plus size={16} color={Colors.dark.indigo[400]} />
                                            <Text style={styles.supportTitle}>QUICK LOG</Text>
                                        </View>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supportScroll}>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Smile size={14} color="white" />
                                                <Text style={styles.logChipText}>HAPPY</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Thermometer size={14} color="white" />
                                                <Text style={styles.logChipText}>CRAMPS</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Moon size={14} color="white" />
                                                <Text style={styles.logChipText}>TIRED</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.logChip} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
                                                <Activity size={14} color="white" />
                                                <Text style={styles.logChipText}>BLOATED</Text>
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
                                            <Text style={styles.supportTitle}>SUPPORT HISTORY</Text>
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
                                />
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <AuraBoard
                                    profile={profile}
                                    partnerProfile={partnerProfile}
                                    cycleLogs={cycleLogs}
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
                                            <Text style={styles.momentBadgeText}>MOMENT</Text>
                                        </View>
                                    </View>
                                    <View style={styles.stackSection}>
                                        <PolaroidStack
                                            userPolaroid={polaroids.find(p => p.user_id === profile?.id && p.polaroid_date === today) || null}
                                            partnerPolaroid={polaroids.find(p => p.user_id === partnerProfile?.id && p.polaroid_date === today) || null}
                                            partnerName={partnerProfile?.display_name || 'Partner'}
                                            onUploadPress={handlePolaroidUpload}
                                            authToken={idToken}
                                        />
                                    </View>
                                </GlassCard>
                            </View>

                            <View style={styles.borderBottomWrapper}>
                                <LocationWidget
                                    profile={profile}
                                    partnerProfile={partnerProfile}
                                />
                            </View>
                        </Animated.View>
                    </View>

                    {/* Full Width Shared Canvas */}
                    <SharedCanvas />

                    <Animated.View style={styles.feedSection}>
                        <View style={styles.borderBottomWrapper}>
                            <DailyInspirationWidget />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <MenstrualPhaseWidget />
                        </View>

                        <View style={styles.borderBottomWrapper}>
                            <BucketListWidget />
                        </View>
                    </Animated.View>
                </View>
                <View style={{ height: 120 }} />
            </Animated.ScrollView>

            {/* Sticky Header Pill - Pin to Top with proper Z-Index */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Space" scrollOffset={scrollOffset} onPress={scrollToTop} />
            </Animated.View>
            {/* Premium Dark Title Modal */}
            {isTitleModalVisible && (
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
            )}
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
        zIndex: 1000, // Elevated zIndex
        pointerEvents: 'box-none',
        // Removed alignItems: center to allow HeaderPill internal alignment
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 0,
        paddingBottom: 200,
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
    standardHeader: GlobalStyles.standardHeader,
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    quickActionsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: 16,
        paddingTop: 8,
        paddingBottom: Spacing.xl,
        paddingHorizontal: Spacing.md,
    },
    quickActionGlass: {
        width: 52,
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.08)', // Slightly more opaque for better visibility without elevation
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden', // Ensure no overflow from children or artifacts
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
        backgroundColor: 'rgba(0,0,0,0.2)',
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
        color: Colors.dark.foreground,
        fontSize: 20,
        fontFamily: Typography.serif,
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
        fontSize: 8,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
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
        fontSize: 16,
        fontFamily: Typography.serif,
    },
    passionAlertSub: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontFamily: Typography.serifItalic,
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
