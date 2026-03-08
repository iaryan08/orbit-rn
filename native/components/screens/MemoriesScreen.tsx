import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView, NativeSyntheticEvent, NativeScrollEvent, Modal, TextInput, KeyboardAvoidingView, Platform, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useOrbitStore } from '../../lib/store';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { Pin } from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import Animated, { useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderPill } from '../../components/HeaderPill';
import { FlashList } from '@shopify/flash-list';
import { getPublicStorageUrl } from '../../lib/storage';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';
import { X, Send, Camera as CameraIcon, Image as ImageIconLucide, Calendar as CalendarIcon, Video, AlertCircle, ChevronDown, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';

const { width } = Dimensions.get('window');
const AnimatedFlashList = Animated.createAnimatedComponent<any>(FlashList);

// --- Sub-components to avoid hook violations ---

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

const MemoryImage = React.memo(({ url, idToken, onPress }: { url: string, idToken: string | null, onPress: () => void }) => {
    const imageUrl = useMemo(() => getPublicStorageUrl(url, 'memories', idToken), [url, idToken]);
    return (
        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
            <Image
                source={{ uri: imageUrl || undefined }}
                style={styles.mediaFull}
                contentFit="cover"
                transition={300}
                cachePolicy="memory-disk"
            />
        </TouchableOpacity>
    );
});

const MemoryCard = React.memo(({ item, profile, partnerProfile, idToken, couple }: { item: any, profile: any, partnerProfile: any, idToken: string | null, couple: any }) => {
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
    };

    const onScrollBeginDrag = () => {
        // Double-ensure it's locked when scrolling starts on images
        setPagerScrollEnabled(false);
    };

    const onScrollEndDrag = () => {
        // We don't unlock here, we wait for better areas
    };

    // Safety: No specialized touch listeners needed since we disable tab-swiping 
    // globally for this tab in index.tsx for an Instagram-style experience.
    // This makes the text area 100% responsive for vertical scrolling.

    return (
        <View
            style={styles.memoryItem}
            onTouchStart={() => setPagerScrollEnabled(true)}
        >
            {/* Media Content - 100vw Immersive Carousel */}
            <View
                style={styles.mediaFrame}
                onTouchStart={(e) => {
                    e.stopPropagation();
                    setPagerScrollEnabled(false);
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
                    onScrollBeginDrag={onScrollBeginDrag}
                    onScrollEndDrag={onScrollEndDrag}
                >
                    {imageUrls.length > 0 ? (
                        imageUrls.map((url: string, i: number) => (
                            <MemoryImage
                                key={i}
                                url={url}
                                idToken={idToken}
                                onPress={() => {
                                    openMediaViewer(imageUrls, i, item.sender_id, item.id, 'memory');
                                    // Mark as read by current user
                                    if (profile?.id && !item.read_by?.includes(profile.id)) {
                                        const memoryRef = doc(db, 'couples', couple?.id, 'memories', item.id);
                                        updateDoc(memoryRef, {
                                            read_by: arrayUnion(profile.id)
                                        }).catch(err => console.error("Error marking memory read:", err));
                                    }
                                }}
                            />
                        ))
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

                <TouchableOpacity style={styles.thoughtsButton} activeOpacity={0.7}>
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
    const { profile, partnerProfile, couple, memories, idToken, fetchData } = useOrbitStore();
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

    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [85, 125], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [85, 125], [1, 0.9], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [0, 60], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [105, 135], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [105, 135], [5, 0], Extrapolate.CLAMP) }]
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

    const uploadFile = async (uri: string, path: string) => {
        const response = await fetch(uri);
        const blob = await response.blob();
        const fileRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(fileRef, blob);

        return new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                },
                (error) => reject(error),
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                }
            );
        });
    };

    const handleSend = async () => {
        if (selectedMedia.length === 0) {
            Alert.alert('No Media', 'Please select at least one photo or video.');
            return;
        }
        if (!title.trim()) {
            Alert.alert('Missing Title', 'Please add a title for this memory.');
            return;
        }
        if (!couple?.id) {
            Alert.alert('Error', 'Could not identify your couple profile. Please try again.');
            return;
        }

        setIsSending(true);
        setUploadProgress(0);

        try {
            const uploadPromises = selectedMedia.map((media, index) => {
                const extension = media.uri.split('.').pop();
                const path = `memories/${couple.id}/${Date.now()}_${index}.${extension}`;
                return uploadFile(media.uri, path);
            });

            const imageUrls = await Promise.all(uploadPromises);

            const memoryData = {
                title: title.trim(),
                content: content.trim(),
                image_urls: imageUrls,
                sender_id: profile.id,
                couple_id: couple.id,
                memory_date: memoryDate,
                created_at: serverTimestamp(),
            };

            await addDoc(collection(db, 'couples', couple.id, 'memories'), memoryData);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsComposeVisible(false);
            setTitle('');
            setContent('');
            setSelectedMedia([]);
            setMemoryDate(new Date());
        } catch (error) {
            console.error('Error saving memory:', error);
            Alert.alert('Error', 'Failed to save memory.');
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
        />
    ), [profile, partnerProfile, idToken, couple]);

    return (
        <View style={styles.container}>
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Memories" scrollOffset={scrollOffset} count={memories?.length} />
            </Animated.View>

            <AnimatedFlashList
                data={memories}
                renderItem={renderItem}
                keyExtractor={(item: any) => item.id}
                estimatedItemSize={450}
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
                        <Animated.View style={[styles.galleryBadgeRow, sublineAnimatedStyle]}>
                            <View style={styles.galleryDot} />
                            <Text style={styles.galleryBadgeText}>ETERNAL GALLERY</Text>
                            <Text style={styles.badgeCount}>{memories.length}</Text>
                        </Animated.View>
                        <Animated.View style={[styles.headerTitleRow, titleAnimatedStyle]}>
                            <Text style={styles.pageTitle}>Memories</Text>
                            <TouchableOpacity
                                style={styles.addMemoryBtn}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setIsComposeVisible(true);
                                }}
                            >
                                <Plus color="white" size={24} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </Animated.View>
                        <Animated.Text style={[styles.pageSubtitle, sublineAnimatedStyle]}>
                            A library of your shared time.
                        </Animated.Text>
                    </View>
                }
                ListEmptyComponent={
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
                }
            />

            <Modal
                visible={isComposeVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => !isSending && setIsComposeVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.composerContent}>
                        <GlassCard style={styles.composerCard} intensity={40}>
                            <View style={styles.modalHeader}>
                                <TouchableOpacity
                                    onPress={() => setIsComposeVisible(false)}
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
                </KeyboardAvoidingView>
            </Modal>
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
    composerContent: {
        flex: 1,
        marginTop: 60,
    },
    composerCard: {
        flex: 1,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        backgroundColor: 'rgba(20,20,25,0.95)',
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
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    badgeCount: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
    },
    pageTitle: {
        fontSize: 56,
        fontFamily: Typography.serif,
        color: Colors.dark.foreground,
        letterSpacing: -1,
        flex: 1,
        marginTop: Spacing.xs,
        marginBottom: 8,
    },
    pageSubtitle: {
        fontSize: 16,
        color: Colors.dark.mutedForeground,
        textAlign: 'left',
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    addMemoryBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
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
});
