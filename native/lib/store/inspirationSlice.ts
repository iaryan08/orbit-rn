import { StateCreator } from 'zustand';
import { AI_CONFIG } from '../aiConfig';
import { getTodayIST } from '../utils';

export interface InspirationContent {
    quote: string;
    challenge: string;
    tip: string;
    updated_at: number;
}

export interface InspirationSlice {
    dailyInspiration: InspirationContent | null;
    isLoadingInspiration: boolean;
    loadDailyInspiration: () => Promise<void>;
}

const DEFAULT_INSPIRATION: InspirationContent = {
    quote: "Love is not a destination we reach, but the quiet rhythm of our shadows walking in perfect sync.",
    challenge: "Write a small note of appreciation and leave it somewhere they'll find it today.",
    tip: "Practicing active listening means hearing the emotions behind the words, not just the words themselves.",
    updated_at: 0
};

export const createInspirationSlice: StateCreator<InspirationSlice & any> = (set, get) => ({
    dailyInspiration: null,
    isLoadingInspiration: false,

    loadDailyInspiration: async () => {
        const today = getTodayIST();
        const { dailyInspiration, profile, partnerProfile } = get();

        // Check if already loaded for today
        if (dailyInspiration && dailyInspiration.updated_at === Date.parse(today)) {
            return;
        }

        set({ isLoadingInspiration: true });

        // Fallback to local data initially
        set({ dailyInspiration: { ...DEFAULT_INSPIRATION, updated_at: Date.parse(today) } });

        try {
            const debugApiUrl = get().debugApiUrl;
            const API_URL = debugApiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';

            const res = await fetch(`${API_URL}/api/moon/inspiration`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: today,
                    userName: profile?.display_name || 'Partner',
                    partnerName: partnerProfile?.display_name || 'them',
                    gender: profile?.gender,
                    model: AI_CONFIG.MOON_MODEL,
                }),
            });

            if (!res.ok) throw new Error('Failed to fetch inspiration');

            const data = await res.json();
            if (data.quote && data.challenge && data.tip) {
                set({
                    dailyInspiration: {
                        quote: data.quote,
                        challenge: data.challenge,
                        tip: data.tip,
                        updated_at: Date.parse(today)
                    }
                });
            }
        } catch (e) {
            console.warn('[InspirationSlice] AI fetch failed, using default:', e);
            // Default is already set above
        } finally {
            set({ isLoadingInspiration: false });
        }
    }
});
