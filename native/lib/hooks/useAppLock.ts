import { useState, useCallback, useRef, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useSharedValue, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import { useOrbitStore } from '../store';

export function useAppLock(onUnlock?: () => void) {
    const appPinCode = useOrbitStore(s => s.appPinCode);
    const isBiometricEnabled = useOrbitStore(s => s.isBiometricEnabled);

    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    const shake = useSharedValue(0);
    const errorResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerError = useCallback(() => {
        setPinError(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake.value = withSequence(
            withTiming(-10, { duration: 50 }),
            withTiming(10, { duration: 50 }),
            withTiming(-8, { duration: 50 }),
            withTiming(8, { duration: 50 }),
            withSpring(0)
        );
        
        if (errorResetTimerRef.current) clearTimeout(errorResetTimerRef.current);
        errorResetTimerRef.current = setTimeout(() => {
            setPin('');
            setPinError(false);
        }, 500);
    }, [shake]);

    const authenticateBiometric = useCallback(async () => {
        if (isAuthenticating || !isBiometricEnabled) return;
        setIsAuthenticating(true);
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!hasHardware || !isEnrolled) return;

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Orbit',
                fallbackLabel: 'Use PIN',
                disableDeviceFallback: false,
                cancelLabel: 'Cancel',
            });
            
            if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setPin('');
                setPinError(false);
                if (onUnlock) onUnlock();
                return true;
            }
        } catch (e) {
            console.error('[AppLock] Biometric auth error:', e);
        } finally {
            setIsAuthenticating(false);
        }
        return false;
    }, [isAuthenticating, isBiometricEnabled, onUnlock]);

    const handlePinPress = useCallback((digit: string) => {
        if (pin.length >= 4) return;
        const next = `${pin}${digit}`;
        setPin(next);
        
        if (next.length === 4) {
            if (appPinCode && next === appPinCode) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setPin('');
                setPinError(false);
                if (onUnlock) onUnlock();
            } else {
                triggerError();
            }
        }
    }, [pin, appPinCode, onUnlock, triggerError]);

    const handleDelete = useCallback(() => {
        setPin(prev => prev.slice(0, -1));
    }, []);

    useEffect(() => {
        return () => {
            if (errorResetTimerRef.current) clearTimeout(errorResetTimerRef.current);
        };
    }, []);

    return {
        pin,
        pinError,
        isAuthenticating,
        shake,
        handlePinPress,
        handleDelete,
        authenticateBiometric,
    };
}
