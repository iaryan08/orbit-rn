import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus, PanResponder, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    withSpring,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { Fingerprint, Lock } from 'lucide-react-native';
import { Colors, Typography } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';
import { SecurityKeyboard } from './SecurityKeyboard';

const USE_LAYOUT_ANIM = Platform.OS !== 'android';
const LAYOUT_ANIM_INC = USE_LAYOUT_ANIM ? FadeIn.duration(220) : undefined;
const LAYOUT_ANIM_OUT = USE_LAYOUT_ANIM ? FadeOut.duration(200) : undefined;

import { useAppLock } from '../lib/hooks/useAppLock';

export function AppLockOverlay() {
    const isAppLockEnabled = useOrbitStore(state => state.isAppLockEnabled);
    const setAppLocked = useOrbitStore(state => state.setAppLocked);
    const isBiometricEnabled = useOrbitStore(state => state.isBiometricEnabled);
    const appPinCode = useOrbitStore(state => state.appPinCode);

    const [isLocked, setIsLocked] = useState(false);
    const [swipeHintVisible, setSwipeHintVisible] = useState(true);
    const hasPin = !!appPinCode;
    const canBiometric = isBiometricEnabled;

    const {
        pin,
        pinError,
        isAuthenticating,
        shake,
        handlePinPress,
        handleDelete,
        authenticateBiometric,
    } = useAppLock(() => {
        setAppLocked(false);
        setIsLocked(false);
    });

    const shakeStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shake.value }],
    }));

    const lock = () => {
        setAppLocked(true);
        setIsLocked(true);
    };

    useEffect(() => {
        if (!isAppLockEnabled) {
            setAppLocked(false);
            setIsLocked(false);
            return;
        }

        const onState = (next: AppStateStatus) => {
            if (next === 'active' && isAppLockEnabled) {
                lock();
            }
        };

        const sub = AppState.addEventListener('change', onState);
        // Initial launch lock
        lock();
        return () => sub.remove();
    }, [isAppLockEnabled]);

    useEffect(() => {
        if (!isLocked) return;
        if (isBiometricEnabled) authenticateBiometric();
    }, [isLocked, isBiometricEnabled]);

    useEffect(() => {
        if (!isLocked) return;
        const t = setTimeout(() => setSwipeHintVisible(false), 3500);
        return () => clearTimeout(t);
    }, [isLocked]);

    const swipeUpResponder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_, gesture) => {
                    if (!canBiometric) return false;
                    return Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy < -10;
                },
                onPanResponderRelease: (_, gesture) => {
                    if (!canBiometric) return;
                    const fastUp = gesture.vy < -0.35;
                    const longUp = gesture.dy < -48;
                    if (fastUp || longUp) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        authenticateBiometric();
                    }
                },
            }),
        [canBiometric]
    );

    if (!isLocked) return null;

    return (
        <Animated.View
            entering={LAYOUT_ANIM_INC}
            exiting={LAYOUT_ANIM_OUT}
            style={styles.container}
            {...swipeUpResponder.panHandlers}
        >
            <View style={styles.content}>
                <View style={styles.header}>
                    <View style={styles.iconShell}>
                        <Lock size={30} color={pinError ? Colors.dark.rose[400] : 'rgba(255,255,255,0.95)'} />
                    </View>
                    <Text style={styles.title}>App Locked</Text>
                    <Text style={styles.subtitle}>
                        {hasPin ? 'Enter PIN to unlock your space' : 'Use biometric to continue'}
                    </Text>
                </View>

                <Animated.View style={[styles.dotsRow, shakeStyle]}>
                    {[0, 1, 2, 3].map(i => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                pin.length > i && styles.dotFilled,
                                pinError && styles.dotError,
                            ]}
                        />
                    ))}
                </Animated.View>

                {hasPin && (
                    <View style={styles.keyboardWrap}>
                        <SecurityKeyboard
                            onKeyPress={handlePinPress}
                            onDelete={handleDelete}
                            onBiometricPress={canBiometric ? authenticateBiometric : undefined}
                            showBiometric={canBiometric}
                            showDelete={pin.length > 0}
                        />
                    </View>
                )}

                {!hasPin && canBiometric && (
                    <TouchableOpacity style={styles.biometricBtn} onPress={authenticateBiometric} disabled={isAuthenticating}>
                        <Fingerprint size={18} color="white" />
                        <Text style={styles.biometricBtnText}>{isAuthenticating ? 'AUTHENTICATING...' : 'UNLOCK WITH BIOMETRIC'}</Text>
                    </TouchableOpacity>
                )}
                {canBiometric && swipeHintVisible && (
                    <Text style={styles.swipeHintText}>Swipe up for fingerprint unlock</Text>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 999999,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        width: '100%',
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 28,
    },
    iconShell: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
    },
    title: {
        color: 'white',
        fontSize: 30,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.4,
    },
    subtitle: {
        marginTop: 6,
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.65)',
        backgroundColor: 'transparent',
    },
    dotFilled: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderColor: 'rgba(255,255,255,0.95)',
    },
    dotError: {
        borderColor: Colors.dark.rose[400],
        backgroundColor: `${Colors.dark.rose[400]}66`,
    },
    keyboardWrap: {
        width: '100%',
        maxWidth: 420,
    },
    biometricBtn: {
        marginTop: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    biometricBtnText: {
        color: 'white',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.1,
    },
    swipeHintText: {
        marginTop: 14,
        color: 'rgba(255,255,255,0.65)',
        fontSize: 14,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
