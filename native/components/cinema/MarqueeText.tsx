import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withRepeat, Easing } from 'react-native-reanimated';

interface MarqueeTextProps {
    text: string;
    style: any;
    isActive?: boolean;
}

export const MarqueeText = React.memo(({ text, style, isActive = true }: MarqueeTextProps) => {
    const textWidth = useSharedValue(0);
    const containerWidth = useSharedValue(0);
    const translateX = useSharedValue(0);

    useEffect(() => {
        if (!isActive) {
            translateX.value = 0;
            return;
        }

        if (textWidth.value > containerWidth.value && containerWidth.value > 0) {
            translateX.value = 0;
            translateX.value = withRepeat(
                withTiming(-(textWidth.value + 20), {
                    duration: Math.max(2000, text.length * 150),
                    easing: Easing.linear
                }),
                -1,
                false
            );
        } else {
            translateX.value = 0;
        }

        return () => { translateX.value = 0; };
    }, [text, textWidth.value, containerWidth.value, isActive]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <View
            style={{ overflow: 'hidden', flex: 1 }}
            onLayout={(e) => containerWidth.value = e.nativeEvent.layout.width}
        >
            <Animated.View style={[{ flexDirection: 'row' }, animatedStyle]}>
                <Text
                    style={style}
                    onLayout={(e) => textWidth.value = e.nativeEvent.layout.width}
                    numberOfLines={1}
                >
                    {text}
                </Text>
                {textWidth.value > containerWidth.value && (
                    <Text style={[style, { marginLeft: 20 }]}>{text}</Text>
                )}
            </Animated.View>
        </View>
    );
});
