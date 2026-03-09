import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, BackHandler, ToastAndroid } from 'react-native';
import { auth, rtdb } from '../lib/firebase';
import { onIdTokenChanged } from 'firebase/auth';
import { useOrbitStore } from '../lib/store';
import PagerView from 'react-native-pager-view';
import { ref, update, onDisconnect, serverTimestamp } from 'firebase/database';
import { DashboardScreen } from '../components/screens/DashboardScreen';
import { LettersScreen } from '../components/screens/LettersScreen';
import { MemoriesScreen } from '../components/screens/MemoriesScreen';
import { IntimacyScreen } from '../components/screens/IntimacyScreen';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { LunaraScreen } from '../components/screens/LunaraScreen';
import { PartnerScreen } from '../components/screens/PartnerScreen';
import { SyncCinemaScreen } from '../components/screens/SyncCinemaScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { LoadingScreen } from '../components/LoadingScreen';
import { initializeDatabase } from '../lib/db/db';
import { getPublicStorageUrl } from '../lib/storage';
import * as FileSystem from 'expo-file-system/legacy';

export default function Index() {
    const { activeTabIndex, setTabIndex, navigationSource, scrollOffset, isPagerScrollEnabled, setPagerScrollEnabled, fetchData, appMode, setAppMode, loading, couple, memories, initAppMode } = useOrbitStore();
    const [user, setUser] = useState<any>(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [isPagerReady, setIsPagerReady] = useState(false);
    const fetchCalledRef = useRef(false);
    const pagerRef = useRef<PagerView>(null);
    const lastBackPressRef = useRef(0);
    const EXIT_THRESHOLD_MS = 1800;
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isAuthChecking && !user) {
            console.log("[Index] Redirecting to /login");
            router.replace('/login');
        }
    }, [user, isAuthChecking]);

    useEffect(() => {
        console.log("[Index] Mounting...");
        const setup = async () => {
            await initializeDatabase(); // Best in Class: Setup SQLite
            initAppMode(); // Load persisted mode and set initial tab
        };
        setup();

        const unsub = onIdTokenChanged(auth, async (u) => {
            console.log("[Index] onIdTokenChanged:", u?.uid || "null");
            setUser(u);
            setIsAuthChecking(false);
            if (u) {
                try {
                    const token = await u.getIdToken();
                    useOrbitStore.setState({ idToken: token });
                } catch (e) {
                    console.warn("[Index] Failed to fetch refreshed token", e);
                }

                if (!fetchCalledRef.current) {
                    fetchCalledRef.current = true;
                    fetchData(u.uid);
                }
            } else {
                // Reset flag on sign-out to allow hydration on next sign-in
                fetchCalledRef.current = false;
            }
        });

        return () => {
            unsub();
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, []);

    // Global Presence Heartbeat
    useEffect(() => {
        if (!user || !couple?.id) return;

        const presenceRef = ref(rtdb, `presence/${couple.id}/${user.uid}`);
        const updatePresence = () => {
            update(presenceRef, {
                is_online: true,
                last_changed: serverTimestamp()
            });
        };

        updatePresence();
        const heartbeat = setInterval(updatePresence, 60000);

        onDisconnect(presenceRef).update({
            is_online: false,
            in_cinema: null,
            last_changed: serverTimestamp()
        });

        return () => {
            clearInterval(heartbeat);
        };
    }, [user?.uid, couple?.id]);

    // Android back behavior:
    // 1) From any tab except Dashboard, go to Dashboard first.
    // 2) On Dashboard, require double-back to exit with a short toast hint.
    useEffect(() => {
        const onBackPress = () => {
            if (activeTabIndex !== 1) {
                setTabIndex(1, 'tap');
                return true;
            }

            const now = Date.now();
            if (now - lastBackPressRef.current <= EXIT_THRESHOLD_MS) {
                BackHandler.exitApp();
                return true;
            }

            lastBackPressRef.current = now;
            ToastAndroid.show('Press again to exit', ToastAndroid.SHORT);
            return true;
        };

        const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => sub.remove();
    }, [activeTabIndex, setTabIndex]);

    const isSyncingRef = useRef(false);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isProgrammaticRef = useRef(false);
    const didAutoSyncRef = useRef(false);

    // Auto-sync when couple is ready AND memories are missing image_urls (stale SQLite)
    useEffect(() => {
        if (!couple?.id || didAutoSyncRef.current) return;
        const { memories: currentMemories } = useOrbitStore.getState();
        const hasStaleMemories = currentMemories.some(
            (m: any) => !m.image_urls && !m.image_url
        );
        if (hasStaleMemories) {
            didAutoSyncRef.current = true;
            useOrbitStore.getState().syncNow();
        }
    }, [couple?.id, memories]);

    // Sync PagerView with store index reliably (Source-Prioritized)
    useEffect(() => {
        if (pagerRef.current && navigationSource === 'tap') {
            console.log(`[Index] Driving Pager to: ${activeTabIndex} (Source: tap)`);
            isProgrammaticRef.current = true;

            // Critical: Tick-delay to ensure native side is receptive after state update
            const runTimer = setTimeout(() => {
                pagerRef.current?.setPage(activeTabIndex);
            }, 0);

            // Keep this lock short to avoid making swipe feel disabled after tap navigation.
            const resetTimer = setTimeout(() => {
                isProgrammaticRef.current = false;
                setPagerScrollEnabled(true);
                useOrbitStore.setState({ navigationSource: 'swipe' });
            }, 320);

            return () => {
                clearTimeout(runTimer);
                clearTimeout(resetTimer);
            };
        }
    }, [activeTabIndex, navigationSource]);

    // Best in Class: Predictive Asset Prewarming
    // Temporarily disabled to prevent network spikes on initial load.
    useEffect(() => {
        if (!user || loading) return;
        // Pre-warming logic can be re-enabled with lower concurrency/priority if needed.
    }, [activeTabIndex, loading]);

    // Auto-sync dock mode (Ultra-responsive)
    useEffect(() => {
        // Lunara screens are now 5 (Lunara) and 6 (Partner)
        if (activeTabIndex === 5 || activeTabIndex === 6) {
            setAppMode('lunara');
        } else if ([1, 2, 3, 4, 7].includes(activeTabIndex)) {
            setAppMode('moon');
        }
    }, [activeTabIndex]);

    console.log(`[Index] Render - user: ${!!user}, loading: ${loading}, authChecking: ${isAuthChecking}`);

    if (isAuthChecking || (user && loading)) {
        return <LoadingScreen />;
    }

    if (!user) {
        return <View style={{ flex: 1, backgroundColor: '#000' }} />;
    }

    return (
        <View style={styles.container}>
            <PagerView
                ref={pagerRef}
                style={styles.pagerView}
                initialPage={activeTabIndex}
                scrollEnabled={isPagerScrollEnabled}
                onPageScroll={(e) => {
                    const exactPos = e.nativeEvent.position + e.nativeEvent.offset;
                    scrollOffset.value = exactPos;
                }}
                onPageSelected={(e) => {
                    if (!isProgrammaticRef.current) {
                        setTabIndex(e.nativeEvent.position, 'swipe');
                    }
                    setPagerScrollEnabled(true);
                }}
                onLayout={() => setIsPagerReady(true)}
            >
                <View key="0">
                    {isPagerReady ? <SyncCinemaScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                </View>
                <View key="1">
                    <DashboardScreen />
                </View>
                <View key="2">
                    {isPagerReady ? <LettersScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                </View>
                <View key="3">
                    {isPagerReady ? <MemoriesScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                </View>
                <View key="4">
                    <IntimacyScreen />
                </View>
                <View key="5">
                    <LunaraScreen />
                </View>
                <View key="6">
                    <PartnerScreen />
                </View>
                <View key="7">
                    <SettingsScreen />
                </View>
            </PagerView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    pagerView: {
        flex: 1,
    },
});
