import { Stack, usePathname } from "expo-router";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { useColorScheme, View, Platform, KeyboardAvoidingView, ActivityIndicator } from "react-native";
import { Colors } from "../constants/Theme";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavbarDock } from "../components/NavbarDock";
import { useSafeAreaInsets, SafeAreaProvider } from "react-native-safe-area-context";
import { DynamicBackground } from "../components/DynamicBackground";
import { NotificationDrawer } from "../components/NotificationDrawer";
import { MoodLoggerDrawer } from "../components/MoodLoggerDrawer";
import { MediaViewer } from "../components/MediaViewer";
import { SearchPalette } from "../components/SearchPalette";
import { ConnectionSync } from "../components/ConnectionSync";
import { AppLockOverlay } from "../components/AppLockOverlay";
import { PerfChip, usePerfMonitor } from "../components/PerfChip";
import {
    useFonts,
    Syne_400Regular,
    Syne_700Bold,
} from '@expo-google-fonts/syne';
import {
    BodoniModa_400Regular,
    BodoniModa_700Bold,
    BodoniModa_400Regular_Italic,
} from '@expo-google-fonts/bodoni-moda';
import {
    MeaCulpa_400Regular,
} from '@expo-google-fonts/mea-culpa';
import {
    Outfit_400Regular,
    Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
    CormorantGaramond_400Regular,
    CormorantGaramond_700Bold,
    CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from "react";
import { useOrbitStore } from '../lib/store';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '../lib/push';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
    const profile = useOrbitStore(state => state.profile);
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const idToken = useOrbitStore(state => state.idToken);
    const isNotificationDrawerOpen = useOrbitStore(state => state.isNotificationDrawerOpen);
    const mediaViewerState = useOrbitStore(state => state.mediaViewerState);
    const loading = useOrbitStore(state => state.loading);
    const activeTabIndex = useOrbitStore(state => state.activeTabIndex);


    const pathname = usePathname();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const perfStats = usePerfMonitor('Layout');
    const isDebugMode = useOrbitStore(s => s.isDebugMode);
    const isOverlayOpen = isNotificationDrawerOpen || mediaViewerState.isOpen;

    // undefined = still loading, null = signed out, object = signed in
    const [authUser, setAuthUser] = useState<any>(undefined);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setAuthUser(user ?? null);
        });
        return unsub;
    }, []);

    // Redirect unauthenticated users to login
    useEffect(() => {
        if (authUser === null && pathname !== '/login') {
            router.replace('/login');
        }
    }, [authUser, pathname]);

    // Push Notifications Setup
    useEffect(() => {
        if (authUser) {
            registerForPushNotificationsAsync();
            const cleanup = setupNotificationListeners((notification) => {
                console.log('[Notification] Received:', notification);
            });
            return cleanup;
        }
    }, [!!authUser]);

    const [fontsLoaded, fontError] = useFonts({
        Syne_400Regular,
        Syne_700Bold,
        BodoniModa_400Regular,
        BodoniModa_700Bold,
        BodoniModa_400Regular_Italic,
        MeaCulpa_400Regular,
        Outfit_400Regular,
        Outfit_700Bold,
        CormorantGaramond_400Regular,
        CormorantGaramond_700Bold,
        CormorantGaramond_400Regular_Italic,
        // Apple Color Emoji for Signal-style consistency on Android
        'AppleColorEmoji': require('../assets/fonts/AppleColorEmoji.ttf'),
    });


    useEffect(() => {
        if (fontsLoaded || fontError) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded, fontError]);

    if (!fontsLoaded && !fontError) {
        return null;
    }

    const CustomDarkTheme = {
        ...DarkTheme,
        colors: {
            ...DarkTheme.colors,
            background: Colors.dark.background,
            card: Colors.dark.card,
            text: Colors.dark.foreground,
            border: Colors.dark.border,
            primary: Colors.dark.rose[500],
        },
    };

    // Hide dock on login, when not yet authenticated, or during initial app loading
    // We let activeTabIndex === 0 (Sync Cinema) animate the dock out inside NavbarDock.tsx itself
    const isAuthenticated = !!authUser;
    const isAppLoading = loading && isAuthenticated;
    const hideDock = pathname === '/login' || !isAuthenticated || isAppLoading || activeTabIndex === 0;


    return (

        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider value={CustomDarkTheme}>
                {isAuthenticated && !hideDock && (
                    <DynamicBackground
                        isPaused={isOverlayOpen}
                    />
                )}
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: 'transparent' },
                    }}
                >
                    <Stack.Screen name="index" />
                </Stack>
                {/* Only render global UI when authenticated */}
                {isAuthenticated && !hideDock && <NavbarDock />}
                {isAuthenticated && <NotificationDrawer />}
                {isAuthenticated && <MoodLoggerDrawer />}
                {isAuthenticated && <MediaViewer />}
                {isAuthenticated && <SearchPalette />}
                {/* Global Intimacy Layer: Always at the Top Z-Index */}
                {isAuthenticated && <ConnectionSync />}
                {isAuthenticated && <AppLockOverlay />}
                <StatusBar style="light" />
                {isDebugMode && (
                    <View style={{ position: 'absolute', top: insets.top + 4, right: 204, zIndex: 10002 }}>
                        <PerfChip name="LAYOUT" stats={perfStats} />
                    </View>
                )}
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <RootLayoutNav />
        </SafeAreaProvider>
    );
}
