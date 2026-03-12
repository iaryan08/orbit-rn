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

export interface PartnerIntel {
    date: string;
    phase: string;
    viewerGender: 'male' | 'female';
    headline: string;       // One-line summary of what to know today
    primaryAdvice: string;  // Main personalized guidance text
    microActions: { emoji: string; title: string; desc: string }[];
    intimacyNote: string;   // Specific to the day's energy level
    source: 'ai' | 'local';
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

    // Partner Intelligence (AI-generated, gender-aware, daily cached)
    partnerIntel: PartnerIntel | null;
    isLoadingPartnerIntel: boolean;
    loadPartnerIntelligence: (phase: string, cycleDay: number, viewerGender: 'male' | 'female', partnerName: string) => Promise<void>;

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

    // Partner Intel
    partnerIntel: null,
    isLoadingPartnerIntel: false,

    loadPartnerIntelligence: async (phase: string, cycleDay: number, viewerGender: 'male' | 'female', partnerName: string) => {
        const today = getTodayIST();
        const existing = (get() as any).partnerIntel as PartnerIntel | null;
        // Return immediately if cached for today + same gender + same phase
        if (existing && existing.date === today && existing.phase === phase && existing.viewerGender === viewerGender) return;

        // Local fallback data — renders instantly
        const LOCAL_PARTNER: Record<string, Record<'male' | 'female', Omit<PartnerIntel, 'date' | 'phase' | 'viewerGender' | 'source'>>> = {
            Menstrual: {
                male: {
                    headline: `${partnerName}'s body is resting — be the calm.`,
                    primaryAdvice: `She's bleeding and her energy is lowest right now. The most intimate thing you can offer isn't physical — it's a warm, unhurried presence. Don't suggest plans or activities. Just be there.`,
                    microActions: [
                        { emoji: '🍵', title: 'Bring warmth', desc: 'Heating pad or warm tea goes further than any words' },
                        { emoji: '💬', title: 'Ask once, then follow', desc: '"What do you need right now?" — then do exactly that' },
                        { emoji: '🏡', title: 'Skip the big plans', desc: 'Cancel if possible, reschedule without guilt' },
                    ],
                    intimacyNote: 'Orgasm releases oxytocin and can ease cramps — but only if she initiates. Never pressure.',
                },
                female: {
                    headline: 'Your body is doing the hardest work of the month.',
                    primaryAdvice: 'This is a rest phase. Protect your energy fiercely. Communicate your needs directly to your partner — he cannot read your body the way you can.',
                    microActions: [
                        { emoji: '🛡️', title: 'Ask for what you need', desc: 'Warmth, silence, or closeness — name it clearly' },
                        { emoji: '🪷', title: 'No guilt about saying no', desc: 'Your body is working. Rest is productive' },
                        { emoji: '🌊', title: 'Honor the rhythm', desc: 'Track how you feel each day this phase' },
                    ],
                    intimacyNote: 'If you feel desire, trust it. Orgasm can temporarily relieve cramps via oxytocin release.',
                },
            },
            Follicular: {
                male: {
                    headline: `${partnerName}'s confidence is rising — match her energy.`,
                    primaryAdvice: `Estrogen is climbing and she's at her most open to new things. This is the best week to suggest adventures, have important conversations, or plan something she's mentioned wanting. Her communication is clear and her mood stable.`,
                    microActions: [
                        { emoji: '✨', title: 'Plan something new', desc: 'New restaurant, activity, or experience she mentioned' },
                        { emoji: '🧠', title: 'Have the important talk', desc: 'Her cognition and emotional stability are at peak' },
                        { emoji: '💃', title: 'Be spontaneous', desc: 'Surprise her — it lands exceptionally well this week' },
                    ],
                    intimacyNote: 'Her body is primed for exploration. She appreciates novelty and boldness now more than any other phase.',
                },
                female: {
                    headline: 'Your energy and confidence are blooming.',
                    primaryAdvice: "Estrogen's rise is giving you clarity, social energy, and optimism. Use this window for the things that require your sharpest self — conversations, plans, and new experiences.",
                    microActions: [
                        { emoji: '🌱', title: 'Start the new thing', desc: 'Gym habit, creative project, or difficult conversation' },
                        { emoji: '💫', title: 'Mirror affirmation', desc: 'Find 3 things you love about your reflection today' },
                        { emoji: '📍', title: 'Plan with your partner', desc: 'Your communication is at its most effective right now' },
                    ],
                    intimacyNote: 'Rising estrogen increases sensitivity and lubrication. Your body is ready to explore.',
                },
            },
            Ovulatory: {
                male: {
                    headline: `${partnerName} is at her peak — 48-hour window.`,
                    primaryAdvice: 'LH surge has triggered ovulation. Her testosterone briefly spikes, driving libido to its monthly peak. She is at her most magnetic, social, and deeply desirous of genuine connection — not just physical. Eye contact and presence are as important as any gesture.',
                    microActions: [
                        { emoji: '🌟', title: 'Plan a date out', desc: 'She is at her social peak — go somewhere together' },
                        { emoji: '👁️', title: 'Be fully present', desc: 'Put the phone down. She notices absolutely everything' },
                        { emoji: '💫', title: 'Say what you feel', desc: 'Genuine compliments and vulnerability land deeply now' },
                    ],
                    intimacyNote: 'Peak fertility window. Use protection if avoiding pregnancy. This is the 48-hour peak of her monthly desire cycle.',
                },
                female: {
                    headline: 'You are at your biological apex today.',
                    primaryAdvice: "You're radiating. Your confidence, social magnetism, and desire for deep connection are at their monthly peak. Lean into it — this window is 48 hours. Use it for connection, bold moves, and things that require your full energy.",
                    microActions: [
                        { emoji: '🔥', title: 'Lead the way', desc: 'Suggest the plans — he will follow your magnetic lead' },
                        { emoji: '🌹', title: 'Dress for yourself', desc: 'Your self-image is at its highest — honor that' },
                        { emoji: '💎', title: 'Express your desires', desc: 'Your communication is boldest. Say what you want' },
                    ],
                    intimacyNote: 'Peak fertility. If trying to conceive, this is the optimal window. You will likely feel desire more strongly than any other day.',
                },
            },
            Luteal: {
                male: {
                    headline: `${partnerName} needs steadiness — not solutions.`,
                    primaryAdvice: 'Progesterone dominates and her nervous system is more sensitive. She may oscillate between introspection and irritability. The single most important thing: do not problem-solve when she vents. Listen, validate, then ask what she needs.',
                    microActions: [
                        { emoji: '⚓', title: 'Be the anchor', desc: 'Your calmness is her regulation. Stay steady' },
                        { emoji: '👂', title: 'Listen — don\'t fix', desc: '"That sounds really hard" beats any solution' },
                        { emoji: '🎬', title: 'Low-key quality time', desc: 'Movies, cooking together, quiet walks beat loud nights' },
                    ],
                    intimacyNote: 'Drive may be low, but emotional closeness matters more than ever. Non-sexual physical touch — holding, warmth — is often more valued.',
                },
                female: {
                    headline: 'Honor your sensitivity — it is not weakness.',
                    primaryAdvice: "Progesterone's sedating effect is real. Your energy is declining and your emotional sensitivity elevated. This isn't a flaw — it's biological. Communicate your needs clearly to your partner and protect your sleep ruthlessly.",
                    microActions: [
                        { emoji: '🌙', title: 'Prioritize sleep', desc: 'Your body needs 30-60 min more sleep than usual' },
                        { emoji: '⚓', title: 'Name what you feel', desc: 'Tell him "I need quiet" or "I need to be held"' },
                        { emoji: '🛁', title: 'Self-care ritual', desc: 'Magnesium, warmth, and low stimulation work best now' },
                    ],
                    intimacyNote: 'If drive dips, sensual touch without pressure is often more connecting than full intimacy. Honor your rhythm.',
                },
            },
        };

        const localData = LOCAL_PARTNER[phase]?.[viewerGender] || LOCAL_PARTNER['Follicular'][viewerGender];
        const localIntel: PartnerIntel = {
            date: today, phase, viewerGender, source: 'local', ...localData,
        };
        set({ partnerIntel: localIntel });

        // Background AI enhancement — same pattern as intimacyIntel
        try {
            const debugApiUrl = (get() as any).debugApiUrl;
            const API_URL = debugApiUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(`${API_URL}/api/lunara/partner-intel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phase, cycleDay, viewerGender, partnerName, model: AI_CONFIG.LUMARA_MODEL }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) return;
            const data = await res.json();
            if (data.headline && data.primaryAdvice) {
                const aiIntel: PartnerIntel = {
                    date: today, phase, viewerGender, source: 'ai',
                    headline: data.headline,
                    primaryAdvice: data.primaryAdvice,
                    microActions: data.microActions || localData.microActions,
                    intimacyNote: data.intimacyNote || localData.intimacyNote,
                };
                await AsyncStorage.setItem(`orbit_partner_intel_${viewerGender}_${phase}`, JSON.stringify(aiIntel)).catch(() => { });
                set({ partnerIntel: aiIntel });
            }
        } catch (_) { /* local intel already shown */ }
    },

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
