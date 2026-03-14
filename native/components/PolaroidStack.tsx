import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
    runOnJS,
    withTiming,
    SharedValue
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { Camera, Flame } from 'lucide-react-native';
import { RefreshCw } from 'lucide-react-native';
import { getPublicStorageUrl } from '../lib/storage';
import * as Haptics from 'expo-haptics';
import { normalizeDate } from '../lib/utils';
import { useOrbitStore } from '../lib/store';
import { PolaroidData } from '../lib/store/types';
import { usePersistentMedia } from '../lib/media';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const SWIPE_THRESHOLD = 60;
const SHAKE_THRESHOLD = 2.5;


interface PolaroidStackProps {
    userPolaroid: PolaroidData | null;
    partnerPolaroid: PolaroidData | null;
    partnerName: string;
    onPress?: (polaroid: PolaroidData) => void;
    onUploadPress?: () => void;
    authToken?: string | null;
    isActive?: boolean;
}

export const PolaroidStack = React.memo(({
    userPolaroid,
    partnerPolaroid,
    partnerName,
    onPress,
    onUploadPress,
    authToken,
    isActive = true
}: PolaroidStackProps) => {
    const activeIndex = useSharedValue(0); // 0 for partner, 1 for user
    const [viewLabel, setViewLabel] = useState(partnerName);
    const translateX = useSharedValue(0);
    const setPagerScrollEnabled = useOrbitStore(s => s.setPagerScrollEnabled);

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            // Lock main pager while interacting with the Polaroid stack
            runOnJS(setPagerScrollEnabled)(false);
        })
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd((event) => {
            if (event.translationX > SWIPE_THRESHOLD) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
                activeIndex.value = withSpring(0);
                runOnJS(setViewLabel)(partnerName);
            } else if (event.translationX < -SWIPE_THRESHOLD) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
                activeIndex.value = withSpring(1);
                runOnJS(setViewLabel)('You');
            }
            translateX.value = withSpring(0);
            // Always re-enable pager when gesture finishes
            runOnJS(setPagerScrollEnabled)(true);
        })
        .onFinalize(() => {
            // Safety: ensure pager is unlocked even if gesture is cancelled
            runOnJS(setPagerScrollEnabled)(true);
        });

    const handleUserPress = useCallback(() => {
        if (userPolaroid) onPress?.(userPolaroid);
        else onUploadPress?.();
    }, [userPolaroid, onPress, onUploadPress]);

    const handlePartnerPress = useCallback(() => {
        if (partnerPolaroid) onPress?.(partnerPolaroid);
    }, [partnerPolaroid, onPress]);

    return (
        <View style={styles.container}>
            <GestureDetector gesture={panGesture}>
                <View style={styles.stackArea}>
                    <PolaroidCard
                        data={userPolaroid}
                        label="You"
                        isActive={isActive}
                        cardIndex={1}
                        activeIndex={activeIndex}
                        translateX={translateX}
                        onPress={handleUserPress}
                        authToken={authToken}
                    />
                    <PolaroidCard
                        data={partnerPolaroid}
                        label={partnerName}
                        isActive={isActive}
                        cardIndex={0}
                        activeIndex={activeIndex}
                        translateX={translateX}
                        onPress={handlePartnerPress}
                        authToken={authToken}
                    />
                </View>
            </GestureDetector>
            <View style={styles.footer}>
                <Text style={styles.footerLabel}>{viewLabel}</Text>
            </View>
        </View>
    );
});

interface PolaroidCardProps {
    data: PolaroidData | null;
    label: string;
    isActive: boolean;
    cardIndex: number;
    activeIndex: SharedValue<number>;
    translateX: SharedValue<number>;
    onPress: () => void;
    authToken?: string | null;
}


function PolaroidCard({ data, label, isActive, cardIndex, activeIndex, translateX, onPress, authToken }: PolaroidCardProps) {
    const [developProgress, setDevelopProgress] = useState(100);
    const [isShaking, setIsShaking] = useState(false);

    const rawUrl = useMemo(() =>
        getPublicStorageUrl(data?.image_url, 'polaroids', authToken),
        [data?.image_url, authToken]);

    // Use the optimized media engine with content-stable ID (URL)
    const sourceUri = usePersistentMedia(data?.image_url, rawUrl || undefined, isActive);
    
    // Fallback strategy to prevent Black Screen
    // We always try to show rawUrl if sourceUri isn't ready, even if in background.
    const finalUri = sourceUri || rawUrl || undefined;

    // Shake detector removed for performance optimization. Polaroids are instantly developed.
    useEffect(() => {
        if (!data || !isActive || developProgress >= 100) return;
        setDevelopProgress(100);
    }, [data, isActive, developProgress]);

    const animatedStyle = useAnimatedStyle(() => {
        const distance = Math.abs(activeIndex.value - cardIndex);

        // Continuous interpolation for smooth state morphing
        const targetScale = interpolate(distance, [0, 1], [1, 0.95]);
        const targetOpacity = interpolate(distance, [0, 1], [1, 0.7]);
        const targetZIndex = interpolate(distance, [0, 1], [20, 10]);

        const defaultOffset = cardIndex === 0 ? -15 : 15;
        const defaultRotate = cardIndex === 0 ? -4 : 4;
        const activeRotate = cardIndex === 0 ? -2 : 2;

        const currentOffset = interpolate(distance, [0, 1], [0, defaultOffset]);
        const currentRotate = interpolate(distance, [0, 1], [activeRotate, defaultRotate]);

        // Interactive translate based on distance from top
        const swipeInfluence = interpolate(distance, [0, 0.5, 1], [1, 0, 0]);
        const swipeX = translateX.value * 0.2 * swipeInfluence;
        const swipeRot = translateX.value * 0.05 * swipeInfluence;

        return {
            transform: [
                { translateX: currentOffset + swipeX },
                { rotateZ: `${currentRotate + swipeRot}deg` },
                { scale: targetScale }
            ],
            opacity: targetOpacity,
            zIndex: Math.round(targetZIndex),
        };
    });

    const imageStyle = useAnimatedStyle(() => {
        return {
            opacity: withTiming(developProgress / 100, { duration: 500 }),
            transform: [{ scale: isShaking ? withSpring(1.05) : withSpring(1) }]
        };
    });

    return (
        <Animated.View style={[styles.cardContainer, animatedStyle]}>
            <Pressable onPress={onPress} style={styles.card}>
                <View style={styles.paperBase}>
                    <View style={styles.imageContainer}>
                        {data ? (
                            <>
                                <AnimatedImage
                                    source={{ uri: finalUri || undefined }}
                                    style={[styles.image, imageStyle]}
                                    contentFit="cover"
                                    transition={200}
                                    cachePolicy="disk"
                                />
                                {developProgress < 100 && (
                                    <View style={styles.developingOverlay}>
                                        <Flame size={24} color={isShaking ? '#f97316' : '#fff3'} />
                                        <Text style={styles.developingText}>
                                            {isShaking ? 'Developing!' : 'Shake to see'}
                                        </Text>
                                    </View>
                                )}
                            </>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Camera size={32} color="#A3A3A3" />
                                <Text style={styles.emptyText}>Empty</Text>
                            </View>
                        )}
                        <View style={styles.ownerBadge}>
                            <Text style={styles.ownerText}>{label}</Text>
                        </View>
                    </View>
                    <View style={styles.captionContainer}>
                        <Text style={styles.caption} numberOfLines={1}>
                            {data?.caption && data.caption !== 'A moment shared' ? data.caption : 'A moment shared'}
                        </Text>
                        <View style={styles.timeWrapper}>
                            <View style={styles.timeDot} />
                            <Text style={styles.time}>
                                {data?.created_at ? normalizeDate(data.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, day: 'numeric', month: 'short' }) : 'Waiting...'}
                            </Text>
                        </View>
                    </View>
                </View>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 310, // Wider for premium feel
        height: 420,
        alignSelf: 'center',
    },
    stackArea: {
        flex: 1,
        position: 'relative',
    },
    cardContainer: {
        position: 'absolute',
        inset: 0,
    },
    card: {
        flex: 1,
        backgroundColor: '#FCFBF7',
        padding: 14, // Slightly more padding
        paddingBottom: 28,
        borderRadius: 4, // Slightly softer corners
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 5,
    },
    paperBase: {
        flex: 1,
    },
    imageContainer: {
        aspectRatio: 1,
        backgroundColor: '#0A0A0A',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000', // Premium deep ink
    },
    emptyText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.65)',
        fontFamily: Typography.sansBold,
        marginTop: 4,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    ownerBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    ownerText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold, // Outfit technical labels
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    developingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    developingText: {
        color: 'white',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        marginTop: 8,
    },
    captionContainer: {
        marginTop: 18,
        paddingHorizontal: 8,
        flex: 1,
        justifyContent: 'center',
    },
    caption: {
        fontSize: 38, // Slightly larger for handwritten feel
        color: '#1e293b',
        fontFamily: Typography.script, // MeaCulpa
        lineHeight: 44,
        letterSpacing: -0.2,
        marginTop: -4,
        includeFontPadding: false,
    },
    timeWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 2,
        opacity: 0.3,
    },
    timeDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#1e293b',
    },
    time: {
        fontSize: 12,
        color: '#1e293b',
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
    footer: {
        marginTop: 12,
        alignItems: 'center',
    },
    footerLabel: {
        color: 'rgba(251, 113, 133, 0.4)',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    }
});
