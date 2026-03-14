import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { Typography } from '../constants/Theme';

interface EmojiProps extends TextProps {
    symbol: string;
    size?: number;
}

/**
 * A universal Emoji component that enforces the premium custom emoji font.
 * This ensures "Signal-style" (Apple) emojis on all platforms, including Android.
 */
export function Emoji({ symbol, size, style, ...props }: EmojiProps) {
    return (
        <Text
            style={[
                styles.emoji,
                size ? { fontSize: size } : null,
                style
            ]}
            {...props}
        >
            {symbol}
        </Text>
    );
}

const styles = StyleSheet.create({
    emoji: {
        fontFamily: 'AppleColorEmoji', // Enforced custom font
        color: '#fff', // Solid color for emoji rendering
    },
});
