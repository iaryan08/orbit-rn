import { Stack, usePathname } from "expo-router";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { Colors } from "../constants/Theme";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavbarDock } from "../components/NavbarDock";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DynamicBackground } from "../components/DynamicBackground";
import { NotificationDrawer } from "../components/NotificationDrawer";
import { MoodLoggerDrawer } from "../components/MoodLoggerDrawer";
import { MediaViewer } from "../components/MediaViewer";
import { SearchPalette } from "../components/SearchPalette";
import {
    useFonts,
    Outfit_400Regular,
    Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
    CormorantGaramond_300Light,
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    CormorantGaramond_400Regular_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import {
    PinyonScript_400Regular,
} from '@expo-google-fonts/pinyon-script';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from "react";
import { useOrbitStore } from '../lib/store';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'expo-router';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
    const {
        profile,
        partnerProfile,
        couple,
        idToken,
        isNotificationDrawerOpen,
        mediaViewerState,
        loading,
        activeTabIndex
    } = useOrbitStore();


    const pathname = usePathname();
    const router = useRouter();
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

    const [fontsLoaded, fontError] = useFonts({
        Outfit_400Regular,
        Outfit_700Bold,
        CormorantGaramond_300Light,
        CormorantGaramond_400Regular,
        CormorantGaramond_500Medium,
        CormorantGaramond_600SemiBold,
        PinyonScript_400Regular,
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
    const hideDock = pathname === '/login' || !isAuthenticated || isAppLoading;


    return (

        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider value={CustomDarkTheme}>
                <DynamicBackground
                    mode={profile?.wallpaper_mode || 'stars'}
                    customImageUrl={profile?.custom_wallpaper_url}
                    partnerImageUrl={partnerProfile?.custom_wallpaper_url}
                    idToken={idToken}
                    isGrayscale={!!profile?.wallpaper_grayscale}
                    isPaused={isOverlayOpen}
                />
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
                <StatusBar style="light" />
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
