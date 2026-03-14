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
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedKeyboard,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { Gesture, GestureDetector, PanGestureHandler, State, GestureHandlerRootView, ScrollView, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { ProfileAvatar } from './ProfileAvatar';
import { X, Trash2, ShieldAlert, Download, Share2, Edit2, BookmarkPlus, Heart, MessageCircle, Send, LogOut } from 'lucide-react-native';


import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { Spacing, Typography, Colors } from '../constants/Theme';
import { getPublicStorageUrl, isVideoUrl } from '../lib/storage';
import { normalizeDate } from '../lib/utils';
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

    const sourceUri = usePersistentMedia(url, rawUrl || undefined, isActive && isOpen);
    const finalUri = sourceUri || rawUrl || undefined;

    const player = useVideoPlayer(sourceUri || rawUrl || '', (p) => {
        p.loop = true;
        if (isOpen && isActive) p.play();
    });

    useEffect(() => {
        if (!videoMedia) return;
        // Only trigger onLoadEnd once we have a source
        if (finalUri) onLoadEnd();

        if (isOpen && isActive) {
            player.play();
        } else {
            player.pause();
        }
    }, [videoMedia, isOpen, isActive, player, onLoadEnd, finalUri]);

    if (videoMedia) {
        if (!finalUri) return <View style={[styles.fullImage, { backgroundColor: 'black' }]} />;
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
            source={{ uri: finalUri || undefined }}
            style={styles.fullImage}
            resizeMode="contain"
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
        />
    );
});

export function MediaViewer() {
    const mediaViewerState = useOrbitStore(s => s.mediaViewerState);
    const closeMediaViewer = useOrbitStore(s => s.closeMediaViewer);
    const idToken = useOrbitStore(s => s.idToken);
    const profile = useOrbitStore(s => s.profile);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const memories = useOrbitStore(s => s.memories);
    const polaroids = useOrbitStore(s => s.polaroids);
    const couple = useOrbitStore(s => s.couple);
    const { isOpen, imageUrls, initialIndex, ownerId, mediaId, type } = mediaViewerState;
    const insets = useSafeAreaInsets();

    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedCaption, setEditedCaption] = useState('');
    const [editedTitle, setEditedTitle] = useState('');
    const [newComment, setNewComment] = useState('');
    const [showComments, setShowComments] = useState(false);

    // Helper to resolve avatar (comment data -> partnerProfile -> fallback)
    const resolveAvatar = (item: any) => {
        if (item.user_avatar_url) return item.user_avatar_url;
        if (item.user_id === partnerProfile?.id) return partnerProfile?.avatar_url;
        if (item.user_id === profile?.id) return profile?.avatar_url;
        return null;
    };

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

    const keyboard = useAnimatedKeyboard();
    const animatedKeyboardStyle = useAnimatedStyle(() => ({
        paddingBottom: keyboard.height.value,
    }));

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
            setShowComments(false);

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
            setNewComment('');
        } else {
            opacity.value = withTiming(0, { duration: 200 });
            setIsEditing(false);
            setShowComments(false);
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
        if (!mediaRef || !mediaId) {
            Alert.alert("Error", "Missing couple or media context.");
            return;
        }
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const updateData: any = { updated_at: serverTimestamp() };
            if (type === 'memory') {
                updateData.title = editedTitle;
                updateData.content = editedCaption;
                useOrbitStore.getState().updateMemoryOptimistic(mediaId, { title: editedTitle, content: editedCaption });
            } else {
                updateData.caption = editedCaption;
                useOrbitStore.getState().updatePolaroidOptimistic(mediaId, { caption: editedCaption });
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useOrbitStore.getState().savePolaroidToMemoriesOptimistic(item);
            // Close after saving to memories from polaroid view
            handleClose();
        } catch (err) {
            Alert.alert("Error", "Something went wrong.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddComment = () => {
        if (!newComment.trim() || !mediaId || !type) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        useOrbitStore.getState().addCommentOptimistic(mediaId, type as any, newComment.trim());
        setNewComment('');
    };

    const handleMoveOutOfMemory = () => {
        if (!mediaId || type !== 'memory') return;
        const item = memories.find(m => m.id === mediaId);
        if (!item?.source_polaroid_id) return;

        Alert.alert("Move to Polaroids", "Remove this from memories and return it to the Polaroid stack?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Move",
                onPress: async () => {
                    try {
                        setIsSaving(true);
                        // Pattern: Tombstone memory and re-enable polaroid if needed 
                        // (Actually the janitor might have deleted the polaroid if > 48h)
                        // User request: "move it out of the memory section"
                        // I'll just delete the memory. The polaroid stays if it hasn't expired.
                        useOrbitStore.getState().deleteMemoryOptimistic(item);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        handleClose();
                    } catch (err) {
                        Alert.alert("Error", "Failed to move.");
                    } finally {
                        setIsSaving(false);
                    }
                }
            }
        ]);
    };

    const currentItem = useMemo(() => {
        if (type === 'memory') return memories.find(m => m.id === mediaId);
        return polaroids.find(p => p.id === mediaId);
    }, [memories, polaroids, mediaId, type]);

    const isOwner = profile?.id === ownerId;
    const canMoveOut = type === 'memory' && (currentItem as any)?.source_polaroid_id && (isOwner || (currentItem as any)?.sender_id === profile?.id);

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
                // Prevent horizontal swipes from closing when zoomed out (only vertical closes)
                if (Math.abs(e.translationY) > Math.abs(e.translationX)) {
                    translateY.value = e.translationY;
                }
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
                // Only close on vertical swipe
                const isVerticalSwipe = Math.abs(e.translationY) > Math.abs(e.translationX);

                if (isVerticalSwipe && (Math.abs(e.translationY) > 100 || Math.abs(e.velocityY) > 500)) {
                    runOnJS(handleClose)();
                } else {
                    translateY.value = withTiming(0, { duration: 200 });
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
                            scrollEnabled={true} // Fixed: Allow scrolling, gesture handles pinch-zoom logic
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
                        {/* Orbit V2 Rules: Polaroids & Memories are shared, but deletion is owner-only */}
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

                            {canMoveOut && (
                                <GHTouchableOpacity
                                    style={[styles.premiumIconBtn, { backgroundColor: 'rgba(56,189,248,0.1)' }]}
                                    onPress={handleMoveOutOfMemory}
                                    disabled={isSaving}
                                >
                                    <LogOut color="#38BDF8" size={20} style={{ transform: [{ rotate: '90deg' }] }} />
                                </GHTouchableOpacity>
                            )}

                            {isOwner && (
                                <>
                                    <GHTouchableOpacity style={styles.premiumIconBtn} onPress={() => setIsEditing(true)}>
                                        <Edit2 color="white" size={20} />
                                    </GHTouchableOpacity>
                                    <GHTouchableOpacity
                                        style={[styles.premiumIconBtn, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                                        onPress={handleDelete}
                                    >
                                        <Trash2 color="#FF3B30" size={20} />
                                    </GHTouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>

                    <View style={styles.footerRight}>
                        <GHTouchableOpacity
                            style={[styles.commentActionBtn, showComments && { backgroundColor: 'rgba(251,113,133,0.15)', borderColor: 'rgba(251,113,133,0.2)' }]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setShowComments(!showComments);
                            }}
                        >
                            <MessageCircle color={showComments ? Colors.dark.rose[400] : "white"} size={20} />
                        </GHTouchableOpacity>
                        <GHTouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={isSaving}>
                            <View style={[styles.downloadGlass, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                                {isSaving ? <ActivityIndicator size="small" color="white" /> : (
                                    <Download color="white" size={18} />
                                )}
                            </View>
                        </GHTouchableOpacity>
                    </View>
                </View>

                {/* Integrated Comment Section */}
                {showComments && scale.value < 1.1 && (
                    <Animated.View
                        style={[styles.commentSectionWrapper, animatedKeyboardStyle]}
                    >
                        <Animated.View style={[styles.commentSection, { bottom: insets.bottom + 90 }]}>
                        <View style={styles.commentHeader}>
                            <Text style={styles.commentHeaderTitle}>THOUGHTS</Text>
                            <TouchableOpacity onPress={() => setShowComments(false)}>
                                <X size={14} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.commentList} contentContainerStyle={styles.commentContent} showsVerticalScrollIndicator={false}>
                            {(currentItem?.comments && (currentItem.comments as any[]).length > 0) ? (
                                (currentItem.comments as any[]).map((c: any) => (
                                    <View key={c.id} style={styles.commentItem}>
                                        <View style={styles.commentUserRow}>
                                            <View style={styles.commentUserMain}>
                                                <ProfileAvatar 
                                                    url={getPublicStorageUrl(resolveAvatar(c), 'avatars', idToken)}
                                                    size={22}
                                                    fallbackText={c.user_name?.[0]}
                                                />
                                                <Text style={styles.commentUser}>{c.user_name}</Text>
                                            </View>
                                            <Text style={styles.commentTime}>
                                                {c.created_at ? normalizeDate(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </Text>
                                        </View>
                                        <Text style={styles.commentText}>{c.text}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.noCommentsText}>Be the first to leave a thought...</Text>
                            )}
                        </ScrollView>
                        <View style={styles.commentInputRow}>
                            <TextInput
                                style={styles.commentInput}
                                placeholder="Add a comment..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={newComment}
                                onChangeText={setNewComment}
                                blurOnSubmit={false}
                                onSubmitEditing={handleAddComment}
                            />
                            <TouchableOpacity
                                style={[styles.sendBtn, !newComment.trim() && { opacity: 0.5 }]}
                                onPress={handleAddComment}
                                disabled={!newComment.trim()}
                            >
                                <Send size={16} color="white" />
                            </TouchableOpacity>
                        </View>
                        </Animated.View>
                    </Animated.View>
                )}

                {/* Image Counter */}
                {imageUrls.length > 1 && !showComments && (
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
    footerRight: { 
        flex: 1, 
        flexDirection: 'row', 
        justifyContent: 'flex-end', 
        alignItems: 'center',
        gap: Spacing.sm 
    },
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
        fontSize: 14,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
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
        fontSize: 17,
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
    cancelBtnText: { color: 'rgba(255,255,255,0.75)', fontFamily: Typography.sansBold, fontSize: 15 },
    saveBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        backgroundColor: 'white',
    },
    saveBtnText: { color: 'black', fontFamily: Typography.sansBold, fontSize: 15 },
    commentSectionWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    commentSection: {
        position: 'absolute',
        left: Spacing.lg,
        right: Spacing.lg,
        maxHeight: 300,
        backgroundColor: 'rgba(20,20,25,0.92)',
        borderRadius: 24,
        padding: 16,
        paddingBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    commentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    commentHeaderTitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },
    commentList: {
        maxHeight: 160,
        marginBottom: 12,
    },
    commentContent: {
        paddingBottom: 4,
    },
    commentItem: {
        marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 10,
        borderRadius: 12,
    },
    commentUserRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    commentUserMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    commentUser: {
        color: Colors.dark.rose[400],
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    commentTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: Typography.sans,
    },
    commentText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontFamily: Typography.sans,
        lineHeight: 18,
    },
    noCommentsText: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 13,
        fontFamily: Typography.serif,
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 20,
    },
    commentInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingHorizontal: 16,
        height: 48,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    commentInput: {
        flex: 1,
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sans,
        marginRight: 8,
    },
    commentActionBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    sendBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.dark.rose[500],
        alignItems: 'center',
        justifyContent: 'center',
    }
});
