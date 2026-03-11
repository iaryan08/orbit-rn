import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, BackHandler, ToastAndroid, AppState } from 'react-native';
import { auth, rtdb } from '../lib/firebase';
import { onIdTokenChanged } from 'firebase/auth';
import { useOrbitStore } from '../lib/store';
import PagerView from 'react-native-pager-view';
import { ref, update, onDisconnect, serverTimestamp } from 'firebase/database';
import { PerfChip, usePerfMonitor } from '../components/PerfChip';
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

const LazyTab = React.memo(({ index, children, activeTabIndex }: { index: number, children: React.ReactNode, activeTabIndex: number }) => {
    const isNear = Math.abs(activeTabIndex - index) <= 1;
    const [hasBeenActive, setHasBeenActive] = useState(false);

    useEffect(() => {
        if (isNear) setHasBeenActive(true);
    }, [isNear]);

    if (!hasBeenActive && !isNear) return <View style={{ flex: 1, backgroundColor: 'black' }} />;
    return <View style={{ flex: 1 }}>{children}</View>;
});

import { initializeMediaEngine } from '../lib/media';

export default function Index() {
    const {
        activeTabIndex, setTabIndex, navigationSource, scrollOffset,
        isPagerScrollEnabled, setPagerScrollEnabled, fetchData,
        appMode, setAppMode, loading, couple, memories, letters, profile, initAppMode,
        runJanitor
    } = useOrbitStore();
    const [user, setUser] = useState<any>(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [isPagerReady, setIsPagerReady] = useState(false);
    const fetchCalledForId = useRef<string | null>(null);
    const fetchCleanupRef = useRef<(() => void) | null>(null);
    const pagerRef = useRef<PagerView>(null);
    const lastBackPressRef = useRef(0);
    const EXIT_THRESHOLD_MS = 1800;
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const perfStats = usePerfMonitor('Index');
    const isDebugMode = useOrbitStore(s => s.isDebugMode);

    // Redirect handled at _layout level to avoid linking conflicts
    useEffect(() => {
        // Nothing here, redirect is in RootLayoutNav
    }, [user, isAuthChecking]);

    useEffect(() => {
        console.log("[Index] Mounting...");
        const setup = async () => {
            await initializeDatabase(); // Best in Class: Setup SQLite
            await initializeMediaEngine(); // Scan local media for zero-flicker boot
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

                // Fetch user data if not already loading/loaded for THIS UID
                if (fetchCalledForId.current !== u.uid) {
                    if (fetchCleanupRef.current) fetchCleanupRef.current();
                    fetchCalledForId.current = u.uid;
                    fetchCleanupRef.current = fetchData(u.uid);
                }
            } else {
                fetchCalledForId.current = null;
                if (fetchCleanupRef.current) {
                    fetchCleanupRef.current();
                    fetchCleanupRef.current = null;
                }
            }
        });

        return () => {
            unsub();
            if (fetchCleanupRef.current) fetchCleanupRef.current();
        };
    }, []);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'background' || nextState === 'inactive') {
                console.log("[Index] App backgrounded. Running Janitor...");
                runJanitor();
            }
        });
        return () => sub.remove();
    }, [runJanitor]);

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

    const isProgrammaticRef = useRef(false);

    // Sync PagerView with store index reliably (Source-Prioritized)
    useEffect(() => {
        if (pagerRef.current && navigationSource === 'tap') {
            isProgrammaticRef.current = true;

            // Critical: Tick-delay to ensure native side is receptive after state update
            pagerRef.current?.setPage(activeTabIndex);

            // Keep this lock short to avoid making swipe feel disabled after tap navigation.
            const resetTimer = setTimeout(() => {
                isProgrammaticRef.current = false;
                setPagerScrollEnabled(true);
                useOrbitStore.setState({ navigationSource: 'swipe' });
            }, 320);

            return () => clearTimeout(resetTimer);
        }
    }, [activeTabIndex, navigationSource]);

    // Update app mode based on current tab
    useEffect(() => {
        if (activeTabIndex === 5 || activeTabIndex === 6) {
            setAppMode('lunara');
        } else if ([1, 2, 3, 4, 7].includes(activeTabIndex)) {
            setAppMode('moon');
        }
    }, [activeTabIndex]);

    // Predicted Assets (Pre-warming)
    useEffect(() => {
        // Disabled to minimize network use
    }, [activeTabIndex]);

    if (isAuthChecking) {
        return <LoadingScreen />;
    }

    if (!user) {
        // The _layout handles redirect, but we return a blank view to prevent flash
        return <View style={{ flex: 1, backgroundColor: '#000' }} />;
    }

    // Best in Class: Prevent flickering by only showing loader on cold boot if NO data exists
    if (loading && memories.length === 0 && letters.length === 0 && !profile) {
        return <LoadingScreen />;
    }

    return (
        <View style={styles.container}>
            {isDebugMode && (
                <View style={{ position: 'absolute', top: insets.top + 4, right: 110, zIndex: 10001 }}>
                    <PerfChip name="INDEX" stats={perfStats} />
                </View>
            )}
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
                    <LazyTab index={0} activeTabIndex={activeTabIndex}>
                        {isPagerReady ? <SyncCinemaScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                    </LazyTab>
                </View>
                <View key="1">
                    <LazyTab index={1} activeTabIndex={activeTabIndex}>
                        <DashboardScreen />
                    </LazyTab>
                </View>
                <View key="2">
                    <LazyTab index={2} activeTabIndex={activeTabIndex}>
                        {isPagerReady ? <LettersScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                    </LazyTab>
                </View>
                <View key="3">
                    <LazyTab index={3} activeTabIndex={activeTabIndex}>
                        {isPagerReady ? <MemoriesScreen /> : <View style={{ flex: 1, backgroundColor: 'black' }} />}
                    </LazyTab>
                </View>
                <View key="4">
                    <LazyTab index={4} activeTabIndex={activeTabIndex}>
                        <IntimacyScreen />
                    </LazyTab>
                </View>
                <View key="5">
                    <LazyTab index={5} activeTabIndex={activeTabIndex}>
                        <LunaraScreen />
                    </LazyTab>
                </View>
                <View key="6">
                    <LazyTab index={6} activeTabIndex={activeTabIndex}>
                        <PartnerScreen />
                    </LazyTab>
                </View>
                <View key="7">
                    <LazyTab index={7} activeTabIndex={activeTabIndex}>
                        <SettingsScreen />
                    </LazyTab>
                </View>
            </PagerView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    pagerView: {
        flex: 1,
    },
});
