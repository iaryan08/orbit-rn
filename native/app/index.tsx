import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useOrbitStore } from '../lib/store';
import PagerView from 'react-native-pager-view';
import { DashboardScreen } from '../components/screens/DashboardScreen';
import { LettersScreen } from '../components/screens/LettersScreen';
import { MemoriesScreen } from '../components/screens/MemoriesScreen';
import { IntimacyScreen } from '../components/screens/IntimacyScreen';
import { SettingsScreen } from '../components/screens/SettingsScreen';
import { LunaraScreen } from '../components/screens/LunaraScreen';
import { PartnerScreen } from '../components/screens/PartnerScreen';
import { SyncCinemaScreen } from '../components/screens/SyncCinemaScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingScreen } from '../components/LoadingScreen';
import { initializeDatabase } from '../lib/db/db';
import { getPublicStorageUrl } from '../lib/storage';
import * as FileSystem from 'expo-file-system';

export default function Index() {
    const { activeTabIndex, setTabIndex, scrollOffset, isPagerScrollEnabled, setPagerScrollEnabled, fetchData, appMode, setAppMode, loading, couple, initAppMode } = useOrbitStore();
    const [user, setUser] = useState<any>(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [isPagerReady, setIsPagerReady] = useState(false);
    const fetchCalledRef = useRef(false);
    const pagerRef = useRef<PagerView>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        console.log("[Index] Mounting...");
        initializeDatabase(); // Best in Class: Setup SQLite
        initAppMode(); // Load persisted mode and set initial tab
        const unsub = onAuthStateChanged(auth, (u) => {
            console.log("[Index] onAuthStateChanged:", u?.uid || "null");
            setUser(u);
            setIsAuthChecking(false);
            if (u && !fetchCalledRef.current) {
                console.log("[Index] Triggering fetchData for:", u.uid);
                fetchCalledRef.current = true;
                fetchData(u.uid);
            }
        });
        return unsub;
    }, []);

    const isSyncingRef = useRef(false);
    const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync PagerView with store index and safety reset scrolling
    useEffect(() => {
        if (isPagerReady && pagerRef.current) {
            try {
                // If the PagerView is already at the correct index, do nothing
                // This prevents recursive updates and "glitches"
                isSyncingRef.current = true;
                pagerRef.current.setPage(activeTabIndex);

                // Clear any existing timeout
                if (syncTimeoutRef.current) {
                    clearTimeout(syncTimeoutRef.current);
                }

                // Reset the syncing flag after a short delay to allow the
                // native animation event (if any echoes) to pass ignored
                syncTimeoutRef.current = setTimeout(() => {
                    isSyncingRef.current = false;
                }, 150);

            } catch (e) {
                console.warn("[Index] PagerView sync failed:", e);
                isSyncingRef.current = false;
            }
        }
        setPagerScrollEnabled(true);
    }, [activeTabIndex, isPagerReady]);

    // Best in Class: Predictive Asset Prewarming + Persistent Cache
    useEffect(() => {
        if (!user || loading) return;

        const { memories, idToken } = useOrbitStore.getState();

        const prewarm = async (index: number) => {
            if (index === 2) { // Memories Tab
                const firstFive = memories.slice(0, 5);
                firstFive.forEach(async (m) => {
                    if (m.image_url) {
                        try {
                            const url = getPublicStorageUrl(m.image_url, 'memories', idToken || '');
                            if (!url) return;

                            // Best in Class: Persistent Signal-style storage
                            const { ensureMediaPersistent } = require('../lib/media');
                            ensureMediaPersistent(m.id, url);

                            // Expo Image prefetch for immediate use
                            const { Image } = require('expo-image');
                            Image.prefetch(url);
                        } catch (e) { }
                    }
                });
            }
        };

        if (activeTabIndex === 1) prewarm(2);
        if (activeTabIndex === 0) prewarm(2);
    }, [activeTabIndex, loading]);

    // Auto-sync dock mode (Ultra-responsive)
    useEffect(() => {
        // Lunara screens are now 5 (Lunara) and 6 (Partner)
        if (activeTabIndex === 5 || activeTabIndex === 6) {
            setAppMode('lunara');
        } else if (activeTabIndex === 1 || activeTabIndex === 2 || activeTabIndex === 4) {
            // Dashboard, Letters, Intimacy (Memories 3 can be both, so we skip it to preserve current mode)
            setAppMode('moon');
        }
    }, [activeTabIndex]);

    console.log(`[Index] Render - user: ${!!user}, loading: ${loading}, authChecking: ${isAuthChecking}`);

    if (isAuthChecking || (user && loading)) {
        return <LoadingScreen />;
    }

    if (!user) {
        console.log("[Index] No user, returning null");
        return null;
    }

    return (
        <View style={styles.container}>
            <PagerView
                ref={pagerRef}
                style={styles.pagerView}
                initialPage={activeTabIndex}
                scrollEnabled={isPagerScrollEnabled}
                onPageScroll={(e) => {
                    scrollOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
                }}
                onPageSelected={(e) => {
                    if (isSyncingRef.current) return;
                    setTabIndex(e.nativeEvent.position);
                }}
                onLayout={() => setIsPagerReady(true)}
            >
                <View key="0">
                    <SyncCinemaScreen />
                </View>
                <View key="1">
                    <DashboardScreen />
                </View>
                <View key="2">
                    <LettersScreen />
                </View>
                <View key="3">
                    <MemoriesScreen />
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
        backgroundColor: '#000',
    },
    pagerView: {
        flex: 1,
    },
});
