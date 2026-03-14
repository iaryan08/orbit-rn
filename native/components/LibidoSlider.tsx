import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolateColor } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = width - (Spacing.md * 4);
const THUMB_SIZE = 24;
const TRACK_HEIGHT = 6;

const levels = ['low', 'medium', 'high', 'very_high'];

interface LibidoSliderProps {
    defaultValue: string;
    onValueChange: (value: string) => void;
}

export function LibidoSlider({ defaultValue, onValueChange }: LibidoSliderProps) {
    const setPagerScrollEnabled = useOrbitStore(state => state.setPagerScrollEnabled);
    const initialIndex = levels.indexOf(defaultValue) === -1 ? 1 : levels.indexOf(defaultValue);
    const stepWidth = SLIDER_WIDTH / (levels.length - 1);
    const translateX = useSharedValue(initialIndex * stepWidth);
    const [levelIndex, setLevelIndex] = useState(initialIndex);

    const updateValue = (index: number) => {
        if (index !== levelIndex) {
            setLevelIndex(index);
            onValueChange(levels[index]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const gesture = Gesture.Pan()
        .onStart(() => {
            runOnJS(setPagerScrollEnabled)(false);
        })
        .onUpdate((event) => {
            const newX = Math.min(Math.max(0, event.translationX + (levelIndex * stepWidth)), SLIDER_WIDTH);
            translateX.value = newX;
        })
        .onEnd(() => {
            const index = Math.round(translateX.value / stepWidth);
            translateX.value = withSpring(index * stepWidth, { damping: 20, stiffness: 120, overshootClamping: true });
            runOnJS(updateValue)(index);
        })
        .onFinalize(() => {
            runOnJS(setPagerScrollEnabled)(true);
        });

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value - (THUMB_SIZE / 2) }]
    }));

    const progressStyle = useAnimatedStyle(() => ({
        width: translateX.value < 1 ? 0 : translateX.value,
        backgroundColor: interpolateColor(
            translateX.value,
            [0, stepWidth, stepWidth * 2, stepWidth * 3],
            ['#22c55e', '#eab308', '#f97316', '#ef4444']
        )
    }));

    const currentLevel = levels[levelIndex];

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.label}>YOUR INTENSITY</Text>
                <Text style={[
                    styles.value,
                    { color: levelIndex === 0 ? '#22c55e' : levelIndex === 1 ? '#eab308' : levelIndex === 2 ? '#f97316' : '#ef4444' }
                ]}>
                    {currentLevel.replace('_', ' ').toUpperCase()}
                </Text>
            </View>

            <View style={styles.sliderContainer}>
                <View style={styles.track}>
                    <Animated.View style={[styles.progress, progressStyle]} />
                </View>
                <GestureDetector gesture={gesture}>
                    <Animated.View style={[styles.thumb, thumbStyle]} />
                </GestureDetector>
            </View>

            <View style={styles.markers}>
                {levels.map((l, i) => (
                    <Pressable
                        key={l}
                        style={styles.markerArea}
                        onPress={() => {
                            translateX.value = withSpring(i * stepWidth);
                            updateValue(i);
                        }}
                    >
                        <View style={[
                            styles.markerDot,
                            levelIndex === i && { backgroundColor: 'white' }
                        ]} />
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingVertical: 12,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    label: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 1.5,
    },
    value: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
    sliderContainer: {
        height: THUMB_SIZE,
        justifyContent: 'center',
        paddingHorizontal: 0,
    },
    track: {
        height: TRACK_HEIGHT,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: TRACK_HEIGHT / 2,
        overflow: 'hidden',
    },
    progress: {
        height: '100%',
    },
    thumb: {
        position: 'absolute',
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: THUMB_SIZE / 2,
        backgroundColor: 'white',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.45)',
        top: 0,
    },
    markers: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingHorizontal: 0,
    },
    markerArea: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    }
});
