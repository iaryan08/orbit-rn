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

export default function Index() {
    const { activeTabIndex, setTabIndex, isPagerScrollEnabled, setPagerScrollEnabled, fetchData, appMode, setAppMode, loading, couple, initAppMode } = useOrbitStore();
    const [user, setUser] = useState<any>(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [isPagerReady, setIsPagerReady] = useState(false);
    const fetchCalledRef = useRef(false);
    const pagerRef = useRef<PagerView>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        console.log("[Index] Mounting...");
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
                pagerRef.current.setPageWithoutAnimation(activeTabIndex);

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

    // Auto-sync dock mode
    useEffect(() => {
        if (activeTabIndex === 6 || activeTabIndex === 7) {
            setAppMode('lunara');
        } else if (activeTabIndex <= 5 && appMode === 'lunara') {
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
                onPageSelected={(e) => {
                    if (isSyncingRef.current) return; // Ignore programmatic changes from echoing
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
                    <SettingsScreen />
                </View>
                {/* Tab 6: Lunara — only rendered in lunara mode */}
                <View key="6">
                    <LunaraScreen />
                </View>
                <View key="7">
                    <PartnerScreen />
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
