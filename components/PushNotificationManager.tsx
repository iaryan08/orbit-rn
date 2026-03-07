'use client';

import { useState, useEffect } from 'react';
import { subscribeUserToPush, requestNotificationPermission } from '@/lib/push';
import { Button } from '@/components/ui/button';
import { Bell, MapPin, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '@/lib/firebase/client';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

type GeoPermissionState = PermissionState | 'prompt-with-rationale';
const PERM_CHECK_CACHE_KEY = 'orbit:perm_check_cache_v1';
const PERM_CHECK_TTL_MS = 30 * 60 * 1000; // 30m

export default function PushNotificationManager() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
    const [locationPermission, setLocationPermission] = useState<GeoPermissionState>('prompt');
    const [isVisible, setIsVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [hasUser, setHasUser] = useState(false);

    // Check user auth
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setHasUser(!!user);
        });
        return () => unsubscribe();
    }, []);

    // Check push support + subscription + notification permission
    useEffect(() => {
        if (typeof window === 'undefined') return;

        async function checkPermissions() {
            try {
                const cachedRaw = localStorage.getItem(PERM_CHECK_CACHE_KEY);
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (cached && typeof cached.ts === 'number' && Date.now() - cached.ts < PERM_CHECK_TTL_MS) {
                        if (cached.notifPermission) setNotifPermission(cached.notifPermission);
                        if (cached.locationPermission) setLocationPermission(cached.locationPermission);
                        if (typeof cached.isSupported === 'boolean') setIsSupported(cached.isSupported);
                        return;
                    }
                }
            } catch { }

            if (Capacitor.isNativePlatform()) {
                const notif = await LocalNotifications.checkPermissions();
                const nStatus = notif.display === 'prompt' ? 'default' : notif.display as NotificationPermission;
                setNotifPermission(nStatus);

                const loc = await Geolocation.checkPermissions();
                const bestLoc = (loc.location === 'granted' || loc.coarseLocation === 'granted') ? 'granted' : loc.location;
                setLocationPermission(bestLoc);
                try {
                    localStorage.setItem(PERM_CHECK_CACHE_KEY, JSON.stringify({
                        ts: Date.now(),
                        notifPermission: nStatus,
                        locationPermission: bestLoc,
                        isSupported: false
                    }));
                } catch { }
            } else {
                const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
                setIsSupported(isPushSupported);
                if ('Notification' in window) {
                    const p = Notification.permission;
                    setNotifPermission(p);
                    try {
                        localStorage.setItem(PERM_CHECK_CACHE_KEY, JSON.stringify({
                            ts: Date.now(),
                            notifPermission: p,
                            locationPermission,
                            isSupported: isPushSupported
                        }));
                    } catch { }
                }
                if (isPushSupported) checkSubscription();
            }
        }

        checkPermissions();

        const isDismissed = localStorage.getItem('push-prompt-dismissed');
        if (isDismissed) setDismissed(true);
    }, []);

    // Listen to location permission changes
    useEffect(() => {
        if (typeof window === 'undefined' || Capacitor.isNativePlatform()) return;
        let result: PermissionStatus;
        if (navigator.permissions?.query) {
            navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((r) => {
                result = r;
                setLocationPermission(r.state);
                r.onchange = () => setLocationPermission(r.state);
            }).catch(() => { });
        }
        return () => {
            if (result) result.onchange = null;
        };
    }, []);

    // 3 seconds after page load: check if EITHER permission is missing → show card
    useEffect(() => {
        if (!hasUser) return;
        if (dismissed) return;

        const timer = setTimeout(() => {
            const nOk = notifPermission === 'granted';
            const lOk = locationPermission === 'granted' || (locationPermission as any) === 'coarseLocation';
            if (!nOk || !lOk) {
                setIsVisible(true);
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [hasUser, notifPermission, locationPermission, dismissed]);

    async function checkSubscription() {
        try {
            if (!('serviceWorker' in navigator)) return;
            // Use a timeout for .ready to avoid hanging on restricted browsers
            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => setTimeout(() => reject(new Error('SW Timeout')), 3000))
            ]) as ServiceWorkerRegistration;

            if (registration.pushManager) {
                const sub = await registration.pushManager.getSubscription();
                setSubscription(sub);
            }
        } catch (e) {
            console.log('[PushManager] Subscription check skipped:', e);
        }
    }

    async function handleEnableNotifications() {
        try {
            if (Capacitor.isNativePlatform()) {
                const result = await LocalNotifications.requestPermissions();
                const status = result.display === 'prompt' ? 'default' : result.display as NotificationPermission;
                setNotifPermission(status);
                if (status === 'granted') {
                    toast.success('Notifications enabled!');
                    checkIfShouldClose(status, locationPermission);
                } else {
                    toast.error('Permission denied.');
                }
            } else {
                const result = await requestNotificationPermission();
                setNotifPermission(result);
                localStorage.setItem('notification-permission', result);
                if (result === 'granted') {
                    const sub = await subscribeUserToPush();
                    setSubscription(sub);
                    await saveSubscription(sub);
                    toast.success('Notifications enabled!');
                    checkIfShouldClose(result, locationPermission);
                } else {
                    toast.error('Permission denied. Please enable in browser settings.');
                }
            }
        } catch {
            toast.error('Failed to enable notifications');
        }
    }

    async function handleEnableLocation() {
        try {
            if (Capacitor.isNativePlatform()) {
                const result = await Geolocation.requestPermissions();
                setLocationPermission(result.location);
                if (result.location === 'granted') {
                    toast.success('Location enabled!');
                    checkIfShouldClose(notifPermission, result.location);
                } else {
                    toast.error('Permission denied.');
                }
            } else {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition(
                    () => {
                        setLocationPermission('granted');
                        toast.success('Location enabled!');
                        checkIfShouldClose(notifPermission, 'granted');
                    },
                    () => {
                        toast.error('Location denied. Please enable in browser settings.');
                    },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            }
        } catch {
            toast.error('Failed to enable location');
        }
    }

    function checkIfShouldClose(nPerm: NotificationPermission, lPerm: GeoPermissionState) {
        const notifOk = nPerm === 'granted';
        const locationOk = lPerm === 'granted';
        if (notifOk && locationOk) {
            setIsVisible(false);
        }
    }

    async function saveSubscription(sub: PushSubscription) {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) throw new Error('Failed to save subscription');
    }

    const handleDismiss = () => {
        setIsVisible(false);
        setDismissed(true);
        localStorage.setItem('push-prompt-dismissed', 'true');
    };

    const notifOk = notifPermission === 'granted';
    const locationOk = locationPermission === 'granted' || (locationPermission as any) === 'coarseLocation';

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ x: 120, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 120, opacity: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                    className="fixed top-20 right-4 md:top-24 md:right-5 z-[60] w-[calc(100vw-32px)] max-w-[340px]"
                >
                    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/60 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                        {/* Accent bar */}
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-400 via-rose-500 to-purple-500" />

                        {/* Close */}
                        <button
                            onClick={handleDismiss}
                            className="absolute top-3 right-3 p-1 text-white/30 hover:text-white/70 rounded-full hover:bg-white/10 transition-all"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>

                        <div className="p-4 pr-8">
                            {/* Header */}
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400/20 to-rose-500/20 border border-white/10 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                </div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
                                    Permissions Needed
                                </p>
                            </div>

                            <div className="space-y-2.5">
                                {/* Notifications row */}
                                {!notifOk && (
                                    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-white/5 border border-white/8">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Bell className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold text-white/80 leading-tight">Notifications</p>
                                                <p className="text-[9px] text-white/35 leading-tight mt-0.5 truncate">Stay in sync with your partner</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={handleEnableNotifications}
                                            size="sm"
                                            className="h-6 px-2.5 text-[9px] font-black uppercase tracking-wider shrink-0 bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 border border-rose-500/30 hover:border-rose-400/50"
                                        >
                                            Enable
                                        </Button>
                                    </div>
                                )}

                                {/* Location row */}
                                {!locationOk && (
                                    <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-white/5 border border-white/8">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <MapPin className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold text-white/80 leading-tight">Location</p>
                                                <p className="text-[9px] text-white/35 leading-tight mt-0.5 truncate">Distance & local weather</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={handleEnableLocation}
                                            size="sm"
                                            className="h-6 px-2.5 text-[9px] font-black uppercase tracking-wider shrink-0 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-500/30 hover:border-indigo-400/50"
                                        >
                                            {locationPermission === 'denied' ? 'Manual' : 'Enable'}
                                        </Button>
                                    </div>
                                )}

                                {/* Dismiss link */}
                                <button
                                    onClick={handleDismiss}
                                    className="w-full text-center text-[9px] text-white/20 hover:text-white/40 transition-colors uppercase tracking-widest pt-0.5"
                                >
                                    Maybe later
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
