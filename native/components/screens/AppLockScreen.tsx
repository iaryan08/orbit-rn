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

import { useAppLock } from '../../lib/hooks/useAppLock';

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlock }) => {
    const isBiometricEnabled = useOrbitStore(s => s.isBiometricEnabled);

    const {
        pin,
        pinError: error,
        isAuthenticating,
        shake,
        handlePinPress: onKeyPress,
        handleDelete: onDelete,
        authenticateBiometric: handleBiometric,
    } = useAppLock(onUnlock);

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shake.value }]
    }));

    useEffect(() => {
        if (isBiometricEnabled) {
            handleBiometric();
        }
    }, [isBiometricEnabled, handleBiometric]);

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
        color: 'rgba(255,255,255,0.65)',
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
        borderColor: 'rgba(255,255,255,0.45)',
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
