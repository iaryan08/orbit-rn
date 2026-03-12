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
// import { PartnerScreen } from '../components/screens/PartnerScreen';
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
    const [retainedTabIndex, setRetainedTabIndex] = useState<number | null>(null);
    const fetchCalledForId = useRef<string | null>(null);
    const fetchCleanupRef = useRef<(() => void) | null>(null);
    const pagerRef = useRef<PagerView>(null);
    const lastBackPressRef = useRef(0);
    const previousActiveTabRef = useRef(activeTabIndex);
    const EXIT_THRESHOLD_MS = 1800;
    const insets = useSafeAreaInsets();
    const perfStats = usePerfMonitor('Index');
    const currentCoupleId = useOrbitStore(state => state.couple?.id);
    const currentPresenceUserId = profile?.id || user?.uid || null;

    useEffect(() => {
        const prevActive = previousActiveTabRef.current;
        const nextRetained = prevActive !== activeTabIndex ? prevActive : retainedTabIndex;
        setRetainedTabIndex(nextRetained ?? null);
        const nextMounted = Array.from(new Set(
            [activeTabIndex, nextRetained]
                .filter((value): value is number => typeof value === 'number')
        )).sort((a, b) => a - b);
        setMountedIndexes((prev) => (
            prev.length === nextMounted.length && prev.every((value, idx) => value === nextMounted[idx])
        ) ? prev : nextMounted);
        previousActiveTabRef.current = activeTabIndex;
    }, [activeTabIndex, retainedTabIndex]);

    useEffect(() => {
        const setup = async () => {
            try {
                await initializeDatabase();
            } catch (e) {
                console.warn("[Index] Database init failed", e);
            }
            try {
                await initializeMediaEngine();
            } catch (e) {
                console.warn("[Index] Media init failed", e);
            }
            try {
                await initAppMode();
            } catch (e) {
                console.warn("[Index] App mode init failed", e);
            }
        };
        void setup();

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
                if (currentCoupleId && currentPresenceUserId) {
                    const presenceRef = ref(rtdb, `presence/${currentCoupleId}/${currentPresenceUserId}`);
                    update(presenceRef, { is_online: false, last_changed: serverTimestamp() }).catch(() => { });
                }
            } else if (nextState === 'active') {
                if (currentCoupleId && currentPresenceUserId) {
                    const presenceRef = ref(rtdb, `presence/${currentCoupleId}/${currentPresenceUserId}`);
                    update(presenceRef, { is_online: true, last_changed: serverTimestamp() }).catch(() => { });
                }
            }
        });
        return () => sub.remove();
    }, [runJanitor, currentCoupleId, currentPresenceUserId]);

    useEffect(() => {
        if (!currentPresenceUserId || !currentCoupleId) return;
        const presenceRef = ref(rtdb, `presence/${currentCoupleId}/${currentPresenceUserId}`);

        const updatePresence = () => {
            update(presenceRef, { is_online: true, last_changed: serverTimestamp() });
        };

        updatePresence();
        const heartbeat = setInterval(updatePresence, 60000);
        onDisconnect(presenceRef).update({ is_online: false, in_cinema: null, last_changed: serverTimestamp() });

        return () => clearInterval(heartbeat);
    }, [currentCoupleId, currentPresenceUserId]);

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
    if (!profile) return <LoadingScreen />;

    const isFemale = profile.gender === 'female';

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
                    if (retainedTabIndex !== null) visibleIndexes.add(retainedTabIndex);
                    if (e.nativeEvent.offset > 0) visibleIndexes.add(e.nativeEvent.position + 1);

                    const nextMounted = Array.from(visibleIndexes).sort((a, b) => a - b);
                    setMountedIndexes((prev) => (
                        prev.length === nextMounted.length && prev.every((value, idx) => value === nextMounted[idx])
                    ) ? prev : nextMounted);
                }}
                onPageSelected={(e) => {
                    const pos = e.nativeEvent.position;
                    // Prevent feedback loop if source is 'tap'
                    if (!isProgrammaticRef.current) {
                        setTabIndex(pos, 'swipe');
                    }
                    setPagerScrollEnabled(true);
                    setRetainedTabIndex(previousActiveTabRef.current === pos ? retainedTabIndex : previousActiveTabRef.current);
                }}
                onLayout={() => setIsPagerReady(true)}
            >
                <View key="cinema"><LazyTab index={0} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <SyncCinemaScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="dashboard"><LazyTab index={1} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}><DashboardScreen /></LazyTab></View>
                <View key="letters"><LazyTab index={2} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LettersScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="memories"><LazyTab index={3} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <MemoriesScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="milestones"><LazyTab index={4} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <IntimacyScreen /> : <View style={styles.black} />}</LazyTab></View>
                <View key="lunara-today"><LazyTab index={5} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LunaraScreen forcedTab="today" isActive={activeTabIndex === 5} /> : <View style={styles.black} />}</LazyTab></View>
                <View key="lunara-cycle"><LazyTab index={6} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LunaraScreen forcedTab={isFemale ? 'cycle' : 'body'} isActive={activeTabIndex === 6} /> : <View style={styles.black} />}</LazyTab></View>
                <View key="lunara-body"><LazyTab index={7} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <LunaraScreen forcedTab={isFemale ? 'body' : 'partner'} isActive={activeTabIndex === 7} /> : <View style={styles.black} />}</LazyTab></View>
                <View key="lunara-partner">
                    {isFemale ? (
                        <LazyTab index={8} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>
                            {isPagerReady ? <LunaraScreen forcedTab="partner" isActive={activeTabIndex === 8} /> : <View style={styles.black} />}
                        </LazyTab>
                    ) : (
                        <LazyTab index={8} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>
                            {isPagerReady ? <LunaraScreen forcedTab="learn" isActive={activeTabIndex === 8} /> : <View style={styles.black} />}
                        </LazyTab>
                    )}
                </View>
                <View key="settings"><LazyTab index={9} activeTabIndex={activeTabIndex} mountedIndexes={mountedIndexes}>{isPagerReady ? <SettingsScreen /> : <View style={styles.black} />}</LazyTab></View>
            </PagerView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    pagerView: { flex: 1 },
    black: { flex: 1, backgroundColor: 'black' }
});
