import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, AppState, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import { ShieldCheck, Lock, Fingerprint } from 'lucide-react-native';
import { Colors, Typography, Animations } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';
import * as Haptics from 'expo-haptics';

export function AppLockOverlay() {
    const isAppLockEnabled = useOrbitStore(state => state.isAppLockEnabled);
    const [isLocked, setIsLocked] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    const authenticate = async () => {
        if (isAuthenticating) return;
        setIsAuthenticating(true);

        try {
            // Safety: Check if the native module even loaded
            if (typeof LocalAuthentication.hasHardwareAsync !== 'function') {
                console.warn('[AppLock] Native module ExpoLocalAuthentication not found. Skipping biometric auth.');
                unlock();
                return;
            }

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                // If they enabled it but don't have it anymore (unlikely but safe)
                setIsLocked(false);
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Orbit Space',
                fallbackLabel: 'Enter Passcode',
                disableDeviceFallback: false,
                cancelLabel: 'Cancel',
            });

            if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                unlock();
            } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } catch (e) {
            console.error('[AppLock] Auth error:', e);
        } finally {
            setIsAuthenticating(false);
        }
    };

    const unlock = () => {
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
        }).start(() => setIsLocked(false));
    };

    const lock = () => {
        setIsLocked(true);
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            // Auto-trigger auth when locked
            authenticate();
        });
    };

    useEffect(() => {
        if (!isAppLockEnabled) {
            setIsLocked(false);
            return;
        }

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && isAppLockEnabled) {
                // Small delay to ensure UI is ready
                setTimeout(() => {
                    if (!isLocked) lock();
                }, 100);
            } else if (nextAppState === 'background' || nextAppState === 'inactive') {
                // Optional: Instant relock when backgrounded
                // setIsLocked(true);
                // fadeAnim.setValue(1);
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        // Initial lock check
        if (isAppLockEnabled) {
            lock();
        }

        return () => {
            subscription.remove();
        };
    }, [isAppLockEnabled]);

    if (!isLocked) return null;

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <View style={styles.orbitRing}>
                        <Lock size={32} color="white" />
                    </View>
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title}>Space Locked</Text>
                    <Text style={styles.subtitle}>Unlock your private orbit to continue</Text>
                </View>

                <TouchableOpacity
                    style={styles.unlockButton}
                    onPress={authenticate}
                    disabled={isAuthenticating}
                >
                    <Fingerprint size={20} color="white" />
                    <Text style={styles.unlockButtonText}>
                        {isAuthenticating ? 'AUTHENTICATING...' : 'TOUCH TO UNLOCK'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.footer}>
                    <ShieldCheck size={14} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.footerText}>Biometric Encryption Active</Text>
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 999999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        marginBottom: 32,
    },
    orbitRing: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        color: 'white',
        fontSize: 24,
        fontFamily: Typography.serifBold,
        marginBottom: 8,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        fontFamily: Typography.sans,
        textAlign: 'center',
    },
    unlockButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 28,
        paddingVertical: 16,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    unlockButtonText: {
        color: 'white',
        fontSize: 12,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    footer: {
        position: 'absolute',
        bottom: -150,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    footerText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});
