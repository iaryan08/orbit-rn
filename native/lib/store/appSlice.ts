import { StateCreator } from 'zustand';
import { makeMutable } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const WALLPAPER_DIRTY_LOCK_MS = 12000;

export interface AppSlice {
    activeTabIndex: number;
    navigationSource: 'swipe' | 'tap';
    setTabIndex: (index: number, source?: 'swipe' | 'tap') => void;
    scrollOffset: any;
    setScrollOffset: (val: number) => void;
    isPagerScrollEnabled: boolean;
    setPagerScrollEnabled: (enabled: boolean) => void;
    isNotificationDrawerOpen: boolean;
    setNotificationDrawerOpen: (open: boolean) => void;
    isMoodDrawerOpen: boolean;
    isMoodHistoryOpen: boolean;
    setMoodHistoryOpen: (open: boolean) => void;
    setMoodDrawerOpen: (open: boolean) => void;
    appMode: 'moon' | 'lunara';
    setAppMode: (mode: 'moon' | 'lunara') => void;
    toggleAppMode: () => void;
    initAppMode: () => Promise<void>;
    wallpaperConfig: {
        mode: 'stars' | 'custom' | 'shared';
        grayscale: boolean;
        aesthetic: 'Natural' | 'Glass' | 'Ethereal' | 'Obsidian' | 'Cinema';
    };
    wallpaperConfigDirtyUntil: number;
    setWallpaperConfig: (config: Partial<AppSlice['wallpaperConfig']>) => void;
    isSearchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    mediaViewerState: {
        isOpen: boolean;
        imageUrls: string[];
        initialIndex: number;
        ownerId?: string;
        mediaId?: string;
        type?: 'memory' | 'polaroid';
    };
    openMediaViewer: (imageUrls: string[], initialIndex?: number, ownerId?: string, mediaId?: string, type?: 'memory' | 'polaroid') => void;
    closeMediaViewer: () => void;
    isLiteMode: boolean;
    toggleLiteMode: () => void;
    cinemaQuality: '360p' | '720p' | '1080p';
    setCinemaQuality: (quality: '360p' | '720p' | '1080p') => void;
    settingsTargetTab: 'profile' | 'couple' | 'lunara' | 'atmosphere' | 'security' | 'updates';
    setSettingsTargetTab: (tab: 'profile' | 'couple' | 'lunara' | 'atmosphere' | 'security' | 'updates') => void;
    debugApiUrl: string | null;
    setDebugApiUrl: (url: string | null) => void;
    isAppLockEnabled: boolean;
    setAppLockEnabled: (enabled: boolean) => void;
    isBiometricEnabled: boolean;
    setBiometricEnabled: (enabled: boolean) => void;
    appPinCode: string | null;
    setAppPinCode: (pin: string | null) => void;
    isDebugMode: boolean;
    toggleDebugMode: () => void;
}


export const createAppSlice: StateCreator<AppSlice> = (set, get) => ({
    scrollOffset: makeMutable(1),
    setScrollOffset: (val: number) => {
        const state = get();
        if (state.scrollOffset) {
            state.scrollOffset.value = val;
        }
    },
    isPagerScrollEnabled: true,
    isNotificationDrawerOpen: false,
    isMoodDrawerOpen: false,
    isMoodHistoryOpen: false,
    appMode: 'moon',
    wallpaperConfig: {
        mode: 'stars',
        grayscale: false,
        aesthetic: 'Natural',
    },
    wallpaperConfigDirtyUntil: 0,
    isSearchOpen: false,
    mediaViewerState: {
        isOpen: false,
        imageUrls: [],
        initialIndex: 0,
    },
    isLiteMode: false,
    cinemaQuality: '1080p',
    settingsTargetTab: 'profile',
    debugApiUrl: null,
    isAppLockEnabled: false,
    isBiometricEnabled: false,
    appPinCode: null,
    isDebugMode: false,

    activeTabIndex: 1,
    navigationSource: 'swipe',
    setTabIndex: (index: number, source: 'swipe' | 'tap' = 'swipe') => {
        set({ activeTabIndex: index, navigationSource: source });
    },
    setNotificationDrawerOpen: (open: boolean) => set({ isNotificationDrawerOpen: open }),
    setMoodDrawerOpen: (open: boolean) => set({ isMoodDrawerOpen: open }),
    setMoodHistoryOpen: (open: boolean) => set({ isMoodHistoryOpen: open }),
    setAppMode: (mode: 'moon' | 'lunara') => {
        AsyncStorage.setItem('orbit_app_mode', mode).catch(console.error);
        set({ appMode: mode });
    },
    toggleAppMode: () => set((state) => {
        const newMode = state.appMode === 'moon' ? 'lunara' : 'moon';
        AsyncStorage.setItem('orbit_app_mode', newMode).catch(console.error);
        return { appMode: newMode };
    }),
    initAppMode: async () => {
        try {
            const { totalMemory } = await import('expo-device');
            const ramGB = (totalMemory || 8000000000) / (1024 * 1024 * 1024);
            const isLowEnd = ramGB < 6;

            const savedMode = await AsyncStorage.getItem('orbit_app_mode');
            const savedQuality = await AsyncStorage.getItem('cinema_quality') as any;
            const savedLiteMode = await AsyncStorage.getItem('orbit_lite_mode');
            const savedDebugApiUrl = await AsyncStorage.getItem('orbit_debug_api_url');
            const savedAppLock = await AsyncStorage.getItem('orbit_app_lock');
            const savedWallpaperRaw = await AsyncStorage.getItem('orbit_wallpaper_config');

            if (savedWallpaperRaw) {
                try {
                    const parsed = JSON.parse(savedWallpaperRaw) as Partial<AppSlice['wallpaperConfig']>;
                    const nextWallpaper = {
                        mode: parsed.mode === 'custom' || parsed.mode === 'shared' ? parsed.mode : 'stars',
                        grayscale: !!parsed.grayscale,
                        aesthetic: (parsed.aesthetic === 'Glass' || parsed.aesthetic === 'Ethereal' || parsed.aesthetic === 'Obsidian' || parsed.aesthetic === 'Cinema')
                            ? parsed.aesthetic
                            : 'Natural',
                    } as AppSlice['wallpaperConfig'];
                    set({ wallpaperConfig: nextWallpaper });
                } catch { }
            }

            set({
                appMode: 'moon',
                activeTabIndex: 1,
                isLiteMode: savedLiteMode ? savedLiteMode === 'true' : isLowEnd,
                cinemaQuality: savedQuality || (isLowEnd ? '720p' : '1080p')
            });

            if (savedDebugApiUrl) {
                set({ debugApiUrl: savedDebugApiUrl });
            }
            if (savedAppLock === 'true') {
                set({ isAppLockEnabled: true });
            }
            const savedBiometric = await AsyncStorage.getItem('orbit_biometric_enabled');
            if (savedBiometric === 'true') {
                set({ isBiometricEnabled: true });
            }
            const savedPin = await AsyncStorage.getItem('orbit_app_pin');
            if (savedPin) {
                set({ appPinCode: savedPin });
            }
        } catch (e) {
            console.error("Failed to load app settings", e);
            set({ appMode: 'moon', activeTabIndex: 1 });
        }
    },
    setWallpaperConfig: (config) => set((state) => {
        const nextConfig = { ...state.wallpaperConfig, ...config };
        AsyncStorage.setItem('orbit_wallpaper_config', JSON.stringify(nextConfig)).catch(console.error);
        return {
            wallpaperConfig: nextConfig,
            wallpaperConfigDirtyUntil: Date.now() + WALLPAPER_DIRTY_LOCK_MS,
        };
    }),
    setSearchOpen: (open: boolean) => set({ isSearchOpen: open }),
    setPagerScrollEnabled: (enabled: boolean) => set({ isPagerScrollEnabled: enabled }),
    openMediaViewer: (imageUrls, initialIndex = 0, ownerId, mediaId, type) => set({
        mediaViewerState: { isOpen: true, imageUrls, initialIndex, ownerId, mediaId, type }
    }),
    closeMediaViewer: () => set({ mediaViewerState: { isOpen: false, imageUrls: [], initialIndex: 0, ownerId: undefined, mediaId: undefined, type: undefined } }),
    toggleLiteMode: () => {
        const next = !get().isLiteMode;
        set({ isLiteMode: next });
        AsyncStorage.setItem('orbit_lite_mode', next ? 'true' : 'false').catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    setCinemaQuality: (quality) => {
        set({ cinemaQuality: quality });
        AsyncStorage.setItem('cinema_quality', quality).catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    setSettingsTargetTab: (tab) => set({ settingsTargetTab: tab }),
    setDebugApiUrl: (url) => {
        set({ debugApiUrl: url });
        if (url) {
            AsyncStorage.setItem('orbit_debug_api_url', url).catch(console.error);
        } else {
            AsyncStorage.removeItem('orbit_debug_api_url').catch(console.error);
        }
    },
    setAppLockEnabled: (enabled: boolean) => {
        set({ isAppLockEnabled: enabled });
        AsyncStorage.setItem('orbit_app_lock', enabled ? 'true' : 'false').catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    setBiometricEnabled: (enabled: boolean) => {
        set({ isBiometricEnabled: enabled });
        AsyncStorage.setItem('orbit_biometric_enabled', enabled ? 'true' : 'false').catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    setAppPinCode: (pin: string | null) => {
        set({ appPinCode: pin });
        if (pin) {
            AsyncStorage.setItem('orbit_app_pin', pin).catch(console.error);
        } else {
            AsyncStorage.removeItem('orbit_app_pin').catch(console.error);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    toggleDebugMode: () => {
        const next = !get().isDebugMode;
        set({ isDebugMode: next });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },
});
