'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Lock, Delete, Loader2, ArrowRight, Fingerprint, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Dialog } from '@capacitor/dialog';
import { cn } from '@/lib/utils';
import { getPublicStorageUrl } from '@/lib/storage';

interface AppLockProviderProps {
    children: React.ReactNode;
    userProfile?: {
        avatar_url?: string | null;
        display_name?: string | null;
    };
}

export function AppLockProvider({ children, userProfile }: AppLockProviderProps) {
    const [isLocked, setIsLocked] = useState(true); // Default to locked, will be corrected in useEffect

    const [hasPinState, setHasPinState] = useState(false);
    const [pinEntry, setPinEntry] = useState('');
    const [errorShake, setErrorShake] = useState(false);
    const [hasErrorOnce, setHasErrorOnce] = useState(false);
    const [loading, setLoading] = useState(true);
    const [displayMode, setDisplayMode] = useState<'pin' | 'biometric'>('pin');
    const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

    const biometricPromptedOnce = useRef(false);
    const isPromptingBiometric = useRef(false);
    const isLockedRef = useRef(false);

    const router = useRouter();
    const supabase = createClient();
    const isNative = Capacitor.isNativePlatform();
    const backgroundTimeRef = useRef<number | null>(null);
    const touchStartRef = useRef<number | null>(null);

    // Sync ref with state and session storage
    const setLocked = useCallback((locked: boolean) => {
        setIsLocked(locked);
        isLockedRef.current = locked;
        if (locked) {
            sessionStorage.setItem('orbit_is_locked', 'true');
            localStorage.setItem('orbit_app_locked_state', 'true');
        } else {
            sessionStorage.removeItem('orbit_is_locked');
            localStorage.removeItem('orbit_app_locked_state');
            biometricPromptedOnce.current = false; // Reset for next lock cycle
        }
    }, []);

    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    const checkLockNeeded = useCallback(() => {
        const savedPin = localStorage.getItem('orbit_app_pin');
        if (!savedPin) return false;

        if (localStorage.getItem('orbit_app_locked_state') === 'true') return true;

        const bgTimeStr = localStorage.getItem('orbit_last_backgrounded');
        if (bgTimeStr) {
            const bgTime = parseInt(bgTimeStr, 10);
            const now = Date.now();
            const diff = now - bgTime;

            // UX Enhancement: 3-second grace period for very quick app switches
            if (diff < 3000) return false;

            const timeoutSetting = localStorage.getItem('orbit_app_lock_timeout') || 'screen_lock'; // Default to 'screen_lock' behavior
            let timeoutMs = Infinity;
            switch (timeoutSetting) {
                case '1m': timeoutMs = 60 * 1000; break;
                case '3m': timeoutMs = 3 * 60 * 1000; break;
                case '5m': timeoutMs = 5 * 60 * 1000; break;
                case '10m': timeoutMs = 10 * 60 * 1000; break;
                case 'screen_lock': timeoutMs = Infinity; break; // Only lock on explicit screen lock event, no timeout
            }

            if (diff >= timeoutMs) return true;
            return false;
        }
        return true; // If no background time, assume lock needed for safety
    }, []);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartRef.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const touchEnd = e.changedTouches[0].clientY;
        const diff = touchStartRef.current - touchEnd;
        if (diff > 50) { // Swipe up threshold
            attemptBiometric(true);
        }
        touchStartRef.current = null;
    };

    const attemptBiometric = useCallback(async (forced = false) => {
        const isBiometricEnabled = localStorage.getItem('orbit_app_biometric') === 'true';
        if (!isBiometricEnabled) return;

        // Auto-prompt only once. If forced (from swipe), always trigger.
        if (!forced && biometricPromptedOnce.current) return;
        if (isPromptingBiometric.current) return;

        isPromptingBiometric.current = true;

        try {
            const available = await NativeBiometric.isAvailable();
            if (available.isAvailable) {
                if (forced) setDisplayMode('biometric');

                const verified = await NativeBiometric.verifyIdentity({
                    reason: "Unlock Orbit",
                    title: "Authentication Required",
                    subtitle: "Log in with your biometric credential"
                });

                setLocked(false);
                setPinEntry('');
                localStorage.setItem('orbit_last_backgrounded', Date.now().toString());
                setDisplayMode('pin');
                // Flag stays true so we don't auto-pop again in the same session immediately
            }
        } catch (error) {
            console.warn('Biometric auth failed or cancelled:', error);
            setDisplayMode('pin');
        } finally {
            if (!forced) biometricPromptedOnce.current = true;
            isPromptingBiometric.current = false;
        }
    }, []);

    useEffect(() => {
        const handleScreenLock = () => {
            const hasPin = localStorage.getItem('orbit_app_pin');
            if (hasPin) {
                setLocked(true);
                setPinEntry('');
                localStorage.setItem('orbit_last_backgrounded', Date.now().toString());
            }
        };

        window.addEventListener('orbit-screen-locked', handleScreenLock);
        return () => window.removeEventListener('orbit-screen-locked', handleScreenLock);
    }, [setLocked]);

    useEffect(() => {
        if (!isNative) {
            setLoading(false);
            return;
        }

        const savedPin = localStorage.getItem('orbit_app_pin');
        if (savedPin) {
            setHasPinState(true);

            const sessionActive = sessionStorage.getItem('orbit_session_active');
            const sessionLocked = sessionStorage.getItem('orbit_is_locked');
            const needsLock = checkLockNeeded();

            if (sessionActive) {
                if (sessionLocked === 'true' || needsLock) {
                    setLocked(true);
                    if (needsLock) attemptBiometric();
                } else {
                    setLocked(false);
                }
            } else {
                // First launch/Cold start
                sessionStorage.setItem('orbit_session_active', 'true');
                if (needsLock) {
                    setLocked(true);
                    attemptBiometric();
                } else {
                    setLocked(false);
                }
            }
        } else {
            setLocked(false);
        }
        setLoading(false);

        const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            // CRITICAL: Ignore state shifts caused by the biometric prompt itself to fix loops
            if (isPromptingBiometric.current) return;

            const pin = localStorage.getItem('orbit_app_pin'); // Fetch pin inside listener
            if (!isActive) {
                if (pin && !isLockedRef.current) {
                    localStorage.setItem('orbit_last_backgrounded', Date.now().toString());
                    biometricPromptedOnce.current = false;
                }
            } else {
                // When coming back, we check if a lock is needed based on time spent away
                if (pin && checkLockNeeded()) {
                    if (!isLockedRef.current) {
                        setLocked(true);
                        setPinEntry('');
                    }
                    // Small delay to ensure the lock screen UI is mounted before the OS biometric window pops
                    setTimeout(() => {
                        if (isLockedRef.current) attemptBiometric();
                    }, 100);
                }
            }
        });

        return () => { listener.then(l => l.remove()); };
    }, [isNative, checkLockNeeded, attemptBiometric]);

    const handleKeyPress = (num: string) => {
        if (isNative) Haptics.impact({ style: ImpactStyle.Light });
        if (pinEntry.length < 4) {
            const newPin = pinEntry + num;
            setPinEntry(newPin);
            if (newPin.length === 4) verifyPin(newPin);
        }
    };

    const handleDelete = () => {
        if (isNative) Haptics.impact({ style: ImpactStyle.Light });
        setPinEntry(prev => prev.slice(0, -1));
    };

    const verifyPin = (entered: string) => {
        const savedPin = localStorage.getItem('orbit_app_pin');
        if (entered === savedPin) {
            setLocked(false);
            setPinEntry('');
            setHasErrorOnce(false);
            localStorage.setItem('orbit_last_backgrounded', Date.now().toString());
        } else {
            if (isNative) {
                Haptics.notification({ type: NotificationType.Error });
            }
            setErrorShake(true);
            setHasErrorOnce(true);
            setTimeout(() => { setErrorShake(false); setPinEntry(''); }, 500);
        }
    };

    const forceSignOut = () => {
        setShowSignOutConfirm(true);
    };

    const handleActualSignOut = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('orbit_app_pin');
        localStorage.removeItem('orbit_last_backgrounded');
        localStorage.removeItem('orbit_app_locked_state');
        sessionStorage.removeItem('orbit_session_active');
        sessionStorage.removeItem('orbit_is_locked');
        router.push('/');
        setLocked(false);
    };

    if (!isNative || !hasPinState) {
        return <>{children}</>;
    }

    return (
        <>
            <div className={isLocked ? "fixed inset-0 overflow-hidden pointer-events-none opacity-0" : "block"}>{children}</div>
            <AnimatePresence>
                {isLocked && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2147483000] bg-black/90 flex flex-col items-center justify-center p-6 min-h-[100dvh] w-[100dvw] pt-[max(env(safe-area-inset-top,60px),60px)] overflow-hidden touch-none"
                    >
                        <motion.div
                            className="flex flex-col items-center w-full h-full max-w-sm z-10 relative overflow-hidden"
                        >
                            {/* Top Section */}
                            <div className="flex flex-col items-center space-y-6 flex-shrink-0">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1, type: "spring" }}
                                    className="relative flex items-center justify-center"
                                >
                                    <div className="absolute inset-0 bg-rose-500/5 rounded-full" />
                                    {userProfile?.avatar_url ? (
                                        <img src={getPublicStorageUrl(userProfile.avatar_url, 'avatars') || '/placeholder.svg'} alt="Profile" className="w-20 h-20 md:w-24 md:h-24 rounded-full border-2 border-white/10 object-cover relative z-10" />
                                    ) : (
                                        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-neutral-900/90 border-2 border-white/10 flex items-center justify-center relative z-10">
                                            <Lock className="w-6 h-6 md:w-8 md:h-8 text-rose-400" />
                                        </div>
                                    )}
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-center relative"
                                >
                                    <h2 className="text-xl md:text-2xl font-serif text-white tracking-wide">
                                        Welcome Back{userProfile?.display_name ? `, ${userProfile.display_name.trim().split(/\s+/)[0]}` : ''}
                                    </h2>

                                    {/* Forgot PIN Relocated - Absolute to avoid shifting layout */}
                                    <AnimatePresence>
                                        {hasErrorOnce && (
                                            <motion.button
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                onClick={forceSignOut}
                                                className="absolute top-full left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-[0.4em] font-black text-rose-400 bg-rose-500/5 border border-rose-500/10 px-6 py-2 rounded-full mt-4 whitespace-nowrap active:scale-95 transition-all"
                                            >
                                                Forgot PIN? Sign Out
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            </div>

                            {/* Reduced Fixed Spacer */}
                            {/* Increased spacer to shift keyboard down - 8vh for better ergonomics */}
                            <div className="flex-shrink-0 h-[8vh]" />

                            {/* Middle Section - Flexible container to allow centered biometric icon */}
                            <div className={cn(
                                "flex flex-col items-center justify-center w-full relative transition-all duration-500",
                                displayMode === 'pin' ? "flex-shrink-0 min-h-[140px]" : "flex-1"
                            )}>
                                <AnimatePresence mode="wait">
                                    {displayMode === 'pin' ? (
                                        <motion.div
                                            key="pin-dots"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center"
                                        >
                                            <motion.div
                                                animate={errorShake ? { x: [-10, 10, -10, 10, 0] } : {}}
                                                className="flex gap-6 h-4 items-center justify-center mb-10"
                                            >
                                                {[...Array(4)].map((_, i) => (
                                                    <div
                                                        key={i}
                                                        className={`w-3 h-3 rounded-full transition-all duration-300 ${errorShake ? 'bg-red-500' :
                                                            (i < pinEntry.length ? 'bg-white scale-110' : 'bg-white/10')
                                                            }`}
                                                    />
                                                ))}
                                            </motion.div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="biometric-icon"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center justify-center"
                                        >
                                            <div
                                                className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-full border border-white/10 relative cursor-pointer active:scale-95 transition-transform"
                                                onClick={() => attemptBiometric(true)}
                                            >
                                                <Fingerprint className="w-16 h-16 text-rose-400 relative z-10" />
                                            </div>

                                            <button
                                                onClick={() => setDisplayMode('pin')}
                                                className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40 hover:text-white transition-colors mt-8"
                                            >
                                                Use PIN instead
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Bottom Centered Welcome & Bottom hint for Biometric */}
                            {displayMode === 'biometric' && (
                                <div className="flex-shrink-0 pb-12 flex flex-col items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500/20 animate-pulse" />
                                    <p className="text-[10px] uppercase tracking-[0.4em] font-black text-white/20">Biometric Secured</p>
                                </div>
                            )}

                            {/* Bottom Section - Numpad (Visible only in PIN mode) */}
                            <AnimatePresence>
                                {displayMode === 'pin' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 50 }}
                                        className="flex flex-col items-center w-full flex-shrink-0"
                                        onTouchStart={handleTouchStart}
                                        onTouchEnd={handleTouchEnd}
                                    >
                                        <div className="grid grid-cols-3 gap-x-6 gap-y-6 w-full max-w-[280px] justify-items-center mb-6">
                                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                                                <button
                                                    key={num}
                                                    onClick={() => handleKeyPress(num)}
                                                    className="btn-neumorphic h-[72px] w-[72px] rounded-full flex items-center justify-center text-3xl font-medium"
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                            <div />
                                            <button
                                                onClick={() => handleKeyPress('0')}
                                                className="btn-neumorphic h-[72px] w-[72px] rounded-full flex items-center justify-center text-3xl font-medium"
                                            >
                                                0
                                            </button>
                                            <button
                                                onClick={handleDelete}
                                                className={`btn-neumorphic-ghost h-[72px] w-[72px] rounded-full flex items-center justify-center ${pinEntry.length === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                            >
                                                <Delete className="w-8 h-8" />
                                            </button>
                                        </div>

                                        {/* Repositioned Biometric Hint - Balanced for visibility */}
                                        {localStorage.getItem('orbit_app_biometric') === 'true' && (
                                            <div
                                                onClick={() => attemptBiometric(true)}
                                                className="flex flex-col items-center cursor-pointer group pt-4 pb-12 px-6 relative z-20 w-full mt-auto gap-2"
                                            >
                                                <span className="text-[9px] uppercase tracking-[0.4em] font-black text-white/30 group-hover:text-white/60 transition-colors text-center whitespace-nowrap">Swipe up for Biometric</span>
                                                <div className="w-12 h-[2px] rounded-full bg-white/10 group-hover:bg-white/20 transition-colors" />
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom Sign Out Confirmation Modal */}
            <AnimatePresence>
                {showSignOutConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2147483001] flex items-center justify-center px-6 bg-black/90"
                        onClick={() => setShowSignOutConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-sm rounded-[2rem] bg-[#161616] border border-white/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex flex-col items-center pt-8 pb-6 px-6 text-center">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                                    <Trash2 className="h-8 w-8 text-red-400" />
                                </div>
                                <h3 className="text-xl font-serif font-bold text-white mb-2 italic">Sign Out?</h3>
                                <p className="text-sm text-white/40 leading-relaxed max-w-[240px]">
                                    This will clear your local PIN and you will need to log in again.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 border-t border-white/10">
                                <button
                                    onClick={() => setShowSignOutConfirm(false)}
                                    className="py-5 text-[11px] uppercase tracking-widest font-black text-white/20 border-r border-white/10 active:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleActualSignOut}
                                    className="py-5 text-[11px] uppercase tracking-widest font-black text-rose-500 active:bg-rose-500/10 transition-colors"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

