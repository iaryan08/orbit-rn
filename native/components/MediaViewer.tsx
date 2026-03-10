import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    TouchableOpacity,
    Image,
    Modal,
    ActivityIndicator,
    Alert,
    TextInput
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { Gesture, GestureDetector, PanGestureHandler, State, GestureHandlerRootView, ScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { X, Trash2, ShieldAlert, Download, Share2, Edit2, BookmarkPlus, Heart } from 'lucide-react-native';
import { savePolaroidToMemories } from '../lib/auth';


import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { Spacing, Typography, Colors } from '../constants/Theme';
import { getPublicStorageUrl, isVideoUrl } from '../lib/storage';
import { db } from '../lib/firebase';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useVideoPlayer, VideoView } from 'expo-video';

const { width, height } = Dimensions.get('window');
import { usePersistentMedia } from '../lib/media';

const ViewerMedia = React.memo(({
    url,
    bucket,
    idToken,
    isActive,
    isOpen,
    onLoadStart,
    onLoadEnd,
}: {
    url: string;
    bucket: 'memories' | 'polaroids';
    idToken: string | null | undefined;
    isActive: boolean;
    isOpen: boolean;
    onLoadStart: () => void;
    onLoadEnd: () => void;
}) => {
    const rawUrl = getPublicStorageUrl(url, bucket, idToken);
    const videoMedia = useMemo(() => isVideoUrl(url), [url]);

    // Use the optimized media engine with content-stable ID (URL)
    // We pass isActive as isVisible to only trigger network downloads for the CURRENT slide.
    // However, local files will load instantly for all slides since they are sticky.
    const sourceUri = usePersistentMedia(url, rawUrl || undefined, isActive && isOpen);

    const player = useVideoPlayer(videoMedia ? (sourceUri || '') : '', (p) => {
        p.loop = true;
    });

    useEffect(() => {
        if (!videoMedia || !sourceUri || !isOpen) return;
        try {
            player.replace({ uri: sourceUri });
        } catch { }
    }, [sourceUri, videoMedia, player, isOpen]);

    useEffect(() => {
        if (!videoMedia) return;
        // Only trigger onLoadEnd once we have a source
        if (sourceUri) onLoadEnd();

        if (isOpen && isActive) {
            player.play();
        } else {
            player.pause();
        }
    }, [videoMedia, isOpen, isActive, player, onLoadEnd, sourceUri]);

    if (videoMedia) {
        return (
            <VideoView
                player={player}
                style={styles.fullImage}
                contentFit="contain"
                nativeControls
                allowsFullscreen
                allowsPictureInPicture={false}
            />
        );
    }

    return (
        <Image
            source={{ uri: sourceUri }}
            style={styles.fullImage}
            resizeMode="contain"
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
        />
    );
});

export function MediaViewer() {
    const { mediaViewerState, closeMediaViewer, idToken, profile, memories, polaroids, couple } = useOrbitStore();
    const { isOpen, imageUrls, initialIndex, ownerId, mediaId, type } = mediaViewerState;
    const insets = useSafeAreaInsets();

    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedCaption, setEditedCaption] = useState('');
    const [editedTitle, setEditedTitle] = useState('');

    const scrollRef = useRef<Animated.ScrollView>(null);

    // Reanimated Shared Values
    const scale = useSharedValue(1);
    const lastScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const opacity = useSharedValue(0);

    // Track pan offsets to prevent jumping
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            opacity.value = withTiming(1, { duration: 300 });

            // Reset gesture states
            translateX.value = 0;
            translateY.value = 0;
            offsetX.value = 0;
            offsetY.value = 0;
            scale.value = 1;
            lastScale.value = 1;

            if (mediaId && type) {
                if (type === 'memory') {
                    const item = memories.find(m => m.id === mediaId);
                    if (item) {
                        setEditedTitle(item.title || '');
                        setEditedCaption(item.content || '');
                    }
                } else {
                    const item = polaroids.find(p => p.id === mediaId);
                    if (item) {
                        setEditedTitle('');
                        setEditedCaption(item.caption || '');
                    }
                }
            }
        } else {
            opacity.value = withTiming(0, { duration: 200 });
            setIsEditing(false);
        }
    }, [isOpen, initialIndex, memories, polaroids]);

    const handleClose = () => {
        opacity.value = withTiming(0, { duration: 200 }, () => {
            runOnJS(closeMediaViewer)();
        });
    };

    const getMediaDocRef = () => {
        if (!mediaId || !type || !couple?.id) return null;
        return doc(db, 'couples', couple.id, type === 'memory' ? 'memories' : 'polaroids', mediaId);
    };

    const handleSaveEdit = async () => {
        const mediaRef = getMediaDocRef();
        if (!mediaRef) {
            Alert.alert("Error", "Missing couple or media context.");
            return;
        }
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const updateData: any = { updated_at: serverTimestamp() };
            if (type === 'memory') {
                updateData.title = editedTitle;
                updateData.content = editedCaption;
            } else {
                updateData.caption = editedCaption;
            }
            await updateDoc(mediaRef, updateData);
            setIsEditing(false);
        } catch (err: any) {
            Alert.alert("Error", `Failed to update: ${err?.message || 'Unknown error'}`);
        }
    };

    const handleDownload = async () => {
        if (isSaving || !imageUrls[currentIndex]) return;
        try {
            setIsSaving(true);
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission", "Please allow gallery access to save media.");
                return;
            }

            const currentUrl = imageUrls[currentIndex];
            const fullUrl = getPublicStorageUrl(currentUrl, type === 'memory' ? 'memories' : 'polaroids', idToken);
            if (!fullUrl) throw new Error("Could not resolve URL");

            const extension = isVideoUrl(currentUrl) ? 'mp4' : 'jpg';
            const fileName = `orbit_${Date.now()}.${extension}`;
            // @ts-ignore
            const fileUri = (FileSystem.cacheDirectory || '') + fileName;

            const downloadRes = await FileSystem.downloadAsync(fullUrl, fileUri);
            if (downloadRes.status !== 200) throw new Error("Download failed");

            await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Success", "Saved to gallery!");
        } catch (err) {
            console.error("[MediaViewer] Download error:", err);
            Alert.alert("Error", "Failed to save media.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveMemory = async () => {
        if (!mediaId || type !== 'polaroid') return;
        const item = polaroids.find(p => p.id === mediaId);
        if (!item) return;

        try {
            setIsSaving(true);
            const res = await savePolaroidToMemories(item);
            if (res.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Saved!", "This polaroid has been added to your permanent memories archive.");
            } else {
                Alert.alert("Error", res.error || "Failed to save memory.");
            }
        } catch (err) {
            Alert.alert("Error", "Something went wrong.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        const mediaRef = getMediaDocRef();
        if (!mediaId || !type || !couple?.id) {
            Alert.alert("Error", "Missing couple or media context.");
            return;
        }

        Alert.alert("Delete", "Permanently delete this memory?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                        // NEW Orbit V2 Pattern: Integrated Optimistic Soft-Delete
                        if (type === 'memory') {
                            const item = memories.find(m => m.id === mediaId);
                            if (item) {
                                useOrbitStore.getState().deleteMemoryOptimistic(item);
                            } else {
                                // Fallback for edge cases
                                await deleteDoc(mediaRef!);
                            }
                        } else {
                            // Polaroids use simple delete for now
                            await deleteDoc(mediaRef!);
                        }

                        handleClose();
                    } catch (err: any) {
                        Alert.alert("Error", `Failed to delete: ${err?.message || 'Unknown error'}`);
                    }
                }
            }
        ]);
    };

    // --- GESTURES ---

    // Simple, rock-solid zoom from center to avoid 'random jumping' focal points
    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = Math.max(1, Math.min(e.scale * lastScale.value, 6));
        })
        .onEnd(() => {
            lastScale.value = scale.value;
            if (scale.value < 1.1) {
                scale.value = withSpring(1);
                lastScale.value = 1;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                offsetX.value = 0;
                offsetY.value = 0;
            }
        });

    const panGesture = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onUpdate((e) => {
            if (scale.value > 1.05) {
                translateX.value = offsetX.value + e.translationX;
                translateY.value = offsetY.value + e.translationY;
            } else {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (scale.value > 1.05) {
                const boundX = (width * scale.value - width) / 2;
                const boundY = (height * scale.value - height) / 2;

                translateX.value = withSpring(Math.max(-boundX, Math.min(translateX.value, boundX)), { damping: 20 });
                translateY.value = withSpring(Math.max(-boundY, Math.min(translateY.value, boundY)), { damping: 20 });

                offsetX.value = Math.max(-boundX, Math.min(translateX.value, boundX));
                offsetY.value = Math.max(-boundY, Math.min(translateY.value, boundY));
            } else {
                if (Math.abs(e.translationY) > 150) {
                    runOnJS(handleClose)();
                } else {
                    translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
                }
            }
        });

    const doubleTapGesture = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > 1.1) {
                scale.value = withSpring(1);
                lastScale.value = 1;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                offsetX.value = 0;
                offsetY.value = 0;
            } else {
                scale.value = withSpring(3);
                lastScale.value = 3;
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                offsetX.value = 0;
                offsetY.value = 0;
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { scale: scale.value },
            { translateX: translateX.value / scale.value },
            { translateY: translateY.value / scale.value },
        ],
    }));

    if (!isOpen) return null;

    return (
        <Modal
            transparent={false}
            visible
            animationType="none"
            statusBarTranslucent={true}
            onRequestClose={handleClose}
        >
            <GestureHandlerRootView style={styles.container}>
                <View style={styles.backdrop} />

                {/* Header Controls */}
                <View style={[styles.headerBar, { top: insets.top + 4 }]}>
                    <View style={styles.headerLeft} />
                    <GHTouchableOpacity style={styles.premiumIconBtn} onPress={handleClose}>
                        <X color="white" size={24} strokeWidth={2.5} />
                    </GHTouchableOpacity>
                </View>

                <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture)}>
                    <Animated.View style={[styles.mediaContainer, animatedStyle]}>
                        <Animated.ScrollView
                            ref={scrollRef}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            contentOffset={{ x: initialIndex * width, y: 0 }}
                            scrollEnabled={scale.value <= 1.05}
                            onMomentumScrollEnd={(e) => {
                                const index = Math.round(e.nativeEvent.contentOffset.x / width);
                                if (index !== currentIndex) {
                                    setCurrentIndex(index);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                            }}
                            style={styles.scrollView}
                        >
                            {imageUrls.map((url, i) => {
                                // Render only the current, previous, and next image to optimize performance
                                const shouldRender = Math.abs(i - currentIndex) <= 1;
                                return (
                                    <View key={i} style={styles.slide}>
                                        {shouldRender ? (
                                            <ViewerMedia
                                                url={url}
                                                bucket={type === 'memory' ? 'memories' : 'polaroids'}
                                                idToken={idToken}
                                                isActive={i === currentIndex}
                                                isOpen={isOpen}
                                                onLoadStart={() => i === currentIndex && setIsLoading(true)}
                                                onLoadEnd={() => i === currentIndex && setIsLoading(false)}
                                            />
                                        ) : (
                                            // Placeholder for non-rendered images to maintain scroll position
                                            <View style={[styles.fullImage, { backgroundColor: 'transparent' }]} />
                                        )}
                                        {isLoading && i === currentIndex && (
                                            <View style={styles.loader}>
                                                <ActivityIndicator color="white" />
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </Animated.ScrollView>
                    </Animated.View>
                </GestureDetector>

                {/* Footer Controls */}
                <View style={[styles.footerBar, { bottom: insets.bottom + Spacing.lg }]}>
                    <View style={styles.footerLeft}>
                        {/* Orbit V2: Memories & Polaroids are shared assets; allow both partners to manage them */}
                        {(profile?.id === ownerId || type === 'memory' || type === 'polaroid') && (
                            <View style={styles.ownerActions}>
                                {type === 'polaroid' && (
                                    <GHTouchableOpacity
                                        style={[styles.premiumIconBtn, { backgroundColor: 'rgba(251,113,133,0.1)' }]}
                                        onPress={handleSaveMemory}
                                        disabled={isSaving}
                                    >
                                        <BookmarkPlus color={Colors.dark.rose[400]} size={20} />
                                    </GHTouchableOpacity>
                                )}
                                <GHTouchableOpacity style={styles.premiumIconBtn} onPress={() => setIsEditing(true)}>
                                    <Edit2 color="white" size={20} />
                                </GHTouchableOpacity>
                                <GHTouchableOpacity
                                    style={[styles.premiumIconBtn, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                                    onPress={handleDelete}
                                >
                                    <Trash2 color="#FF3B30" size={20} />
                                </GHTouchableOpacity>
                            </View>
                        )}
                    </View>

                    <View style={styles.footerRight}>
                        <GHTouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={isSaving}>
                            <View style={[styles.downloadGlass, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                                {isSaving ? <ActivityIndicator size="small" color="white" /> : (
                                    <Download color="white" size={18} />
                                )}
                            </View>
                        </GHTouchableOpacity>
                    </View>
                </View>

                {/* Image Counter */}
                {imageUrls.length > 1 && (
                    <View style={[styles.counter, { bottom: insets.bottom + 42 }]}>
                        <Text style={styles.counterText}>{currentIndex + 1} / {imageUrls.length}</Text>
                    </View>
                )}

                {/* Edit Modal */}
                <Modal visible={isEditing} transparent animationType="fade" statusBarTranslucent={true} onRequestClose={() => setIsEditing(false)}>
                    <View style={styles.editOverlay}>
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.85)' }]} />
                        <TouchableOpacity style={styles.editBackdrop} activeOpacity={1} onPress={() => setIsEditing(false)} />

                        <View style={[styles.editCard, { marginBottom: insets.bottom + 100 }]}>
                            <Text style={styles.editHeader}>Edit Thought</Text>
                            {type === 'memory' && (
                                <TextInput
                                    style={styles.editInputTitle}
                                    value={editedTitle}
                                    onChangeText={setEditedTitle}
                                    placeholder="Title"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                />
                            )}
                            <TextInput
                                style={styles.editInputCaption}
                                value={editedCaption}
                                onChangeText={setEditedCaption}
                                placeholder="Edit your thought..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                multiline
                            />
                            <View style={styles.editActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                                    <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                                    <Text style={styles.saveBtnText}>Save</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'black',
    },
    headerBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        zIndex: 100,
    },
    headerLeft: { flex: 1 },
    footerBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingHorizontal: Spacing.lg,
        zIndex: 100,
    },
    footerLeft: { flex: 1 },
    footerRight: { flex: 1, alignItems: 'flex-end' },
    ownerActions: { flexDirection: 'row', gap: Spacing.sm },
    premiumIconBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    downloadBtn: { overflow: 'hidden', borderRadius: 24 },
    downloadGlass: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    mediaContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollView: { flex: 1 },
    slide: { width, height, justifyContent: 'center', alignItems: 'center' },
    fullImage: { width, height },
    loader: { position: 'absolute' },
    counter: {
        position: 'absolute',
        alignSelf: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    counterText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
        opacity: 0.7,
    },
    editOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    editBackdrop: { ...StyleSheet.absoluteFillObject },
    editCard: {
        width: width * 0.88,
        backgroundColor: 'rgba(15,15,15,0.95)',
        borderRadius: 32,
        padding: Spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    editHeader: {
        fontSize: 22,
        fontFamily: Typography.sansBold,
        color: 'white',
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    editInputTitle: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: Spacing.md,
        color: 'white',
        fontFamily: Typography.sansBold,
        fontSize: 17,
        marginBottom: Spacing.md,
    },
    editInputCaption: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: Spacing.md,
        color: 'white',
        fontFamily: Typography.sansBold,
        fontSize: 15,
        minHeight: 120,
        textAlignVertical: 'top',
        marginBottom: Spacing.xl,
    },
    editActions: { flexDirection: 'row', gap: Spacing.md },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    cancelBtnText: { color: 'rgba(255,255,255,0.5)', fontFamily: Typography.sansBold, fontSize: 15 },
    saveBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: 'white',
    },
    saveBtnText: { color: 'black', fontFamily: Typography.sansBold, fontSize: 15 }
});
