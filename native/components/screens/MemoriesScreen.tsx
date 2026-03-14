import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, TextInput, ActivityIndicator, RefreshControl, Alert, NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import Modal from 'react-native-modal';
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
import { normalizeDate, getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';
import { X, Send, Camera as CameraIcon, Image as ImageIconLucide, Calendar as CalendarIcon, Video, AlertCircle, ChevronDown, Plus, Volume2, VolumeX, Trash2, MessageCircle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Video as VideoCompressor } from 'react-native-compressor';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, getStorage, type FirebaseStorage } from 'firebase/storage';
import { app, auth, db, storage, projectId } from '../../lib/firebase';
import { MemoryImage } from '../MemoryImage';
import { usePersistentMedia, getPersistentPath } from '../../lib/media';
import { sendNotification } from '../../lib/notifications';
import { PerfChip, usePerfMonitor } from '../PerfChip';
import { MemoryData, PolaroidData } from '../../lib/store/types';
import { CommentDrawer } from '../CommentDrawer';

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

const MemoryCard = React.memo(({
    item,
    profile,
    partnerProfile,
    idToken,
    couple,
    openMediaViewer,
    openComments,
    index,
    isActive,
    isParentVisible,
}: {
    item: any,
    profile: any,
    partnerProfile: any,
    idToken: string | null,
    couple: any,
    openMediaViewer: (urls: string[], index: number, senderId: string, memoryId: string, type: 'memory' | 'polaroid') => void,
    openComments: (memory: any) => void,
    index: number,
    isActive?: boolean,
    isParentVisible?: boolean,
}) => {
    const imageUrls = item.image_urls || (item.image_url ? [item.image_url] : []);
    const pName = getPartnerName(profile, partnerProfile);
    const storedName = item.sender_name?.split(' ')[0] || pName;
    const sName = item.sender_id === profile?.id ? (profile?.display_name?.split(' ')[0] || 'You') : storedName;
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
    const touchStartXRef = useRef(0);
    const touchStartYRef = useRef(0);
    const isHorizontalIntentRef = useRef(false);
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
                    scrollEventThrottle={32}
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
                                    isParentVisible={!!(isActive && isParentVisible)}
                                    isTabActive={true}
                                    width={width}
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
                                <View key={i} style={{ width, height: width * 1.25, backgroundColor: '#050505' }} />
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
                    <ProfileAvatar
                        url={getPublicStorageUrl(item.sender_id === profile?.id ? profile?.avatar_url : (partnerProfile?.avatar_url || item.sender_avatar_url), 'avatars', idToken)}
                        fallbackText={(item.sender_name && item.sender_name[0]) || (item.sender_id === profile?.id ? 'Y' : 'P')}
                        size={32}
                        borderWidth={1.5}
                        borderColor="rgba(255,255,255,0.2)"
                    />
                </View>

                {/* Lunar Pagination (Orbit Reel) */}
                <LunarPagination imageUrls={imageUrls} scrollX={carouselScrollX} activeIndex={activeImageIndex} />
            </View>

            {/* Caption Area */}
            <View style={styles.captionArea}>
                <Text style={styles.captionTitle}>{item.title || "Untitled Moment"}</Text>

                <Text style={styles.captionDate}>
                    {normalizeDate(item.memory_date || item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                </Text>

                <Text style={styles.captionText}>
                    <Text style={styles.captionUser}>{sName} </Text>
                    {item.content || "A beautiful memory shared together."}
                </Text>
                {/* Comments Preview (Latest 2) */}
                {item.comments && item.comments.length > 0 && (
                    <View style={styles.commentsPreview}>
                        {item.comments.length > 2 && (
                            <TouchableOpacity
                                onPress={() => openComments(item)}
                                style={{ marginBottom: 4 }}
                            >
                                <Text style={styles.viewAllComments}>
                                    View all {item.comments.length} thoughts
                                </Text>
                            </TouchableOpacity>
                        )}
                        {item.comments.slice(-2).map((comment: any, idx: number) => (
                            <View key={comment.id || idx} style={styles.commentRow}>
                                <Text style={styles.commentText} numberOfLines={2}>
                                    <Text style={styles.commentUser}>{comment.user_name} </Text>
                                    {comment.text}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity
                    style={styles.thoughtsButton}
                    activeOpacity={0.7}
                    onPress={() => openComments(item)}
                >
                    <View style={styles.thoughtBubbleInner}>
                        <MessageCircle size={16} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.thoughtsPlaceholder}>
                            {item.comments?.length ? `Add a thought...` : 'Share a thought...'}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
});

export function MemoriesScreen({ isActive = true }: { isActive?: boolean }) {
    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const couple = useOrbitStore(state => state.couple);
    const activeCoupleId = useOrbitStore(state => state.activeCoupleId);
    const memories = useOrbitStore(state => state.memories);
    const idToken = useOrbitStore(state => state.idToken);
    const fetchData = useOrbitStore(state => state.fetchData);
    const appMode = useOrbitStore(state => state.appMode);
    const syncNow = useOrbitStore(state => state.syncNow);
    const toggleTabListener = useOrbitStore(state => state.toggleTabListener);
    const lastForegroundTime = useOrbitStore(state => state.lastForegroundTime);
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
    const addCommentOptimistic = useOrbitStore(state => state.addCommentOptimistic);

    const openMediaViewer = (urls: string[], index: number, senderId: string, memoryId: string, type: 'memory' | 'polaroid') => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        useOrbitStore.getState().openMediaViewer(urls, index, senderId, memoryId, type);
    };
    const activeTabIndex = useOrbitStore(state => state.activeTabIndex);
    const isMemoriesTabActive = isActive && activeTabIndex === 3;
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

    useEffect(() => {
        if (isMemoriesTabActive) {
            toggleTabListener('memories', true);
            return () => {
                toggleTabListener('memories', false);
            };
        }
    }, [isMemoriesTabActive, toggleTabListener, lastForegroundTime]);

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
        let blob: Blob;
        try {
            const response = await fetch(uri);
            blob = await response.blob();
        } catch (fetchError) {
            console.warn('[UploadFile] Fetch blob failed, falling back to XHR:', fetchError);
            blob = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = function () { resolve(xhr.response); };
                xhr.onerror = function (e) { reject(new Error('Failed to create blob from URI')); };
                xhr.responseType = 'blob';
                xhr.open('GET', uri, true);
                xhr.send();
            });
        }

        const fileRef = ref(storage, path);
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const metadata = {
            contentType: ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'mp4' ? 'video/mp4' : undefined,
        };

        const configuredBucket = (storage as any)?.app?.options?.storageBucket as string | undefined;
        const bucketCandidates = Array.from(new Set([configuredBucket, `${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].filter(Boolean) as string[]));

        const cleanR2Path = path.replace(/^\/+/, '').replace(/^memories\//i, '');
        const mimeType = metadata.contentType || 'application/octet-stream';

        if (R2_UPLOAD_URL) {
            try {
                const r2Url = `${R2_UPLOAD_URL.replace(/\/$/, '')}/memories/${cleanR2Path}`;
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', r2Url, true);
                    if (R2_UPLOAD_SECRET) xhr.setRequestHeader('Authorization', `Bearer ${R2_UPLOAD_SECRET}`);
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
                        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
                        reject(new Error(`R2 upload failed (${xhr.status}): ${(xhr.responseText || '').slice(0, 180)}`));
                    };
                    xhr.send(blob as any);
                });
                onProgress?.(100);
                (blob as any)?.close?.();
                return cleanR2Path;
            } catch (r2Error: any) {
                console.error('[R2Upload] Direct upload failed, falling back to Firebase Storage');
            }
        }

        const attemptUpload = async (activeStorage: FirebaseStorage) => {
            const targetRef = ref(activeStorage, path);
            try {
                const snap = await uploadBytes(targetRef, blob, metadata);
                onProgress?.(100);
                return await getDownloadURL(snap.ref);
            } catch (firstError: any) {
                const firstCode = typeof firstError?.code === 'string' ? firstError.code : '';
                if (firstCode !== 'storage/unknown') throw firstError;
                return await new Promise<string>((resolve, reject) => {
                    const uploadTask = uploadBytesResumable(targetRef, blob, metadata);
                    uploadTask.on('state_changed', (snapshot) => {
                        const progress = (snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100;
                        onProgress?.(Math.max(0, Math.min(100, progress)));
                    }, (error) => reject(error), async () => {
                        try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); }
                    });
                });
            }
        };

        for (const bucket of bucketCandidates) {
            try {
                const bucketStorage = getStorage(app, `gs://${bucket}`);
                const url = await attemptUpload(bucketStorage);
                (blob as any)?.close?.();
                return url;
            } catch (error: any) { }
        }
        (blob as any)?.close?.();
        throw new Error('Upload failed');
    };

    const handleSend = async () => {
        const senderId = profile?.id || auth.currentUser?.uid;
        const resolvedCoupleId = couple?.id || profile?.couple_id || activeCoupleId;
        if (selectedMedia.length === 0 || !title.trim() || !senderId || !resolvedCoupleId) {
            Alert.alert('Error', 'Please fill all required fields.');
            return;
        }

        setIsSending(true);
        setUploadProgress(0);

        try {
            for (const media of selectedMedia) {
                const info = await FileSystem.getInfoAsync(media.uri);
                if (info.exists && info.size > 35 * 1024 * 1024) {
                    Alert.alert('File too large', 'Please keep files under 35MB.');
                    setIsSending(false);
                    return;
                }
            }

            const uploadBatchId = Date.now();
            const imageUrls = await mapWithConcurrencyLimit(selectedMedia, 3, async (media, index) => {
                let finalUri = media.uri;
                let extension = media.uri.split('.').pop() || 'jpg';
                if (media.type === 'image') {
                    const manipulated = await ImageManipulator.manipulateAsync(media.uri, [{ resize: { width: 1600 } }], { compress: 0.80, format: ImageManipulator.SaveFormat.WEBP });
                    finalUri = manipulated.uri;
                    extension = 'webp';
                } else if (media.type === 'video') {
                    const compressed = await VideoCompressor.compress(media.uri, { compressionMethod: 'auto', maxSize: 1280 });
                    finalUri = compressed;
                    extension = 'mp4';
                }
                const path = `memories/${resolvedCoupleId}/${uploadBatchId}_${index}.${extension}`;
                return uploadFile(finalUri, path, (p) => {
                    const avg = (p + (index * 100)) / selectedMedia.length;
                    setUploadProgress(avg);
                });
            });

            await addDoc(collection(db, 'couples', resolvedCoupleId, 'memories'), {
                title: title.trim(),
                content: content.trim(),
                image_url: imageUrls[0] || null,
                image_urls: imageUrls,
                sender_id: senderId,
                sender_name: profile?.display_name || null,
                sender_avatar_url: profile?.avatar_url || null,
                couple_id: resolvedCoupleId,
                memory_date: memoryDate,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });

            if (partnerProfile?.id) {
                await sendNotification({ recipientId: partnerProfile.id, actorId: senderId, type: 'memory', title: 'New Memory! ✨', message: `${profile?.display_name || 'Your partner'} uploaded a new moment.`, actionUrl: '/memories' });
            }

            await syncNow();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsComposeVisible(false);
            setTitle('');
            setContent('');
            setSelectedMedia([]);
        } catch (error) {
            Alert.alert('Error', 'Failed to save memory.');
        } finally {
            setIsSending(false);
        }
    };

    const [commentingMemoryId, setCommentingMemoryId] = useState<string | null>(null);

    const openComments = (memory: MemoryData) => {
        setCommentingMemoryId(memory.id);
    };

    const handleAddComment = (id: string, text: string) => {
        if (!id || !text.trim()) return;
        addCommentOptimistic(id, 'memory', text.trim());
    }

    const renderItem = useCallback(({ item, index }: { item: MemoryData, index: number }) => (
        <MemoryCard
            item={item}
            index={index}
            profile={profile}
            partnerProfile={partnerProfile}
            idToken={idToken}
            couple={couple}
            openMediaViewer={openMediaViewer}
            openComments={openComments}
            isActive={item.id === primaryVisibleMemoryId}
            isParentVisible={isMemoriesTabActive}
        />
    ), [profile, partnerProfile, idToken, couple, openMediaViewer, openComments, primaryVisibleMemoryId, isMemoriesTabActive]);

    const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 70, minimumViewTime: 180 }), []);

    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
        const nextId = viewableItems.find(t => t.isViewable)?.item?.id || null;
        setPrimaryVisibleMemoryId(prev => (prev === nextId ? prev : nextId));
    }).current;

    const listHeader = useMemo(() => (
        <View style={styles.standardHeader}>
            <Animated.View style={[styles.headerTitleRow, titleAnimatedStyle]}>
                <Animated.Text style={[styles.standardTitle, appMode === 'lunara' && styles.lunaraPageTitle]}>Memories</Animated.Text>
                <TouchableOpacity style={styles.addMemoryBtn} onPress={openComposer}>
                    <Plus color="white" size={20} strokeWidth={2.5} />
                </TouchableOpacity>
            </Animated.View>
            <Animated.Text style={[styles.standardSubtitle, sublineAnimatedStyle]}>A SHARED COLLECTION OF MOMENTS</Animated.Text>
        </View>
    ), [appMode, titleAnimatedStyle, sublineAnimatedStyle]);

    const keyExtractor = useCallback((item: any) => item.id, []);
    const getItemType = useCallback(() => 'memory', []);
    const openComposer = () => setIsComposeVisible(true);
    const closeComposer = () => { if (!isSending) setIsComposeVisible(false); };

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
                estimatedItemSize={520}
                drawDistance={250}
                removeClippedSubviews
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingTop: insets.top + 80, paddingBottom: 200 }}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={32}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="white" colors={[Colors.dark.rose[400]]} progressViewOffset={insets.top + 20} />}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={<View style={styles.emptyContainer}><GlassCard style={styles.emptyCard} intensity={12}><View style={{ alignItems: 'center' }}><ImageIconLucide size={40} color="rgba(255,255,255,0.08)" style={{ marginBottom: 24 }} /><Text style={styles.emptyTitle}>Your gallery is waiting</Text><Text style={styles.emptySubtext}>Capture your first moment together.</Text></View></GlassCard></View>}
            />

            <Modal
                isVisible={isComposeVisible}
                onSwipeComplete={closeComposer}
                onBackdropPress={closeComposer}
                swipeDirection={['down']}
                propagateSwipe={true}
                avoidKeyboard={true}
                style={{ margin: 0, justifyContent: 'flex-end' }}
                backdropOpacity={0.6}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                useNativeDriverForBackdrop
            >
                <View style={styles.drawerOverlay}>
                    <View style={styles.composerContent}>
                        <GlassCard style={styles.composerCard} intensity={40} contentStyle={{ flex: 1 }}>
                            <View style={styles.drawerHandleWrap}><View style={styles.drawerHandle} /></View>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity onPress={closeComposer} style={styles.closeBtn} disabled={isSending}><X size={24} color="white" /></TouchableOpacity>
                                <Text style={styles.modalLabel}>{isSending ? `UPLOADING ${Math.round(uploadProgress)}%` : 'NEW MEMORY'}</Text>
                                <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, (isSending || selectedMedia.length === 0) && { opacity: 0.5 }]} disabled={isSending || selectedMedia.length === 0}>
                                    {isSending ? <ActivityIndicator size="small" color="white" /> : <Send size={20} color="white" />}
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {selectedMedia.length === 0 ? (
                                    <TouchableOpacity style={styles.imagePickerPlaceholder} onPress={pickMedia}><View style={styles.pickerCircle}><CameraIcon size={32} color="white" /></View><Text style={styles.pickerTitle}>Choose Moment</Text></TouchableOpacity>
                                ) : (
                                    <View style={styles.mediaPreviewContainer}>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                            {selectedMedia.map((m, i) => (
                                                <View key={i} style={styles.mediaPreviewItem}><Image source={{ uri: m.uri }} style={styles.previewImage} contentFit="cover" /><TouchableOpacity style={styles.removeMediaBtn} onPress={() => setSelectedMedia(prev => prev.filter((_, idx) => idx !== i))}><X size={12} color="white" /></TouchableOpacity></View>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                                <TextInput style={styles.titleInput} placeholder="Story title..." placeholderTextColor="rgba(255,255,255,0.3)" value={title} onChangeText={setTitle} editable={!isSending} />
                                <TextInput style={styles.contentInput} placeholder="Caption..." placeholderTextColor="rgba(255,255,255,0.2)" multiline value={content} onChangeText={setContent} editable={!isSending} />
                            </ScrollView>
                        </GlassCard>
                    </View>
                </View>
            </Modal>

            {commentingMemoryId && (
                <CommentDrawer
                    visible={!!commentingMemoryId}
                    onClose={() => setCommentingMemoryId(null)}
                    memoryId={commentingMemoryId}
                    profile={profile}
                    idToken={idToken}
                    onAddComment={handleAddComment}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    stickyHeader: { position: 'absolute', left: 0, right: 0, zIndex: 1000, pointerEvents: 'box-none' },
    standardHeader: GlobalStyles.standardHeader,
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, width: '100%', paddingRight: 4 },
    standardTitle: GlobalStyles.standardTitle,
    lunaraPageTitle: { color: '#d8b4fe' },
    standardSubtitle: GlobalStyles.standardSubtitle,
    addMemoryBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.rose[500], justifyContent: 'center', alignItems: 'center' },
    memoryItem: { marginBottom: 60, backgroundColor: 'rgba(255,255,255,0.01)' },
    mediaFrame: { width: width, aspectRatio: 0.8, backgroundColor: '#050505', overflow: 'hidden' },
    mediaPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#050505' },
    mediaPlaceText: { color: 'rgba(255,255,255,0.1)', fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 1.5, marginTop: 12 },
    floatingIdentity: { position: 'absolute', top: 8, left: 8, zIndex: 10 },
    lunarPagination: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 },
    lunarDot: { height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
    captionArea: { paddingHorizontal: Spacing.md, marginTop: 20, gap: 6 },
    captionTitle: { color: 'white', fontSize: 22, fontFamily: Typography.serifBold },
    captionDate: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    captionText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, fontFamily: Typography.sans },
    captionUser: { fontFamily: Typography.sansBold, color: 'white' },
    commentsPreview: { marginTop: 12, gap: 4 },
    commentRow: { flexDirection: 'row', alignItems: 'flex-start' },
    commentText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontFamily: Typography.sans, lineHeight: 18 },
    commentUser: { fontFamily: Typography.sansBold, color: 'white' },
    viewAllComments: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: Typography.sans },
    thoughtsButton: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24 },
    thoughtBubbleInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    thoughtsPlaceholder: { color: 'rgba(255,255,255,0.3)', fontSize: 14, fontFamily: Typography.sans },
    drawerOverlay: { height: '85%', justifyContent: 'flex-end' },
    composerContent: { height: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' },
    composerCard: { flex: 1, backgroundColor: '#070708', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    drawerHandleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
    drawerHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    modalLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5 },
    sendBtn: { width: 44, height: 44, backgroundColor: Colors.dark.rose[600], borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    imagePickerPlaceholder: { width: '100%', aspectRatio: 1, borderRadius: Radius.xl, backgroundColor: 'rgba(255,255,255,0.03)', borderStyle: 'dashed', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
    pickerCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(251,113,133,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    pickerTitle: { fontSize: 18, fontFamily: Typography.serifBold, color: 'white' },
    titleInput: { fontSize: 24, fontFamily: Typography.serif, color: 'white', marginBottom: 24, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
    contentInput: { fontSize: 16, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.7)', lineHeight: 24, minHeight: 150, textAlignVertical: 'top' },
    mediaPreviewContainer: { marginBottom: 24 },
    mediaPreviewItem: { width: 100, height: 100, borderRadius: 12, marginRight: 12, overflow: 'hidden', position: 'relative' },
    previewImage: { ...StyleSheet.absoluteFillObject },
    removeMediaBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 10 },
    emptyContainer: { marginTop: 40, paddingHorizontal: Spacing.xl },
    emptyCard: { padding: 40, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    emptyTitle: { color: Colors.dark.foreground, fontSize: 20, fontFamily: Typography.serif, marginBottom: Spacing.sm },
    emptySubtext: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: Typography.sans, textAlign: 'center' }
});
