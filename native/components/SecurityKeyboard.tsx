import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Typography, Spacing } from '../constants/Theme';
import { Delete, Fingerprint } from 'lucide-react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KEY_SIZE = SCREEN_WIDTH * 0.2;

interface SecurityKeyboardProps {
    onKeyPress: (key: string) => void;
    onDelete: () => void;
    onBiometricPress?: () => void;
    showBiometric?: boolean;
}

export const SecurityKeyboard: React.FC<SecurityKeyboardProps> = ({
    onKeyPress,
    onDelete,
    onBiometricPress,
    showBiometric
}) => {

    const renderKey = (val: string | number | React.ReactNode, onPress: () => void, isSpecial = false) => {
        return (
            <KeyButton
                val={val}
                onPress={onPress}
                isSpecial={isSpecial}
                key={typeof val === 'string' || typeof val === 'number' ? String(val) : Math.random().toString()}
            />
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {renderKey(1, () => onKeyPress('1'))}
                {renderKey(2, () => onKeyPress('2'))}
                {renderKey(3, () => onKeyPress('3'))}
            </View>
            <View style={styles.row}>
                {renderKey(4, () => onKeyPress('4'))}
                {renderKey(5, () => onKeyPress('5'))}
                {renderKey(6, () => onKeyPress('6'))}
            </View>
            <View style={styles.row}>
                {renderKey(7, () => onKeyPress('7'))}
                {renderKey(8, () => onKeyPress('8'))}
                {renderKey(9, () => onKeyPress('9'))}
            </View>
            <View style={styles.row}>
                {showBiometric ? (
                    renderKey(<Fingerprint size={28} color="white" />, onBiometricPress || (() => { }), true)
                ) : (
                    <View style={styles.emptyKey} />
                )}
                {renderKey(0, () => onKeyPress('0'))}
                {renderKey(<Delete size={28} color="white" />, onDelete, true)}
            </View>
        </View>
    );
};

const KeyButton = ({ val, onPress, isSpecial }: { val: any, onPress: () => void, isSpecial?: boolean }) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        backgroundColor: `rgba(255, 255, 255, ${opacity.value})`
    }));

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        scale.value = withSequence(withSpring(0.9), withSpring(1));
        opacity.value = withSequence(withTiming(0.3, { duration: 100 }), withTiming(0.1, { duration: 200 }));
        onPress();
    };

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={handlePress}
            style={styles.keyWrapper}
        >
            <Animated.View style={[styles.key, animatedStyle, isSpecial && styles.specialKey]}>
                {typeof val === 'string' || typeof val === 'number' ? (
                    <Text style={styles.keyText}>{val}</Text>
                ) : (
                    val
                )}
            </Animated.View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 20,
        gap: 20,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    keyWrapper: {
        width: KEY_SIZE,
        height: KEY_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
    },
    key: {
        width: KEY_SIZE,
        height: KEY_SIZE,
        borderRadius: KEY_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    specialKey: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    emptyKey: {
        width: KEY_SIZE,
        height: KEY_SIZE,
    },
    keyText: {
        fontSize: 32,
        fontFamily: Typography.serifBold,
        color: 'white',
    },
});
