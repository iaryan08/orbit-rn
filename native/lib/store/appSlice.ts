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
    settingsTargetTab: 'profile' | 'couple' | 'atmosphere' | 'security' | 'updates';
    setSettingsTargetTab: (tab: 'profile' | 'couple' | 'atmosphere' | 'security' | 'updates') => void;
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

    activeTabIndex: 1,
    navigationSource: 'swipe',
    setTabIndex: (index: number, source: 'swipe' | 'tap' = 'swipe') => {
        set({ activeTabIndex: index, navigationSource: source });
    },
    setNotificationDrawerOpen: (open: boolean) => set({ isNotificationDrawerOpen: open }),
    setMoodDrawerOpen: (open: boolean) => set({ isMoodDrawerOpen: open }),
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
            const savedMode = await AsyncStorage.getItem('orbit_app_mode');
            const savedQuality = await AsyncStorage.getItem('cinema_quality') as any;
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

            // Keep it simple: Always land on Moon Mode / Dashboard (Index 1) on startup
            set({ appMode: 'moon', activeTabIndex: 1 });

            if (savedQuality) {
                set({ cinemaQuality: savedQuality });
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
        AsyncStorage.setItem('lite_mode', JSON.stringify(next)).catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    setCinemaQuality: (quality) => {
        set({ cinemaQuality: quality });
        AsyncStorage.setItem('cinema_quality', quality).catch(console.error);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    setSettingsTargetTab: (tab) => set({ settingsTargetTab: tab }),
});
