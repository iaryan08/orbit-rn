import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    ActivityIndicator,
    Platform
} from 'react-native';
import Modal from 'react-native-modal';
import { BlurView } from 'expo-blur';
import { X, MessageCircle } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { ProfileAvatar } from './ProfileAvatar';
import { getPublicStorageUrl } from '../lib/storage';
import { useOrbitStore } from '../lib/store';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { Comment } from '../lib/store/types';

export const CommentDrawer = React.memo(({
    visible,
    onClose,
    memoryId,
    type = 'memory',
    profile,
    idToken,
    onAddComment
}: any) => {
    const keyboard = useAnimatedKeyboard();
    const animatedKeyboardStyle = useAnimatedStyle(() => ({
        // Using system avoidKeyboard={true} for better Android compatibility
        // but keeping the smooth Reanimated height for the container if needed.
        // If system handles it, we can just use a minimal height or keep this as 0.
        paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0, 
    }));

    const { memories, polaroids, profile: myProfile, partnerProfile } = useOrbitStore();
    const memory = type === 'memory' 
            ? memories.find((m: any) => m.id === memoryId)
            : polaroids.find((p: any) => p.id === memoryId);
    
    const [commentText, setCommentText] = useState('');
    const comments = memory?.comments || [];

    // Helper to resolve avatar (comment data -> partnerProfile -> fallback)
    const resolveAvatar = (item: Comment) => {
        if (item.user_avatar_url) return item.user_avatar_url;
        if (item.user_id === partnerProfile?.id) return partnerProfile?.avatar_url;
        if (item.user_id === myProfile?.id) return myProfile?.avatar_url;
        return null;
    };

    const handlePost = () => {
        if (!commentText.trim() || !memoryId) return;
        onAddComment(memoryId, commentText);
        setCommentText('');
    };

    return (
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection={['down']}
            style={styles.commentModal}
            propagateSwipe={true}
            backdropOpacity={0.6}
            animationIn="slideInUp"
            animationOut="slideOutDown"
            avoidKeyboard={true}
            useNativeDriverForBackdrop
        >
            <View style={styles.drawerContainer}>
                <BlurView intensity={80} tint="dark" style={styles.drawerContent}>
                    <View style={styles.drawerHeader}>
                        <View style={styles.commentDrawerHandle} />
                        <Text style={styles.drawerTitle}>Comments</Text>
                        <TouchableOpacity onPress={onClose} style={styles.drawerCloseBtn}>
                            <X size={20} color="white" />
                        </TouchableOpacity>
                    </View>

                    <Animated.View style={[{ flex: 1 }, animatedKeyboardStyle]}>

                        <FlatList
                            data={comments}
                            keyExtractor={(item: Comment, index) => item.id || index.toString()}
                            style={styles.commentsList}
                            contentContainerStyle={styles.commentsListContent}
                            renderItem={({ item }: { item: Comment }) => (
                                <View style={styles.drawerCommentRow}>
                                    <ProfileAvatar
                                        url={getPublicStorageUrl(resolveAvatar(item), 'avatars', idToken)}
                                        size={32}
                                        fallbackText={item.user_name?.[0] || '?'}
                                    />
                                    <View style={styles.commentBody}>
                                        <View style={styles.commentHeader}>
                                            <Text style={styles.commentUserName}>{item.user_name}</Text>
                                            <Text style={styles.commentTime}>
                                                {item.created_at?.toDate ? ' • ' + Math.floor((Date.now() - item.created_at.toDate()) / 60000) + 'm' : ''}
                                            </Text>
                                        </View>
                                        <Text style={styles.commentValue}>{item.text}</Text>
                                    </View>
                                </View>
                            )}
                            ListEmptyComponent={
                                <View style={styles.emptyComments}>
                                    <MessageCircle size={48} color="rgba(255,255,255,0.05)" />
                                    <Text style={styles.emptyCommentsText}>
                                        No thoughts yet.{"\n"}Be the first to share one.
                                    </Text>
                                </View>
                            }
                        />

                        <View style={styles.drawerInputArea}>
                            <ProfileAvatar
                                url={getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken)}
                                size={32}
                                fallbackText={profile?.display_name?.[0] || 'Y'}
                            />
                            <TextInput
                                style={styles.drawerInput}
                                placeholder="Add a thought..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                blurOnSubmit={false}
                            />
                            {commentText.trim().length > 0 && (
                                <TouchableOpacity onPress={handlePost}>
                                    <Text style={styles.postText}>Post</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </Animated.View>
                </BlurView>
            </View>
        </Modal>
    );
});

const styles = StyleSheet.create({
    commentModal: {
        margin: 0,
        justifyContent: 'flex-end',
    },
    drawerContainer: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
    },
    drawerContent: {
        height: '80%',
        backgroundColor: '#0A0A0B',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    drawerHeader: {
        paddingVertical: 14,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        position: 'relative',
    },
    commentDrawerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginBottom: 8,
    },
    drawerTitle: {
        fontSize: 15,
        fontFamily: Typography.sansBold,
        color: 'white',
    },
    drawerCloseBtn: {
        position: 'absolute',
        right: 16,
        top: 16,
    },
    commentsList: {
        flex: 1,
    },
    commentsListContent: {
        padding: 20,
        gap: 20,
    },
    drawerCommentRow: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
    },
    commentBody: {
        flex: 1,
    },
    commentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    commentUserName: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: 'white',
    },
    commentTime: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: Typography.sans,
    },
    commentValue: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        fontFamily: Typography.sans,
        lineHeight: 20,
    },
    drawerInputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        gap: 12,
        backgroundColor: '#0F0F10',
    },
    drawerInput: {
        flex: 1,
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.sans,
        maxHeight: 100,
        paddingTop: 0,
        paddingBottom: 0,
    },
    postText: {
        color: Colors.dark.rose[400],
        fontFamily: Typography.sansBold,
        fontSize: 14,
    },
    emptyComments: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 16,
    },
    emptyCommentsText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 13,
        fontFamily: Typography.sans,
        textAlign: 'center',
    },
});
