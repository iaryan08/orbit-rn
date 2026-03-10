import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Typography, Spacing } from '../constants/Theme';
import { Delete, Fingerprint } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const KEY_SIZE = Math.min(88, SCREEN_WIDTH * 0.21);

interface SecurityKeyboardProps {
    onKeyPress: (key: string) => void;
    onDelete: () => void;
    onBiometricPress?: () => void;
    showBiometric?: boolean;
    showDelete?: boolean;
}

export const SecurityKeyboard: React.FC<SecurityKeyboardProps> = ({
    onKeyPress,
    onDelete,
    onBiometricPress,
    showBiometric,
    showDelete = true
}) => {

    const renderKey = (val: string | number | React.ReactNode, onPress: () => void, keyId: string, isSpecial = false) => {
        return (
            <KeyButton
                val={val}
                onPress={onPress}
                isSpecial={isSpecial}
                key={keyId}
            />
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {renderKey(1, () => onKeyPress('1'), 'k1')}
                {renderKey(2, () => onKeyPress('2'), 'k2')}
                {renderKey(3, () => onKeyPress('3'), 'k3')}
            </View>
            <View style={styles.row}>
                {renderKey(4, () => onKeyPress('4'), 'k4')}
                {renderKey(5, () => onKeyPress('5'), 'k5')}
                {renderKey(6, () => onKeyPress('6'), 'k6')}
            </View>
            <View style={styles.row}>
                {renderKey(7, () => onKeyPress('7'), 'k7')}
                {renderKey(8, () => onKeyPress('8'), 'k8')}
                {renderKey(9, () => onKeyPress('9'), 'k9')}
            </View>
            <View style={styles.row}>
                {showBiometric ? (
                    renderKey(<Fingerprint size={26} color="rgba(255,255,255,0.92)" />, onBiometricPress || (() => { }), 'bio', true)
                ) : (
                    <View style={styles.emptyKey} />
                )}
                {renderKey(0, () => onKeyPress('0'), 'k0')}
                {showDelete
                    ? renderKey(<Delete size={24} color="rgba(255,255,255,0.92)" />, onDelete, 'del', true)
                    : <View style={styles.emptyKey} />}
            </View>
        </View>
    );
};

const KeyButton = ({ val, onPress, isSpecial }: { val: any, onPress: () => void, isSpecial?: boolean }) => {
    const scale = useSharedValue(1);
    const glowOpacity = useSharedValue(0.08);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        shadowOpacity: glowOpacity.value + 0.1,
    }));

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scale.value = withSequence(withTiming(0.93, { duration: 80 }), withSpring(1, { damping: 12, stiffness: 180 }));
        glowOpacity.value = withSequence(withTiming(0.34, { duration: 100 }), withTiming(0.08, { duration: 250 }));
        onPress();
    };

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={handlePress}
            style={styles.keyWrapper}
        >
            <Animated.View style={[styles.key, animatedStyle]}>
                <LinearGradient
                    colors={
                        isSpecial
                            ? ['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)']
                            : ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']
                    }
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={styles.keyGradient}
                />
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
        gap: 14,
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
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 14,
    },
    keyGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    emptyKey: {
        width: KEY_SIZE,
        height: KEY_SIZE,
    },
    keyText: {
        fontSize: 40,
        fontFamily: Typography.serifBold,
        color: 'rgba(255,255,255,0.94)',
        includeFontPadding: false,
    },
});
