import React, { useState, useEffect, useMemo } from 'react';
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
import { Accelerometer } from 'expo-sensors';
import { getPublicStorageUrl } from '../lib/storage';
import * as Haptics from 'expo-haptics';

const AnimatedImage = Animated.createAnimatedComponent(Image);

const SWIPE_THRESHOLD = 60;
const SHAKE_THRESHOLD = 2.5;
import { PolaroidData } from '../lib/store/types';

interface PolaroidStackProps {
    userPolaroid: PolaroidData | null;
    partnerPolaroid: PolaroidData | null;
    partnerName: string;
    onPress?: (polaroid: PolaroidData) => void;
    onUploadPress?: () => void;
    authToken?: string | null;
}

export function PolaroidStack({
    userPolaroid,
    partnerPolaroid,
    partnerName,
    onPress,
    onUploadPress,
    authToken
}: PolaroidStackProps) {
    const [view, setView] = useState<'partner' | 'user'>('partner');
    const translateX = useSharedValue(0);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd((event) => {
            if (event.translationX > SWIPE_THRESHOLD) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
                runOnJS(setView)('partner');
            } else if (event.translationX < -SWIPE_THRESHOLD) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
                runOnJS(setView)('user');
            }
            translateX.value = withSpring(0);
        });

    const activeIndex = view === 'partner' ? 0 : 1;

    return (
        <View style={styles.container}>
            <GestureDetector gesture={panGesture}>
                <View style={styles.stackArea}>
                    <PolaroidCard
                        data={userPolaroid}
                        label="You"
                        isActive={activeIndex === 1}
                        index={1}
                        translateX={translateX}
                        onPress={() => userPolaroid ? onPress?.(userPolaroid) : onUploadPress?.()}
                        authToken={authToken}
                    />
                    <PolaroidCard
                        data={partnerPolaroid}
                        label={partnerName}
                        isActive={activeIndex === 0}
                        index={0}
                        translateX={translateX}
                        onPress={() => partnerPolaroid ? onPress?.(partnerPolaroid) : null}
                        authToken={authToken}
                    />
                </View>
            </GestureDetector>
            <View style={styles.footer}>
                <Text style={styles.footerLabel}>
                    {view === 'partner' ? partnerName : 'You'}
                </Text>
            </View>
        </View>
    );
}

interface PolaroidCardProps {
    data: PolaroidData | null;
    label: string;
    isActive: boolean;
    index: number;
    translateX: SharedValue<number>;
    onPress: () => void;
    authToken?: string | null;
}

import { usePersistentMedia } from '../lib/media';

function PolaroidCard({ data, label, isActive, index, translateX, onPress, authToken }: PolaroidCardProps) {
    const [developProgress, setDevelopProgress] = useState(100);
    const [isShaking, setIsShaking] = useState(false);

    const rawUrl = useMemo(() =>
        getPublicStorageUrl(data?.image_url, 'memories', authToken),
        [data?.image_url, authToken]);

    // Use the optimized media engine with content-stable ID (URL)
    const sourceUri = usePersistentMedia(data?.image_url, rawUrl || undefined, isActive);

    // Shake Detector logic (only for active card and newly added data)
    useEffect(() => {
        if (!data || !isActive || developProgress >= 100) return;

        let subscription: any;
        Accelerometer.setUpdateInterval(200);

        subscription = Accelerometer.addListener(accelerometerData => {
            const { x, y, z } = accelerometerData;
            const acceleration = Math.sqrt(x * x + y * y + z * z);

            if (acceleration > SHAKE_THRESHOLD) {
                runOnJS(setIsShaking)(true);
                runOnJS(setDevelopProgress)(prev => Math.min(prev + 5, 100));
            } else {
                runOnJS(setIsShaking)(false);
            }
        });

        return () => subscription?.remove();
    }, [data, isActive, developProgress < 100]);

    const animatedStyle = useAnimatedStyle(() => {
        const offset = index === 0 ? -15 : 15;
        const rotate = index === 0 ? -4 : 4;

        const targetX = isActive ? 0 : offset;
        const targetRotate = isActive ? (index === 0 ? -2 : 2) : rotate;
        const targetScale = isActive ? 1 : 0.95;
        const targetOpacity = isActive ? 1 : 0.7;

        return {
            transform: [
                { translateX: withSpring(targetX + (isActive ? translateX.value * 0.2 : 0)) },
                { rotateZ: withSpring(`${targetRotate + (isActive ? translateX.value * 0.05 : 0)}deg`) },
                { scale: withSpring(targetScale) }
            ],
            opacity: withSpring(isActive ? interpolate(translateX.value, [-100, 0, 100], [0.8, 1, 0.8]) : targetOpacity),
            zIndex: isActive ? 20 : 10,
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
                                    source={{ uri: sourceUri || undefined }}
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
                                {data?.created_at ? '03:28 PM · Mar 7' : 'Waiting...'}
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
        width: 290,
        height: 400,
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
        backgroundColor: '#FFFFFF', // Pure white like real photo paper
        padding: 12,
        paddingBottom: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
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
        backgroundColor: '#F5F5F5',
    },
    emptyText: {
        fontSize: 10,
        color: '#A3A3A3',
        fontFamily: Typography.sansBold,
        marginTop: 4,
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
        fontFamily: Typography.sansBold,
        letterSpacing: 0.2,
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
        fontSize: 34,
        color: '#1e293b', // Elegant slate-900 like dark blue/black
        fontFamily: Typography.script,
        letterSpacing: -0.5,
        marginTop: -4,
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
        fontSize: 8,
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
