import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius, Typography, Spacing } from '../../constants/Theme';
import { SecurityKeyboard } from '../SecurityKeyboard';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../../lib/store';
import Animated, {
    FadeIn,
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withSequence,
    withTiming,
    interpolate,
    Extrapolate
} from 'react-native-reanimated';
import { ShieldAlert, ShieldCheck, Lock } from 'lucide-react-native';

interface AppLockScreenProps {
    onUnlock: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
    const { appPinCode, isBiometricEnabled } = useOrbitStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);

    const shake = useSharedValue(0);

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shake.value }]
    }));

    useEffect(() => {
        if (isBiometricEnabled) {
            handleBiometric();
        }
    }, []);

    const handleBiometric = async () => {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) return;

        const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (supported.length === 0) return;

        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Orbit',
            fallbackLabel: 'Use PIN',
            disableDeviceFallback: false,
        });

        if (result.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onUnlock();
        }
    };

    const onKeyPress = (key: string) => {
        if (pin.length >= 4) return;
        const nextPin = pin + key;
        setPin(nextPin);

        if (nextPin.length === 4) {
            if (nextPin === appPinCode || !appPinCode) {
                // If no pin set, any 4 digits work for now? No, if enabled, pin must exist.
                // But for first-time setup we might need different logic.
                // For this screen, we assume pin exists if we are here.
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onUnlock();
            } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                setError(true);
                shake.value = withSequence(
                    withTiming(-10, { duration: 50 }),
                    withTiming(10, { duration: 50 }),
                    withTiming(-10, { duration: 50 }),
                    withTiming(10, { duration: 50 }),
                    withSpring(0)
                );
                setTimeout(() => {
                    setPin('');
                    setError(false);
                }, 1000);
            }
        }
    };

    const onDelete = () => {
        setPin(pin.slice(0, -1));
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <Lock size={40} color={error ? Colors.dark.rose[400] : Colors.dark.indigo[400]} />
                </View>
                <Text style={styles.title}>Secure Access</Text>
                <Text style={styles.subtitle}>Enter your PIN to unlock your space</Text>
            </View>

            <Animated.View style={[styles.dotsContainer, shakeStyle]}>
                {[0, 1, 2, 3].map((i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            pin.length > i && styles.dotFilled,
                            error && styles.dotError
                        ]}
                    />
                ))}
            </Animated.View>

            <View style={styles.keyboardSection}>
                <SecurityKeyboard
                    onKeyPress={onKeyPress}
                    onDelete={onDelete}
                    onBiometricPress={handleBiometric}
                    showBiometric={isBiometricEnabled}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050510', // Deep ink
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 60,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        fontFamily: Typography.serifBold,
        color: 'white',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        letterSpacing: 0.5,
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 80,
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    dotFilled: {
        backgroundColor: Colors.dark.indigo[400],
        borderColor: Colors.dark.indigo[400],
    },
    dotError: {
        backgroundColor: Colors.dark.rose[400],
        borderColor: Colors.dark.rose[400],
    },
    keyboardSection: {
        width: '100%',
        maxWidth: 400,
    }
});
