import { StateCreator } from 'zustand';
import { makeMutable } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

export interface AppSlice {
    activeTabIndex: number;
    setTabIndex: (index: number) => void;
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
        filter: 'Natural' | 'Glass' | 'Tint' | 'Pro';
    };
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
}

let lastTabChangeTime = 0;

export const createAppSlice: StateCreator<AppSlice> = (set, get) => ({
    activeTabIndex: 1,
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
        filter: 'Natural',
    },
    isSearchOpen: false,
    mediaViewerState: {
        isOpen: false,
        imageUrls: [],
        initialIndex: 0,
    },
    isLiteMode: false,
    cinemaQuality: '1080p',

    setTabIndex: (index: number) => {
        const now = Date.now();
        if (now - lastTabChangeTime < 300) return;
        lastTabChangeTime = now;
        set({ activeTabIndex: index });
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

            if (savedMode === 'lunara') {
                set({ appMode: 'lunara', activeTabIndex: 5 }); // Updated index
            } else {
                set({ appMode: 'moon', activeTabIndex: 1 });
            }

            if (savedQuality) {
                set({ cinemaQuality: savedQuality });
            }
        } catch (e) {
            console.error("Failed to load app settings", e);
            set({ appMode: 'moon', activeTabIndex: 1 });
        }
    },
    setWallpaperConfig: (config) => set((state) => ({
        wallpaperConfig: { ...state.wallpaperConfig, ...config }
    })),
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
});
