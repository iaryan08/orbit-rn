import React, { useState, useRef, useEffect } from 'react';
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
import { Gesture, GestureDetector, PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { X, Trash2, ShieldAlert, Download, Share2, Edit2 } from 'lucide-react-native';


import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../lib/store';
import { Spacing, Typography, Colors } from '../constants/Theme';
import { getPublicStorageUrl } from '../lib/storage';
import { db } from '../lib/firebase';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');

export function MediaViewer() {
    const { mediaViewerState, closeMediaViewer, idToken, profile, memories, polaroids } = useOrbitStore();
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
                        setEditedCaption(item.description || '');
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

    const handleSaveEdit = async () => {
        if (!mediaId || !type) return;
        try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const ref = doc(db, type === 'memory' ? 'memories' : 'polaroids', mediaId);
            const updateData: any = { caption: editedCaption };
            if (type === 'memory') {
                updateData.title = editedTitle;
                updateData.description = editedCaption;
                delete updateData.caption;
            }
            await updateDoc(ref, updateData);
            setIsEditing(false);
        } catch (err) {
            Alert.alert("Error", "Failed to update.");
        }
    };

    const handleDownload = async () => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setIsSaving(true);
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission", "Please allow access to your photos.");
                return;
            }
            const currentUrl = imageUrls[currentIndex];
            const fullUrl = getPublicStorageUrl(currentUrl, type === 'memory' ? 'memories' : 'polaroids', idToken);
            if (!fullUrl) return;

            const baseDir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? '';
            const fileName = currentUrl.split('/').pop() || 'image.jpg';
            const fileUri = `${baseDir}${fileName}`;
            const downloadRes = await FileSystem.downloadAsync(fullUrl, fileUri);

            await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
            Alert.alert("Success", "Saved to gallery!");
        } catch (err) {
            Alert.alert("Error", "Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!mediaId || !type) return;
        Alert.alert("Delete", "Permanently delete this memory?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        const ref = doc(db, type === 'memory' ? 'memories' : 'polaroids', mediaId);
                        await deleteDoc(ref);
                        handleClose();
                    } catch (err) {
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

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: scale.value > 1.05 ? 1 : interpolate(translateY.value, [-300, 0, 300], [0, 1, 0], Extrapolate.CLAMP),
    }));

    if (!isOpen) return null;

    return (
        <Modal transparent visible animationType="none" onRequestClose={handleClose}>
            <GestureHandlerRootView style={styles.container}>
                <Animated.View style={[styles.backdrop, backdropStyle]} />

                {/* Header Controls */}
                <View style={[styles.headerBar, { top: insets.top + 4 }]}>
                    <View style={styles.headerLeft} />
                    <TouchableOpacity style={styles.premiumIconBtn} onPress={handleClose}>
                        <X color="white" size={24} strokeWidth={2.5} />
                    </TouchableOpacity>
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
                            {imageUrls.map((url, i) => (
                                <View key={i} style={styles.slide}>
                                    <Image
                                        source={{ uri: getPublicStorageUrl(url, type === 'memory' ? 'memories' : 'polaroids', idToken) || undefined }}
                                        style={styles.fullImage}
                                        resizeMode="contain"
                                        onLoadStart={() => i === currentIndex && setIsLoading(true)}
                                        onLoadEnd={() => i === currentIndex && setIsLoading(false)}
                                    />
                                    {isLoading && i === currentIndex && (
                                        <View style={styles.loader}>
                                            <ActivityIndicator color="white" />
                                        </View>
                                    )}
                                </View>
                            ))}
                        </Animated.ScrollView>
                    </Animated.View>
                </GestureDetector>

                {/* Footer Controls */}
                <View style={[styles.footerBar, { bottom: insets.bottom + Spacing.lg }]}>
                    <View style={styles.footerLeft}>
                        {profile?.id === ownerId && (
                            <View style={styles.ownerActions}>
                                <TouchableOpacity style={styles.premiumIconBtn} onPress={() => setIsEditing(true)}>
                                    <Edit2 color="white" size={20} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.premiumIconBtn, { backgroundColor: 'rgba(255,59,48,0.1)' }]}
                                    onPress={handleDelete}
                                >
                                    <Trash2 color="#FF3B30" size={20} />
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <View style={styles.footerRight}>
                        <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload} disabled={isSaving}>
                            <View style={[styles.downloadGlass, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                                {isSaving ? <ActivityIndicator size="small" color="white" /> : (
                                    <>
                                        <Download color="white" size={18} />
                                        <Text style={styles.downloadText}>Save</Text>
                                    </>
                                )}
                            </View>
                        </TouchableOpacity>

                    </View>
                </View>

                {/* Image Counter */}
                {imageUrls.length > 1 && (
                    <View style={[styles.counter, { bottom: insets.bottom + 42 }]}>
                        <Text style={styles.counterText}>{currentIndex + 1} / {imageUrls.length}</Text>
                    </View>
                )}

                {/* Edit Modal */}
                <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)}>
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
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    downloadText: { color: 'white', fontFamily: Typography.sansBold, fontSize: 13 },
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
