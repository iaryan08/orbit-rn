import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, BackHandler, ToastAndroid, AppState } from 'react-native';
import { auth, rtdb } from '../lib/firebase';
import { onIdTokenChanged, User } from 'firebase/auth';
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
import { initializeMediaEngine } from '../lib/media';

const LazyTab = React.memo(({ index, children, activeTabIndex, mountedIndexes }: { index: number, children: React.ReactElement, activeTabIndex: number, mountedIndexes: number[] }) => {
    // Keep exactly the active tab mounted at rest, and only the live pager pair during swipes.
    const isMounted = mountedIndexes.includes(index);
    const isActive = index === activeTabIndex;

    if (!isMounted) return <View style={{ flex: 1, backgroundColor: 'black' }} />;

    // 🚀 Aggressive Cooling: Propagate isActive to children so they can pause background loops
    return (
        <View style={{ flex: 1 }}>
            {React.cloneElement(children, { isActive } as any)}
        </View>
    );
});

export default function Index() {
    const {
        activeTabIndex, setTabIndex, navigationSource, scrollOffset,
        isPagerScrollEnabled, setPagerScrollEnabled, fetchData,
        loading, memories, letters, profile, initAppMode,
        runJanitor, isDebugMode
    } = useOrbitStore();

    const [user, setUser] = useState<User | null>(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [isPagerReady, setIsPagerReady] = useState(false);
    const [mountedIndexes, setMountedIndexes] = useState<number[]>([activeTabIndex]);
    const fetchCalledForId = useRef<string | null>(null);
    const fetchCleanupRef = useRef<(() => void) | null>(null);
    const pagerRef = useRef<PagerView>(null);
    const lastBackPressRef = useRef(0);
    const EXIT_THRESHOLD_MS = 1800;
    const insets = useSafeAreaInsets();
    const perfStats = usePerfMonitor('Index');

    useEffect(() => {
        setMountedIndexes((prev) => (prev.length === 1 && prev[0] === activeTabIndex) ? prev : [activeTabIndex]);
    }, [activeTabIndex]);

    useEffect(() => {
        const setup = async () => {
            await initializeDatabase();
            await initializeMediaEngine();
            initAppMode();
        };
        setup();

        const unsub = onIdTokenChanged(auth, async (u) => {
            setUser(u);
            setIsAuthChecking(false);
            if (u) {
                try {
                    const token = await u.getIdToken();
                    useOrbitStore.setState({ idToken: token });
                } catch (e) {
                    console.warn("[Index] Token refresh failed", e);
                }

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
    }, [fetchData, initAppMode]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'background' || nextState === 'inactive') {
                runJanitor();
            }
        });
        return () => sub.remove();
    }, [runJanitor]);

    useEffect(() => {
        const currentCouple = useOrbitStore.getState().couple;
        if (!user || !currentCouple?.id) return;
        const presenceRef = ref(rtdb, `presence/${currentCouple.id}/${user.uid}`);

        const updatePresence = () => {
            update(presenceRef, { is_online: true, last_changed: serverTimestamp() });
        };

        updatePresence();
        const heartbeat = setInterval(updatePresence, 60000);
        onDisconnect(presenceRef).update({ is_online: false, in_cinema: null, last_changed: serverTimestamp() });

        return () => clearInterval(heartbeat);
    }, [user?.uid]);

    const onBackPress = useCallback(() => {
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
    }, [activeTabIndex, setTabIndex]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => sub.remove();
    }, [onBackPress]);

    const isProgrammaticRef = useRef(false);
    useEffect(() => {
        if (pagerRef.current && navigationSource === 'tap') {
            isProgrammaticRef.current = true;
            pagerRef.current?.setPage(activeTabIndex);
            const timer = setTimeout(() => {
                isProgrammaticRef.current = false;
                setPagerScrollEnabled(true);
                useOrbitStore.setState({ navigationSource: 'swipe' });
            }, 320);
            return () => clearTimeout(timer);
        }
    }, [activeTabIndex, navigationSource, setPagerScrollEnabled]);

    if (isAuthChecking) return <LoadingScreen />;
    if (!user) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
    if (loading && memories.length === 0 && letters.length === 0 && !profile) return <LoadingScreen />;

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
                    scrollOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
                    const visibleIndexes = new Set<number>([activeTabIndex, e.nativeEvent.position]);
                    if (e.nativeEvent.offset > 0) {
                        visibleIndexes.add(e.nativeEvent.position + 1);
                    }
                    const nextMounted = Array.from(visibleIndexes).sort((a, b) => a - b);
                    setMountedIndexes((prev) => (
                        prev.length === nextMounted.length && prev.every((value, idx) => value === nextMounted[idx])
                    ) ? prev : nextMounted);
                }}
                onPageSelected={(e) => {
                    if (!isProgrammaticRef.current) {
                        setTabIndex(e.nativeEvent.position, 'swipe');
                    }
                    setPagerScrollEnabled(true);
                    setMountedIndexes([e.nativeEvent.position]);
                }}
                onLayout={() => setIsPagerReady(true)}
            >
                <View key="0"><LazyTab index={0} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <SyncCinemaScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="1"><LazyTab index={1} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}><DashboardScreen /></LazyTab></View>
                <View key="2"><LazyTab index={2} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LettersScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="3"><LazyTab index={3} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <MemoriesScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="4"><LazyTab index={4} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <IntimacyScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="5"><LazyTab index={5} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LunaraScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="6"><LazyTab index={6} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <PartnerScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="7"><LazyTab index={7} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <SettingsScreen /> : <View style={styles.black} />}</LazyTab></View>
            </PagerView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    pagerView: { flex: 1 },
    black: { flex: 1, backgroundColor: 'black' }
});
