import { StateCreator } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LunaraSlice {
    intimacyForecast: any[];
    lastForecastRefresh: number | null;
    isRefreshingForecast: boolean;
    refreshForecast: (cycleData?: any) => Promise<void>;
    loadForecast: () => Promise<void>;
}

export const createLunaraSlice: StateCreator<LunaraSlice & any> = (set, get) => ({
    intimacyForecast: [],
    lastForecastRefresh: null,
    isRefreshingForecast: false,

    loadForecast: async () => {
        try {
            const saved = await AsyncStorage.getItem('orbit_intimacy_forecast');
            if (saved) {
                const { forecast, timestamp } = JSON.parse(saved);
                set({ intimacyForecast: forecast, lastForecastRefresh: timestamp });
            }
        } catch (e) {
            console.error('Load forecast error', e);
        }
    },

    refreshForecast: async (cycleData?: any) => {
        const state = get();
        if (state.isRefreshingForecast) return;

        const COOLDOWN = 7 * 24 * 60 * 60 * 1000;
        if (state.lastForecastRefresh && (Date.now() - state.lastForecastRefresh < COOLDOWN)) {
            console.log('Gemini Refresh is on cooldown (once per 7 days)');
            return;
        }

        set({ isRefreshingForecast: true });
        try {
            const debugApiUrl = get().debugApiUrl;
            const API_URL = debugApiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';

            const response = await fetch(`${API_URL}/api/lunara/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    moods: state.moods,
                    memories: state.memories,
                    cycleData: cycleData || {
                        lastPeriodStart: null,
                        avgCycleLength: 28,
                        periodHistory: []
                    }
                })
            });

            const text = await response.text();
            if (!text) throw new Error('Empty response from server');

            const data = JSON.parse(text);
            if (data.forecast) {
                const timestamp = Date.now();
                await AsyncStorage.setItem('orbit_intimacy_forecast', JSON.stringify({
                    forecast: data.forecast,
                    timestamp
                }));
                set({ intimacyForecast: data.forecast, lastForecastRefresh: timestamp });
            }
        } catch (error) {
            console.error('Refresh forecast error:', error);
        } finally {
            set({ isRefreshingForecast: false });
        }
    }
});
