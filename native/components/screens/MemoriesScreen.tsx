import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Modal, TextInput, Platform, RefreshControl, Alert, ActivityIndicator, PanResponder, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { Pin, Sparkles } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { FlashList } from '@shopify/flash-list';
import { getPublicStorageUrl, isVideoUrl } from '../../lib/storage';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';
import { X, Send, Camera as CameraIcon, Image as ImageIconLucide, Calendar as CalendarIcon, Video, AlertCircle, ChevronDown, Plus, Volume2, VolumeX, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Video as VideoCompressor } from 'react-native-compressor';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, getStorage, type FirebaseStorage } from 'firebase/storage';
import { app, auth, db, storage, projectId } from '../../lib/firebase';
import { usePersistentMedia, getPersistentPath } from '../../lib/media';
import { sendNotification } from '../../lib/notifications';
import { PerfChip, usePerfMonitor } from '../PerfChip';

const { width } = Dimensions.get('window');
const AnimatedFlashList = Animated.createAnimatedComponent<any>(FlashList);
const R2_UPLOAD_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
const R2_UPLOAD_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

// --- Sub-components to avoid hook violations ---
async function mapWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            const current = nextIndex++;
            if (current >= items.length) return;
            results[current] = await mapper(items[current], current);
        }
    };

    const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
    await Promise.all(workers);
    return results;
}

const LunarDot = React.memo(({ index, scrollX, activeIndex }: { index: number, scrollX: any, activeIndex: number }) => {
    const dotStyle = useAnimatedStyle(() => {
        const input = [(index - 1) * width, index * width, (index + 1) * width];
        const scale = interpolate(scrollX.value, input, [0.8, 1.2, 0.8], Extrapolate.CLAMP);
        const opacity = interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolate.CLAMP);
        return {
            transform: [{ scale }],
            opacity,
            width: index === activeIndex ? 16 : 8
        };
    });
    return <Animated.View style={[styles.lunarDot, dotStyle]} />;
});

const LunarPagination = React.memo(({ imageUrls, scrollX, activeIndex }: { imageUrls: any[], scrollX: any, activeIndex: number }) => {
    if (imageUrls.length <= 1) return null;
    return (
        <View style={styles.lunarPagination}>
            {imageUrls.map((_: any, i: number) => (
                <LunarDot key={i} index={i} scrollX={scrollX} activeIndex={activeIndex} />
            ))}
        </View>
    );
});

const MemoryImage = React.memo(({
    url,
    id,
    idToken,
    onPress,
    isActive,
    isParentVisible,
    isTabActive,
}: {
    url: string,
    id: string,
    idToken: string | null | undefined,
    onPress: () => void,
    isActive: boolean,
    isParentVisible: boolean,
    isTabActive: boolean
}) => {
    const rawUrl = useMemo(() => {
        return getPublicStorageUrl(url, 'memories', idToken || '');
    }, [url, idToken]);
    const isMediaViewerOpen = useOrbitStore(state => state.mediaViewerState.isOpen);
    const videoMedia = useMemo(() => isVideoUrl(url), [url]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMuted, setIsMuted] = useState(true);

    const isVisible = isActive && isParentVisible && isTabActive;
    const isNetworkAllowed = isVisible; // Only download if visible

    // PERSISTENCE ENGINE: Check local file system before network
    // Instagram Pattern: Visibility-Gated Networking
    const persistentSource = usePersistentMedia(id as string, rawUrl as string, isNetworkAllowed);

    // Safety: Keep the source stable to avoid blinks on tab switch.
    const sourceUri = persistentSource || '';

    const player = useVideoPlayer(videoMedia ? sourceUri : '', (p) => {
        p.loop = true;
        p.muted = isMuted;
        p.staysActiveInBackground = false;
    });

    useEffect(() => {
        if (!videoMedia || !sourceUri) return;
        try {
            // Standard Source Replacement logic
            player.replace({ uri: sourceUri });
        } catch { }
    }, [sourceUri, videoMedia, player]);

    useEffect(() => {
        if (!videoMedia || !sourceUri) return;
        const sub = player.addListener('statusChange', (payload: any) => {
            if (payload?.status === 'playing' || payload?.status === 'readyToPlay') {
                setIsLoading(false);
            }
        });
        return () => sub.remove();
    }, [videoMedia, player, sourceUri]);

    useEffect(() => {
        if (!videoMedia) return;
        // Strictly control playback based on actual visibility
        if (isVisible && !isMediaViewerOpen) {
            player.muted = isMuted;
            player.play();
        } else {
            player.pause();
            player.muted = true;
        }
    }, [videoMedia, isMuted, isVisible, isMediaViewerOpen, player]);

    if (videoMedia) {
        return (
            <View style={styles.mediaFull}>
                {sourceUri ? (
                    <VideoView
                        player={player}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        nativeControls={false}
                        allowsFullscreen={false}
                    />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#050505' }]} />
                )}
                <TouchableOpacity
                    style={styles.videoTapOverlay}
                    activeOpacity={1}
                    onPress={onPress}
                />

                {/* Minimalist Instagram-style Loader */}
                {isLoading && (
                    <View style={styles.igLoaderContainer}>
                        <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                    </View>
                )}

                <TouchableOpacity
                    style={styles.videoMuteButton}
                    activeOpacity={0.85}
                    onPress={(e: any) => {
                        e?.stopPropagation?.();
                        setIsMuted(prev => !prev);
                    }}
                >
                    {isMuted ? <VolumeX size={14} color="white" /> : <Volume2 size={14} color="white" />}
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.mediaFull}>
            <Image
                source={{ uri: sourceUri || undefined }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                onLoadStart={() => setIsLoading(true)}
                onLoad={() => setIsLoading(false)}
            />
            {isLoading && (
                <View style={styles.igLoaderContainer}>
                    <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                </View>
            )}
        </TouchableOpacity>
    );
});

const MemoryCard = React.memo(({
    item,
    profile,
    partnerProfile,
    idToken,
    couple,
    isPrimaryVisible,
    isTabActive,
}: {
    item: any,
    profile: any,
    partnerProfile: any,
    idToken: string | null,
    couple: any,
    isPrimaryVisible: boolean
    isTabActive: boolean
}) => {
    const imageUrls = item.image_urls || (item.image_url ? [item.image_url] : []);
    const pName = getPartnerName(profile, partnerProfile);
    const sName = item.sender_id === profile?.id ? (profile?.display_name?.split(' ')[0] || 'You') : pName;

    const openMediaViewer = useOrbitStore(state => state.openMediaViewer);
    const setPagerScrollEnabled = useOrbitStore(state => state.setPagerScrollEnabled);
    const carouselScrollX = useSharedValue(0);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const onCarouselScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            carouselScrollX.value = event.contentOffset.x;
        },
    });

    const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        if (index !== activeImageIndex) {
            setActiveImageIndex(index);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        isDraggingRef.current = false;
        unlockPagerDelayed(120);
    };

    const unlockTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDraggingRef = React.useRef(false);
    const touchStartXRef = React.useRef(0);
    const touchStartYRef = React.useRef(0);
    const isHorizontalIntentRef = React.useRef(false);
    const lockPager = useCallback(() => {
        if (unlockTimerRef.current) {
            clearTimeout(unlockTimerRef.current);
            unlockTimerRef.current = null;
        }
        setPagerScrollEnabled(false);
    }, [setPagerScrollEnabled]);
    const unlockPagerDelayed = useCallback((delayMs: number = 180) => {
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = setTimeout(() => {
            setPagerScrollEnabled(true);
            unlockTimerRef.current = null;
        }, delayMs);
    }, [setPagerScrollEnabled]);

    useEffect(() => {
        return () => {
            if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        };
    }, []);

    // Safety: No specialized touch listeners needed since we disable tab-swiping 
    // globally for this tab in index.tsx for an Instagram-style experience.
    // This makes the text area 100% responsive for vertical scrolling.

    return (
        <View style={styles.memoryItem}>
            {/* Media Content - 100vw Immersive Carousel */}
            <View
                style={styles.mediaFrame}
                onStartShouldSetResponderCapture={() => false}
                onMoveShouldSetResponderCapture={() => false}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    const { pageX, pageY } = e.nativeEvent;
                    touchStartXRef.current = pageX;
                    touchStartYRef.current = pageY;
                    isHorizontalIntentRef.current = false;
                }}
                onTouchMove={(e) => {
                    const { pageX, pageY } = e.nativeEvent;
                    const dx = Math.abs(pageX - touchStartXRef.current);
                    const dy = Math.abs(pageY - touchStartYRef.current);
                    if (!isHorizontalIntentRef.current && dx > 8 && dx > dy) {
                        isHorizontalIntentRef.current = true;
                        lockPager();
                    }
                }}
            >
                <Animated.ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    scrollEventThrottle={16}
                    onScroll={onCarouselScroll}
                    onMomentumScrollEnd={onMomentumScrollEnd}
                    onScrollBeginDrag={() => {
                        isDraggingRef.current = true;
                        lockPager();
                    }}
                    onScrollEndDrag={() => {
                        // Unlock quickly after drag if there is no significant momentum.
                        unlockPagerDelayed(120);
                    }}
                    onTouchEnd={() => {
                        if (!isDraggingRef.current && isHorizontalIntentRef.current) unlockPagerDelayed(80);
                        isHorizontalIntentRef.current = false;
                    }}
                    onTouchCancel={() => {
                        if (isHorizontalIntentRef.current) unlockPagerDelayed(80);
                        isHorizontalIntentRef.current = false;
                    }}
                >
                    {imageUrls.length > 0 ? (
                        imageUrls.map((url: string, i: number) => {
                            const isRendered = Math.abs(i - activeImageIndex) <= 1;
                            return isRendered ? (
                                <MemoryImage
                                    key={i}
                                    url={url}
                                    id={url}
                                    idToken={idToken}
                                    isActive={i === activeImageIndex}
                                    isParentVisible={isPrimaryVisible}
                                    isTabActive={isTabActive}
                                    onPress={() => {
                                        openMediaViewer(imageUrls, i, item.sender_id, item.id, 'memory');
                                        // Mark as read by current user
                                        if (profile?.id && !item.read_by?.includes(profile.id)) {
                                            const memoryRef = doc(db, 'couples', couple?.id, 'memories', item.id);
                                            updateDoc(memoryRef, {
                                                read_by: arrayUnion(profile.id)
                                            }).catch(err => {
                                                if (!err.message?.includes('No document to update')) {
                                                    console.warn("[Memories] Failed to mark read:", err);
                                                }
                                            });
                                        }
                                    }}
                                />
                            ) : (
                                <View key={i} style={{ width, height: width }} />
                            );
                        })
                    ) : (
                        <View style={styles.mediaPlaceholder}>
                            <CameraIcon size={48} color="rgba(255,255,255,0.05)" />
                            <Text style={styles.mediaPlaceText}>MOMENT CAPTURED</Text>
                        </View>
                    )}
                </Animated.ScrollView>

                {/* Floating Identity Overlay */}
                <View style={styles.floatingIdentity}>
                    <GlassCard intensity={4} style={styles.identityChip}>
                        <ProfileAvatar
                            url={getPublicStorageUrl(item.sender_id === profile?.id ? profile?.avatar_url : partnerProfile?.avatar_url, 'avatars', idToken)}
                            fallbackText={(item.sender_name && item.sender_name[0]) || 'P'}
                            size={32}
                        />
                    </GlassCard>
                </View>

                {/* Lunar Pagination (Orbit Reel) */}
                <LunarPagination imageUrls={imageUrls} scrollX={carouselScrollX} activeIndex={activeImageIndex} />
            </View>

            {/* Caption Area */}
            <View style={styles.captionArea}>
                <Text style={styles.captionTitle}>{item.title || "Untitled Moment"}</Text>

                <Text style={styles.captionDate}>
                    {(item.memory_date?.toDate ? item.memory_date.toDate() : (item.memory_date ? new Date(item.memory_date) : (item.created_at?.toDate ? item.created_at.toDate() : (typeof item.created_at === 'number' ? new Date(item.created_at) : new Date())))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                </Text>

                <Text style={styles.captionText}>
                    <Text style={styles.captionUser}>{sName} </Text>
                    {item.content || "A beautiful memory shared together."}
                </Text>

                <TouchableOpacity
                    style={styles.thoughtsButton}
                    activeOpacity={0.6}
                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    onLongPress={() => {
                        if (item.sender_id === profile?.id) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            Alert.alert(
                                'Delete Memory?',
                                'This will permanently remove this moment from Orbit and delete the media files from storage.',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Delete',
                                        style: 'destructive',
                                        onPress: async () => {
                                            const deleteMemoryOptimistic = useOrbitStore.getState().deleteMemoryOptimistic;
                                            deleteMemoryOptimistic(item);
                                            // The cloud cleanup is handled internally by deleteMemoryOptimistic
                                        }
                                    }
                                ]
                            );
                        }
                    }}
                >
                    <View style={styles.thoughtBubbleInner}>
                        <Pin size={14} color="rgba(255,255,255,0.4)" style={{ transform: [{ rotate: '45deg' }] }} />
                        <Text style={styles.thoughtsPlaceholder}>Share a thought...</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
});

export function MemoriesScreen() {
    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const couple = useOrbitStore(state => state.couple);
    const memories = useOrbitStore(state => state.memories);
    const idToken = useOrbitStore(state => state.idToken);
    const fetchData = useOrbitStore(state => state.fetchData);
    const appMode = useOrbitStore(state => state.appMode);
    const syncNow = useOrbitStore(state => state.syncNow);
    const insets = useSafeAreaInsets();
    const [isComposeVisible, setIsComposeVisible] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    // NEW STATES
    const [selectedMedia, setSelectedMedia] = useState<{ uri: string, type: 'image' | 'video' }[]>([]);
    const [memoryDate, setMemoryDate] = useState(new Date());
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [primaryVisibleMemoryId, setPrimaryVisibleMemoryId] = useState<string | null>(null);
    const activeTabIndex = useOrbitStore(state => state.activeTabIndex);
    const isMemoriesTabActive = activeTabIndex === 3;
    const perfStats = usePerfMonitor('MEMORIES');
    const isDebugMode = useOrbitStore(state => state.isDebugMode);

    const flashListRef = React.useRef<any>(null);
    const scrollOffset = useSharedValue(0);

    const scrollToTop = () => {
        flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
    };

    const onRefresh = useCallback(async () => {
        if (!profile?.id) return;
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            await fetchData(profile.id);
        } finally {
            setRefreshing(false);
        }
    }, [profile?.id, fetchData]);

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    // Morphing: Standardized thresholds for professional overlap
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 70], [1, 0], Extrapolate.CLAMP),
        transform: [
            { scale: interpolate(scrollOffset.value, [0, 70], [1, 0.95], Extrapolate.CLAMP) },
            { translateY: interpolate(scrollOffset.value, [0, 70], [0, -12], Extrapolate.CLAMP) }
        ]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 50], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [30, 80], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [30, 80], [8, 0], Extrapolate.CLAMP) }]
    }));

    const pickMedia = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                allowsMultipleSelection: true,
                selectionLimit: 20 - selectedMedia.length,
                quality: 0.8,
            });

            if (!result.canceled) {
                const newAssets = result.assets.map(asset => ({
                    uri: asset.uri,
                    type: asset.type as 'image' | 'video'
                }));

                const totalMedia = [...selectedMedia, ...newAssets];
                const videoCount = totalMedia.filter(m => m.type === 'video').length;

                if (totalMedia.length > 20) {
                    Alert.alert('Limit Reached', 'You can only select up to 20 items.');
                    return;
                }

                if (videoCount > 2) {
                    Alert.alert('Video Limit', 'You can only include up to 2 videos per memory.');
                    return;
                }

                setSelectedMedia(totalMedia);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (error) {
            console.error('Error picking media:', error);
            Alert.alert('Error', 'Failed to pick media.');
        }
    };

    const uploadFile = async (uri: string, path: string, onProgress?: (value: number) => void) => {
        const blob: Blob = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onerror = () => reject(new Error(`XHR blob conversion failed for URI: ${uri}`));
            xhr.onload = () => {
                const converted = xhr.response as Blob | null;
                if (!converted || typeof converted.size !== 'number' || converted.size <= 0) {
                    reject(new Error(`Converted blob is empty for URI: ${uri}`));
                    return;
                }
                resolve(converted);
            };
            xhr.responseType = 'blob';
            xhr.open('GET', uri, true);
            xhr.send();
        });

        const fileRef = ref(storage, path);
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const metadata = {
            contentType:
                ext === 'webp' ? 'image/webp'
                    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                        : ext === 'png' ? 'image/png'
                            : ext === 'mp4' ? 'video/mp4'
                                : undefined,
        };

        const configuredBucket = (storage as any)?.app?.options?.storageBucket as string | undefined;
        const bucketCandidates = Array.from(new Set([
            configuredBucket,
            `${projectId}.appspot.com`,
            `${projectId}.firebasestorage.app`,
        ].filter(Boolean) as string[]));

        const cleanR2Path = path.replace(/^\/+/, '').replace(/^memories\//i, '');
        const mimeType = metadata.contentType || 'application/octet-stream';

        if (R2_UPLOAD_URL && R2_UPLOAD_SECRET) {
            try {
                const r2Url = `${R2_UPLOAD_URL.replace(/\/$/, '')}/memories/${cleanR2Path}`;
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', r2Url, true);
                    xhr.setRequestHeader('Authorization', `Bearer ${R2_UPLOAD_SECRET}`);
                    xhr.setRequestHeader('Content-Type', mimeType);
                    xhr.timeout = 30000;
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const progress = (event.loaded / Math.max(event.total, 1)) * 100;
                            onProgress?.(Math.max(0, Math.min(100, progress)));
                        }
                    };
                    xhr.onerror = () => reject(new Error('R2 upload network error'));
                    xhr.ontimeout = () => reject(new Error('R2 upload timed out'));
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                            return;
                        }
                        reject(new Error(`R2 upload failed (${xhr.status}): ${(xhr.responseText || '').slice(0, 180)}`));
                    };
                    xhr.send(blob as any);
                });

                onProgress?.(100);
                (blob as any)?.close?.();
                return cleanR2Path;
            } catch (r2Error: any) {
                console.error('[R2Upload] Direct upload failed, falling back to Firebase Storage', {
                    path: cleanR2Path,
                    message: r2Error?.message,
                });
            }
        } else if (__DEV__) {
            console.warn('[R2Upload] Missing EXPO_PUBLIC_UPLOAD_URL or EXPO_PUBLIC_UPLOAD_SECRET; falling back to Firebase');
        }

        const attemptUpload = async (activeStorage: FirebaseStorage) => {
            const targetRef = ref(activeStorage, path);
            try {
                // Prefer simple upload to avoid resumable edge failures on some Android + RN combos.
                const snap = await uploadBytes(targetRef, blob, metadata);
                onProgress?.(100);
                return await getDownloadURL(snap.ref);
            } catch (firstError: any) {
                const firstCode = typeof firstError?.code === 'string' ? firstError.code : '';
                if (firstCode !== 'storage/unknown') throw firstError;

                // Retry with resumable API for projects/buckets that reject one-shot upload.
                return await new Promise<string>((resolve, reject) => {
                    const uploadTask = uploadBytesResumable(targetRef, blob, metadata);
                    uploadTask.on(
                        'state_changed',
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100;
                            onProgress?.(Math.max(0, Math.min(100, progress)));
                        },
                        (error) => reject(error),
                        async () => {
                            try {
                                resolve(await getDownloadURL(uploadTask.snapshot.ref));
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            }
        };

        let lastError: any = null;
        try {
            for (const bucket of bucketCandidates) {
                try {
                    const bucketStorage = getStorage(app, `gs://${bucket}`);
                    const url = await attemptUpload(bucketStorage);
                    (blob as any)?.close?.();
                    return url;
                } catch (error: any) {
                    lastError = error;
                    console.error('[FirebaseStorage] Upload attempt failed', {
                        bucket,
                        path,
                        code: error?.code,
                        message: error?.message,
                        serverResponse: error?.serverResponse,
                    });
                }
            }

        } catch (error: any) {
            lastError = error;
        }

        (blob as any)?.close?.();
        throw lastError ?? new Error('Upload failed with unknown storage error.');
    };

    const handleSend = async () => {
        const senderId = profile?.id || auth.currentUser?.uid;
        if (selectedMedia.length === 0) {
            Alert.alert('No Media', 'Please select at least one photo or video.');
            return;
        }
        if (!title.trim()) {
            Alert.alert('Missing Title', 'Please add a title for this memory.');
            return;
        }
        if (!senderId) {
            Alert.alert('Authentication Error', 'Please re-login and try again.');
            return;
        }
        if (!couple?.id) {
            Alert.alert('Error', 'Could not identify your couple profile. Please try again.');
            return;
        }

        setIsSending(true);
        setUploadProgress(0);

        try {
            // BEST-IN-CLASS: Pre-upload Size Wall Check
            for (const media of selectedMedia) {
                const info = await FileSystem.getInfoAsync(media.uri);
                const sizeMb = info.exists ? info.size / (1024 * 1024) : 0;
                if (sizeMb > 35) {
                    Alert.alert('File too large', `One of your ${media.type}s is ${Math.round(sizeMb)}MB. Please keep files under 35MB for stability.`);
                    setIsSending(false);
                    return;
                }
            }

            const uploadBatchId = Date.now();
            const totalUploads = Math.max(1, selectedMedia.length);
            const perFileProgress = new Array<number>(totalUploads).fill(0);
            const updateOverallProgress = (index: number, value: number) => {
                perFileProgress[index] = Math.max(0, Math.min(100, value));
                const avg = perFileProgress.reduce((sum, v) => sum + v, 0) / totalUploads;
                setUploadProgress(Math.max(0, Math.min(100, avg)));
            };
            // Process + upload with bounded concurrency to avoid memory spikes.
            const imageUrls = await mapWithConcurrencyLimit(selectedMedia, 3, async (media, index) => {
                let finalUri = media.uri;
                let extension = media.uri.split('.').pop() || 'jpg';

                if (media.type === 'image') {
                    try {
                        const manipulated = await ImageManipulator.manipulateAsync(
                            media.uri,
                            [{ resize: { width: 1600 } }], // Professional balanced resolution
                            { compress: 0.80, format: ImageManipulator.SaveFormat.WEBP }
                        );
                        finalUri = manipulated.uri;
                        extension = 'webp';
                    } catch (e) {
                        console.error("Transcoding failed, falling back to original:", e);
                    }
                }

                if (media.type === 'video') {
                    try {
                        const info = await FileSystem.getInfoAsync(media.uri);
                        const originalSize = info.exists ? info.size : 10000000;

                        // Only compress if original is > 3MB
                        if (originalSize > 3 * 1024 * 1024) {
                            const compressed = await VideoCompressor.compress(
                                media.uri,
                                {
                                    compressionMethod: 'auto',
                                    maxSize: 1280,   // Downscale to 720p for extreme efficiency
                                }
                            );
                            finalUri = compressed;
                        }
                        extension = 'mp4';
                    } catch (e) {
                        console.error("Video compression failed, using original:", e);
                    }
                }

                const path = `memories/${couple.id}/${uploadBatchId}_${index}.${extension}`;
                return uploadFile(finalUri, path, (p) => updateOverallProgress(index, p));
            });

            const memoryData = {
                title: title.trim(),
                content: content.trim(),
                image_url: imageUrls[0] || null, // For backwards compatibility & Rules
                image_urls: imageUrls,
                sender_id: senderId,
                sender_name: profile?.display_name || null,
                couple_id: couple.id,
                memory_date: memoryDate,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            };

            await addDoc(collection(db, 'couples', couple.id, 'memories'), memoryData);

            // Send notification to partner
            if (partnerProfile?.id) {
                await sendNotification({
                    recipientId: partnerProfile.id,
                    actorId: senderId,
                    type: 'memory',
                    title: 'New Memory Shared! ✨',
                    message: `${profile?.display_name || 'Your partner'} uploaded a new moment: "${title.trim()}"`,
                    actionUrl: '/memories'
                }).catch(err => console.error("Error sending memory notification:", err));
            }

            // Instantly pull it into the local SQLite store so it renders
            await syncNow();

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsComposeVisible(false);
            setTitle('');
            setContent('');
            setSelectedMedia([]);
            setMemoryDate(new Date());
        } catch (error: any) {
            console.error('Error saving memory:', error);
            const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
            const baseMessage = typeof error?.message === 'string' ? error.message : 'Failed to save memory.';
            const message = error?.code === 'storage/unknown'
                ? `${baseMessage}\n\nPlease verify Firebase Storage bucket/rules and retry.`
                : baseMessage;
            Alert.alert('Error Saving Memory' + code, message);
        } finally {
            setIsSending(false);
            setUploadProgress(0);
        }
    };

    const renderItem = useCallback(({ item }: { item: any }) => (
        <MemoryCard
            item={item}
            profile={profile}
            partnerProfile={partnerProfile}
            idToken={idToken}
            couple={couple}
            isPrimaryVisible={item?.id === primaryVisibleMemoryId}
            isTabActive={isMemoriesTabActive}
        />
    ), [profile, partnerProfile, idToken, couple, primaryVisibleMemoryId, isMemoriesTabActive]);

    const viewabilityConfig = useMemo(() => ({
        itemVisiblePercentThreshold: 60,
        minimumViewTime: 120,
    }), []);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        let nextId: string | null = null;
        for (const token of viewableItems || []) {
            if (token?.isViewable && token?.item?.id) {
                nextId = token.item.id;
                break;
            }
        }
        setPrimaryVisibleMemoryId(prev => (prev === nextId ? prev : nextId));
    }).current;

    const keyExtractor = useCallback((item: any) => item.id, []);
    const getItemType = useCallback(() => 'memory', []);
    const openComposer = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsComposeVisible(true);
    }, []);

    const closeComposer = useCallback(() => {
        if (isSending) return;
        Keyboard.dismiss();
        setIsComposeVisible(false);
    }, [isSending]);

    const drawerDragStartYRef = useRef(0);
    const drawerPanResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gesture) =>
                Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy > 6,
            onPanResponderGrant: (_, gesture) => {
                drawerDragStartYRef.current = gesture.moveY;
            },
            onPanResponderRelease: (_, gesture) => {
                const dragDistance = gesture.moveY - drawerDragStartYRef.current;
                if (gesture.dy > 90 || dragDistance > 90) {
                    closeComposer();
                }
            },
        })
    ).current;

    const listHeader = useMemo(() => (
        <View style={styles.standardHeader}>
            <Animated.View style={[styles.headerTitleRow, titleAnimatedStyle]}>
                <Animated.Text style={[styles.standardTitle, appMode === 'lunara' && styles.lunaraPageTitle]}>
                    {appMode === 'lunara' ? 'Discovery' : 'Memories'}
                </Animated.Text>
                <TouchableOpacity style={styles.addMemoryBtn} onPress={openComposer}>
                    <Plus color="white" size={20} strokeWidth={2.5} />
                </TouchableOpacity>
            </Animated.View>
            <Animated.Text style={[styles.standardSubtitle, sublineAnimatedStyle]}>
                {appMode === 'lunara' ? 'EXPLORE YOUR BIOLOGICAL CYCLE' : 'A SHARED COLLECTION OF MOMENTS'}
            </Animated.Text>
        </View>
    ), [memories.length, appMode, openComposer, sublineAnimatedStyle, titleAnimatedStyle]);

    const listEmpty = useMemo(() => (
        <View style={styles.emptyContainer}>
            <GlassCard style={styles.emptyCard} intensity={12}>
                <View style={{ alignItems: 'center' }}>
                    <ImageIconLucide size={40} color="rgba(255,255,255,0.08)" style={{ marginBottom: 24 }} />
                    <Text style={styles.emptyTitle}>Your gallery is waiting</Text>
                    <Text style={styles.emptySubtext}>
                        Capture your first moment together and store it here until eternity.
                    </Text>
                </View>
            </GlassCard>
        </View>
    ), []);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Memories" scrollOffset={scrollOffset} count={memories?.length} onPress={scrollToTop} />
            </Animated.View>

            <AnimatedFlashList
                ref={flashListRef}
                data={memories}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                getItemType={getItemType}
                estimatedItemSize={450}
                drawDistance={400}
                removeClippedSubviews
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 200 }}
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
                ListHeaderComponent={listHeader}
                ListEmptyComponent={listEmpty}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
            />

            <Modal
                visible={isComposeVisible}
                animationType="slide"
                transparent={true}
                statusBarTranslucent={true}
                onRequestClose={closeComposer}
            >
                <View style={styles.drawerOverlay}>
                    <View style={styles.composerContent}>
                        <GlassCard style={styles.composerCard} intensity={40} contentStyle={{ flex: 1 }}>
                            <View style={styles.drawerHandleWrap} {...drawerPanResponder.panHandlers}>
                                <View style={styles.drawerHandle} />
                            </View>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity
                                    onPress={closeComposer}
                                    style={styles.closeBtn}
                                    disabled={isSending}
                                >
                                    <X size={24} color={isSending ? "rgba(255,255,255,0.2)" : "white"} />
                                </TouchableOpacity>
                                <Text style={styles.modalLabel}>
                                    {isSending ? `UPLOADING ${Math.round(uploadProgress)}%` : 'NEW MEMORY'}
                                </Text>
                                <TouchableOpacity
                                    onPress={handleSend}
                                    style={[styles.sendBtn, (isSending || selectedMedia.length === 0) && { opacity: 0.5 }]}
                                    disabled={isSending || selectedMedia.length === 0}
                                >
                                    {isSending ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Send size={20} color="white" />
                                    )}
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                contentContainerStyle={{ padding: 24 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {selectedMedia.length === 0 ? (
                                    <TouchableOpacity
                                        style={styles.imagePickerPlaceholder}
                                        activeOpacity={0.7}
                                        onPress={pickMedia}
                                    >
                                        <View style={styles.pickerCircle}>
                                            <CameraIcon size={32} color="white" />
                                        </View>
                                        <Text style={styles.pickerTitle}>Choose Moment</Text>
                                        <Text style={styles.pickerSubtitle}>Tap to select up to 20 photos</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.mediaPreviewContainer}>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaPreviewScroll}>
                                            {selectedMedia.map((media, index) => (
                                                <View key={index} style={styles.mediaPreviewItem}>
                                                    <Image source={{ uri: media.uri }} style={styles.previewImage} contentFit="cover" />
                                                    {media.type === 'video' && (
                                                        <View style={styles.videoBadge}>
                                                            <Video size={12} color="white" />
                                                        </View>
                                                    )}
                                                    <TouchableOpacity
                                                        style={styles.removeMediaBtn}
                                                        onPress={() => setSelectedMedia(prev => prev.filter((_, i) => i !== index))}
                                                    >
                                                        <X size={12} color="white" />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                            {selectedMedia.length < 20 && (
                                                <TouchableOpacity style={styles.addMoreMediaBtn} onPress={pickMedia}>
                                                    <Plus size={24} color="white" />
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                    </View>
                                )}

                                <View style={styles.dateSelectorRow}>
                                    <TouchableOpacity
                                        style={styles.dateSelectorBtn}
                                        onPress={() => setIsDatePickerVisible(true)}
                                    >
                                        <CalendarIcon size={18} color={Colors.dark.rose[400]} />
                                        <Text style={styles.dateSelectorText}>
                                            {memoryDate.toDateString() === new Date().toDateString()
                                                ? 'TODAY'
                                                : memoryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
                                        </Text>
                                        <ChevronDown size={14} color="rgba(255,255,255,0.4)" />
                                    </TouchableOpacity>
                                </View>

                                {isDatePickerVisible && (
                                    <DateTimePicker
                                        value={memoryDate}
                                        mode="date"
                                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                        maximumDate={new Date()}
                                        minimumDate={new Date(new Date().getFullYear() - 5, new Date().getMonth(), new Date().getDate())}
                                        onChange={(event: any, selectedDate?: Date) => {
                                            setIsDatePickerVisible(Platform.OS === 'ios');
                                            if (selectedDate) setMemoryDate(selectedDate);
                                        }}
                                    />
                                )}

                                <TextInput
                                    style={styles.titleInput}
                                    placeholder="Story title..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={title}
                                    onChangeText={setTitle}
                                    editable={!isSending}
                                    autoFocus
                                />
                                <TextInput
                                    style={styles.contentInput}
                                    placeholder="Write your beautiful caption..."
                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                    multiline
                                    scrollEnabled={false}
                                    value={content}
                                    onChangeText={setContent}
                                    editable={!isSending}
                                />
                            </ScrollView>
                        </GlassCard>
                    </View>
                </View>
            </Modal>
            {isDebugMode && (
                <View style={{ position: 'absolute', top: insets.top + 4, right: 16, zIndex: 10001 }}>
                    <PerfChip name="MEMORIES" stats={perfStats} />
                </View>
            )}
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
    listContent: {
        paddingBottom: 200,
    },
    pageHeader: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xl,
        paddingTop: 100,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
    },
    drawerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.92)',
        justifyContent: 'flex-end',
    },
    composerContent: {
        height: '90%',
    },
    composerCard: {
        flex: 1,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        backgroundColor: 'rgba(20,20,25,0.95)',
    },
    drawerHandleWrap: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 6,
    },
    drawerHandle: {
        width: 54,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    standardHeader: GlobalStyles.standardHeader,
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
        width: '100%',
        paddingRight: 4,
    },
    standardTitle: GlobalStyles.standardTitle,
    lunaraPageTitle: {
        color: '#d8b4fe',
    },
    standardSubtitle: GlobalStyles.standardSubtitle,
    addMemoryBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: Colors.dark.rose[500],
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.dark.rose[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    closeBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalLabel: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    sendBtn: {
        width: 44,
        height: 44,
        backgroundColor: Colors.dark.rose[600],
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imagePickerPlaceholder: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    pickerCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(251,113,133,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    pickerTitle: {
        fontSize: 18,
        fontFamily: Typography.serifBold,
        color: 'white',
        marginBottom: 4,
    },
    pickerSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: Typography.sans,
    },
    titleInput: {
        fontSize: 24,
        fontFamily: Typography.serif,
        color: 'white',
        marginBottom: 24,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    contentInput: {
        fontSize: 16,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 24,
        minHeight: 150,
        textAlignVertical: 'top',
    },
    mediaPreviewContainer: { marginBottom: 24 },
    mediaPreviewScroll: { paddingVertical: 8 },
    mediaPreviewItem: { width: 100, height: 100, borderRadius: 12, marginRight: 12, overflow: 'hidden', position: 'relative' },
    previewImage: { ...StyleSheet.absoluteFillObject },
    videoBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 6 },
    removeMediaBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 10 },
    addMoreMediaBtn: { width: 100, height: 100, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    dateSelectorRow: { marginBottom: 24 },
    dateSelectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,254,0.1)' },
    dateSelectorText: { fontSize: 12, fontFamily: Typography.sansBold, color: 'white', letterSpacing: 1 },
    galleryBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    galleryDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.dark.rose[500],
    },
    galleryBadgeText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2.5,
        textTransform: 'uppercase',
    },
    badgeCount: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
    },
    memoryItem: {
        marginBottom: 60,
        backgroundColor: 'rgba(255,255,255,0.01)',
    },
    floatingIdentity: {
        position: 'absolute',
        top: 6,
        left: 6,
        zIndex: 10,
    },
    identityChip: {
        padding: 4,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    mediaFrame: {
        width: width,
        aspectRatio: 0.8,
        backgroundColor: '#050505',
        position: 'relative',
    },
    mediaFull: {
        width: width,
        height: '100%',
        resizeMode: 'cover',
    },
    videoMuteButton: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        zIndex: 20,
    },
    videoTapOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
    },
    mediaPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    mediaPlaceText: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 2,
        marginTop: 12,
    },
    lunarPagination: {
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    lunarDot: {
        height: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    captionArea: {
        paddingHorizontal: Spacing.md,
        marginTop: 20,
        gap: 6,
    },
    captionTitle: {
        color: 'white',
        fontSize: 22,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.5,
    },
    captionDate: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        marginBottom: 8,
    },
    captionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        lineHeight: 20,
        fontFamily: Typography.sans,
    },
    captionUser: {
        fontFamily: Typography.sansBold,
        color: 'white',
    },
    thoughtsButton: {
        marginTop: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    thoughtBubbleInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    thoughtsPlaceholder: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        fontFamily: Typography.serif,
        fontStyle: 'italic',
    },
    emptyContainer: {
        marginTop: 40,
        paddingHorizontal: Spacing.xl,
    },
    emptyCard: {
        padding: 40,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        backgroundColor: 'transparent',
    },
    emptyTitle: {
        color: Colors.dark.foreground,
        fontSize: 20,
        fontFamily: Typography.serif,
        marginBottom: Spacing.sm,
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        textAlign: 'center',
        letterSpacing: 2,
        lineHeight: 18,
    },
    loadingOverlay: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    igLoaderContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 15,
        pointerEvents: 'none',
    },
});
