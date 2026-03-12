import { StateCreator } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDailyInsightLocal } from '../cycle';
import { getTodayIST } from '../cycle';
import { AI_CONFIG } from '../aiConfig';

export interface DailyInsight {
    date: string;
    phase: string;
    cycleDay: number;
    insight: string;
    recommendation: string;
    hormoneContext: string;
    source: 'ai' | 'local';
    generatedAt: number;
}

export interface IntimacyIntelligence {
    date: string;
    phase: string;
    // Intimacy & connection
    intimacyTip: string;           // Phase-specific physical intimacy tip
    sexEducation: string;          // Educational fact about sexuality this phase
    bestIntimacyWindows: string;   // Best times/conditions for intimacy
    // Fertility & pregnancy
    pregnancyChance: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Peak';
    pregnancyChancePercent: number;
    fertilityNote: string;         // Explanation of current fertility status
    // Wellbeing predictions
    moodForecast: string;          // Predicted mood for next 3 days
    energyForecast: string;        // Predicted energy level
    // Partner guidance
    partnerIntimacyGuide: string;  // What partner should know about intimacy now
    source: 'ai' | 'local';
}

export interface LunaraOnboardingData {
    lastPeriodDate: string;
    cycleLength: number;
    periodLength: number;
    goals: string[];
    symptoms: string[];
    completed: boolean;
}

export interface LunaraSlice {
    // Onboarding
    lunaraOnboarding: LunaraOnboardingData | null;
    lunaraOnboardingComplete: boolean;
    lunaraOnboardingLoaded: boolean;
    setLunaraOnboarding: (data: LunaraOnboardingData) => void;
    loadLunaraOnboarding: () => Promise<void>;

    // Live phase color (read by NavbarDock to theme the indicator)
    lunaraPhaseColor: string | null;
    setLunaraPhaseColor: (color: string | null) => void;

    // Active Lunara content tab (controlled by NavbarDock, consumed by LunaraScreen)
    lunaraTab: 'today' | 'cycle' | 'body' | 'partner' | 'learn';
    setLunaraTab: (tab: 'today' | 'cycle' | 'body' | 'partner' | 'learn') => void;

    // Daily Insight
    dailyInsight: DailyInsight | null;
    isLoadingInsight: boolean;
    loadDailyInsight: (phase: string, cycleDay: number) => Promise<void>;

    // Intimacy Intelligence (AI-powered per phase)
    intimacyIntel: IntimacyIntelligence | null;
    isLoadingIntimacy: boolean;
    loadIntimacyIntelligence: (phase: string, cycleDay: number, periodHistory: string[]) => Promise<void>;

    // Gemini Forecast (keep for backward compat)
    intimacyForecast: any[];
    lastForecastRefresh: number | null;
    isRefreshingForecast: boolean;
    refreshForecast: (cycleData?: any) => Promise<void>;
    loadForecast: () => Promise<void>;
}

export const createLunaraSlice: StateCreator<LunaraSlice & any> = (set, get) => ({
    // Onboarding
    lunaraOnboarding: null,
    lunaraOnboardingComplete: false,
    lunaraOnboardingLoaded: false,

    // Phase color (written by LunaraScreen, read by NavbarDock)
    lunaraPhaseColor: null,
    setLunaraPhaseColor: (color: string | null) => set({ lunaraPhaseColor: color }),

    // Active content tab — NavbarDock drives this, LunaraScreen consumes
    lunaraTab: 'today' as const,
    setLunaraTab: (tab: 'today' | 'cycle' | 'body' | 'partner' | 'learn') => set({ lunaraTab: tab }),

    loadLunaraOnboarding: async () => {
        try {
            const saved = await AsyncStorage.getItem('orbit_lunara_onboarding');
            if (saved) {
                const data: LunaraOnboardingData = JSON.parse(saved);
                set({ lunaraOnboarding: data, lunaraOnboardingComplete: data.completed });
            }
        } catch (e) {
            console.warn('[LunaraSlice] Failed to load onboarding:', e);
        } finally {
            set({ lunaraOnboardingLoaded: true });
        }
    },

    setLunaraOnboarding: async (data: LunaraOnboardingData) => {
        try {
            await AsyncStorage.setItem('orbit_lunara_onboarding', JSON.stringify(data));
            set({ lunaraOnboarding: data, lunaraOnboardingComplete: data.completed });
        } catch (e) {
            console.warn('[LunaraSlice] Failed to save onboarding:', e);
        }
    },

    // Daily Insight
    dailyInsight: null,
    isLoadingInsight: false,

    // Intimacy Intelligence
    intimacyIntel: null,
    isLoadingIntimacy: false,

    loadIntimacyIntelligence: async (phase: string, cycleDay: number, periodHistory: string[]) => {
        const today = getTodayIST();
        const inMem = get().intimacyIntel;
        if (inMem && inMem.date === today && inMem.phase === phase) return;

        // Local fallback — always immediate
        const LOCAL_INTEL: Record<string, Omit<IntimacyIntelligence, 'date' | 'phase' | 'source'>> = {
            Menstrual: {
                intimacyTip: 'Warmth, closeness, and non-penetrative touch are often most welcome. Orgasms release oxytocin and can relieve cramps — only if she desires.',
                sexEducation: 'Prostaglandins trigger uterine contractions and cramps. Orgasm can actually relax the uterus temporarily, reducing pain for some women.',
                bestIntimacyWindows: 'Later in the period (days 3-5) as flow lightens. Morning is better than evening due to higher energy.',
                pregnancyChance: 'Very Low', pregnancyChancePercent: 1,
                fertilityNote: 'Fertilization is extremely unlikely during menstruation, though sperm can survive 5 days — cycles shorter than 21 days carry a small risk.',
                moodForecast: 'Introversion and rest-seeking. Likely craving comfort, warmth, and emotional safety over stimulation.',
                energyForecast: 'Low → gradually rising by day 4-5. Plan low-energy, cozy activities.',
                partnerIntimacyGuide: 'Ask what she needs — don\'t assume. Gentle massage, warmth, and presence without expectations are the most intimate gifts right now.',
            },
            Follicular: {
                intimacyTip: 'Explore new positions, settings, or conversations about desires — her openness to novelty is biologically heightened this week.',
                sexEducation: 'Rising estrogen increases vaginal lubrication and clitoral sensitivity. Women typically have lower pain thresholds and higher pleasure responses in this phase.',
                bestIntimacyWindows: 'Any time — and especially evenings when the day\'s energy peaks. Her body is primed for exploration.',
                pregnancyChance: 'Low', pregnancyChancePercent: 5,
                fertilityNote: 'Follicles are developing but ovulation hasn\'t occurred yet. Pregnancy chance is low but not zero as ovulation timing can vary.',
                moodForecast: 'Optimistic, social, and curious. Mood will be consistently good — this is her most emotionally stable week.',
                energyForecast: 'Building toward peak. Great week for new physical activities together.',
                partnerIntimacyGuide: 'She\'s open to suggestion and novelty. This is the best time to introduce new experiences, communicate desires, or plan a romantic surprise.',
            },
            Ovulatory: {
                intimacyTip: 'Connection, eye contact, and presence matter as much as the physical. Her desire for deep bonding peaks — seize this 48-hour window.',
                sexEducation: 'LH surge triggers ovulation. Testosterone briefly spikes, driving libido to its monthly peak. The egg is viable for 12-24 hours after release.',
                bestIntimacyWindows: 'The 48 hours around ovulation (days 13-15 in a 28-day cycle) represent the monthly peak in desire, connection, and fertility.',
                pregnancyChance: 'Peak', pregnancyChancePercent: 33,
                fertilityNote: 'This is peak fertility. If trying to conceive, this is the optimal window. If avoiding pregnancy, use protection — this is the highest-risk period.',
                moodForecast: 'Confident, magnetic, expressive. Most likely to feel beautiful and socially engaged. Deep emotional connection feels natural.',
                energyForecast: 'Peak physical and mental energy. Perfect for active intimacy and shared physical experiences.',
                partnerIntimacyGuide: 'She\'s at her biological apex — most confident, most receptive, most desirous of deep connection. Be fully present. This window closes in 24-48 hours.',
            },
            Luteal: {
                intimacyTip: 'Slow, intentional, and deeply emotional intimacy works best. Pressure or expectation will backfire — genuine presence is everything.',
                sexEducation: 'Progesterone\'s sedating effect reduces libido for many women. However, some experience a libido spike just before menstruation as hormones drop sharply.',
                bestIntimacyWindows: 'Early luteal (days 17-20) before PMS symptoms peak. Evenings when progesterone\'s calming effect is strongest can feel unexpectedly connecting.',
                pregnancyChance: 'Low', pregnancyChancePercent: 3,
                fertilityNote: 'The fertile window has closed. Progesterone dominates. If conception occurred, implantation would happen this phase.',
                moodForecast: 'Variable — may oscillate between introspection and irritability. She needs to feel understood, not fixed.',
                energyForecast: 'Declining. Expect need for more sleep, rest, and lower-stimulation environments.',
                partnerIntimacyGuide: 'Patience is the most intimate thing you can offer. Ask "what do you need?" rather than assuming. Physical closeness without agenda — holding, warmth — is often more valued than sex.',
            },
        };

        const localData = LOCAL_INTEL[phase] || LOCAL_INTEL['Follicular'];
        const localIntel: IntimacyIntelligence = {
            date: today, phase, source: 'local', ...localData,
        };
        set({ intimacyIntel: localIntel });

        // AI enhancement in background
        try {
            const debugApiUrl = get().debugApiUrl;
            const API_URL = debugApiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);

            const res = await fetch(`${API_URL}/api/lunara/intimacy-intel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phase, cycleDay,
                    periodHistory: periodHistory.slice(0, 6), // last 6 periods
                    goals: get().lunaraOnboarding?.goals || [],
                    model: AI_CONFIG.LUMARA_MODEL, // Centralized model control
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) return;
            const data = await res.json();
            if (data.intimacyTip) {
                const aiIntel: IntimacyIntelligence = {
                    date: today, phase, source: 'ai',
                    intimacyTip: data.intimacyTip || localData.intimacyTip,
                    sexEducation: data.sexEducation || localData.sexEducation,
                    bestIntimacyWindows: data.bestIntimacyWindows || localData.bestIntimacyWindows,
                    pregnancyChance: data.pregnancyChance || localData.pregnancyChance,
                    pregnancyChancePercent: data.pregnancyChancePercent ?? localData.pregnancyChancePercent,
                    fertilityNote: data.fertilityNote || localData.fertilityNote,
                    moodForecast: data.moodForecast || localData.moodForecast,
                    energyForecast: data.energyForecast || localData.energyForecast,
                    partnerIntimacyGuide: data.partnerIntimacyGuide || localData.partnerIntimacyGuide,
                };
                await AsyncStorage.setItem('orbit_intimacy_intel', JSON.stringify(aiIntel)).catch(() => { });
                set({ intimacyIntel: aiIntel });
            }
        } catch (_) { /* local intel already displayed */ }
    },

    loadDailyInsight: async (phase: string, cycleDay: number) => {
        const today = getTodayIST();

        // ① Check in-memory first (zero cost)
        const inMemory = get().dailyInsight;
        if (inMemory && inMemory.date === today && inMemory.phase === phase) return;

        // ② Check AsyncStorage cache (fast, no network)
        try {
            const cached = await AsyncStorage.getItem('orbit_lunara_daily');
            if (cached) {
                const parsed: DailyInsight = JSON.parse(cached);
                // Valid if: same date AND same phase — serve from cache
                if (parsed.date === today && parsed.phase === phase) {
                    set({ dailyInsight: parsed });
                    return;
                }
            }
        } catch (_) { }

        // ③ Show local fallback immediately so UI never blocks
        const local = getDailyInsightLocal(phase, cycleDay);
        const localInsight: DailyInsight = {
            date: today, phase, cycleDay,
            ...local, source: 'local', generatedAt: Date.now(),
        };
        set({ dailyInsight: localInsight, isLoadingInsight: false });

        // ④ Fetch Gemini in background (non-blocking, doesn't affect render)
        try {
            const debugApiUrl = get().debugApiUrl;
            const API_URL = debugApiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(`${API_URL}/api/lunara/daily-insight`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phase, cycleDay, avgCycleLength: 28,
                    symptoms: get().lunaraOnboarding?.symptoms || [],
                    goals: get().lunaraOnboarding?.goals || [],
                    model: AI_CONFIG.LUMARA_MODEL, // Centralized model control
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) return;
            const data = await res.json();
            if (data.insight && data.recommendation) {
                const aiInsight: DailyInsight = {
                    date: today, phase, cycleDay,
                    insight: data.insight,
                    recommendation: data.recommendation,
                    hormoneContext: data.hormoneContext || local.hormoneContext,
                    source: 'ai',
                    generatedAt: Date.now(),
                };
                // Write to cache so next session is instant
                AsyncStorage.setItem('orbit_lunara_daily', JSON.stringify(aiInsight)).catch(() => { });
                set({ dailyInsight: aiInsight });
            }
        } catch (_) {
            // Local insight already shown — silent fail
        }
    },

    // Legacy Gemini forecast
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
        if (state.lastForecastRefresh && (Date.now() - state.lastForecastRefresh < COOLDOWN)) return;

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
                    cycleData: cycleData || { lastPeriodStart: null, avgCycleLength: 28, periodHistory: [] },
                    model: AI_CONFIG.MOON_MODEL, // Relationship-focused model
                })
            });
            const data = await response.json();
            if (data.forecast) {
                const timestamp = Date.now();
                await AsyncStorage.setItem('orbit_intimacy_forecast', JSON.stringify({ forecast: data.forecast, timestamp }));
                set({ intimacyForecast: data.forecast, lastForecastRefresh: timestamp });
            }
        } catch (error) {
            console.error('Refresh forecast error:', error);
        } finally {
            set({ isRefreshingForecast: false });
        }
    }
});
