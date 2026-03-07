import { create } from 'zustand'

function shouldPrefixMemoryPath(value: unknown) {
    if (typeof value !== 'string') return false;
    const path = value.trim();
    if (!path) return false;
    if (/^https?:\/\//i.test(path)) return false;
    if (path.startsWith('/')) return false;
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('file:')) return false;
    if (path.includes('/api/media/view/')) return false;
    // Legacy/bare filenames like "177248171857-5fpkv.webp"
    return !path.includes('/');
}

function normalizeMemoryRecord(memory: any, fallbackCoupleId?: string | null) {
    if (!memory || typeof memory !== 'object') return memory;
    const coupleId = String(memory.couple_id || fallbackCoupleId || '').trim();
    if (!coupleId || !Array.isArray(memory.image_urls)) return memory;

    let changed = false;
    const normalized = memory.image_urls.map((url: unknown) => {
        if (!shouldPrefixMemoryPath(url)) return url;
        changed = true;
        return `${coupleId}/${String(url).trim()}`;
    });

    if (!changed) return memory;
    return { ...memory, image_urls: normalized };
}

export interface OrbitState {
    isInitialized: boolean;

    profile: any | null;
    partnerProfile: any | null;
    couple: any | null;

    // Feature Data
    memories: any[];
    letters: any[];
    bucketList: any[];
    milestones: Record<string, any>;
    insights: any[];
    polaroids: { userPolaroid: any | null; partnerPolaroid: any | null };
    doodle: any | null;

    // Dashboard Specific
    userTodayMoods: any[];
    partnerTodayMoods: any[];
    memoriesCount: number;
    lettersCount: number;
    unreadMemoriesCount: number;
    unreadLettersCount: number;
    userCycle: any | null;
    partnerCycle: any | null;
    cycleLogs: any[];
    supportLogs: any[];

    // Pinned Content
    pinnedMemoryIds: string[];
    pinnedLetterIds: string[];

    // Sync Tracking (Global to survive remounts)
    lastFullSyncAt: number;
    lastDeltaSyncs: Record<string, number>;
    currentDateIST: string;
    wsConnected: boolean;
    hasE2EEKey: boolean;
    // Optimistic lock: timestamp of last optimistic polaroid update
    lastPolaroidOptimisticAt: number;

    // Actions
    setInitialized: (val: boolean) => void;
    setCoreData: (data: Partial<OrbitState>) => void;
    setWsConnected: (val: boolean) => void;
    setHasE2EEKey: (val: boolean) => void;

    // Realtime Optimistic Updates
    upsertMemory: (memory: any) => void;
    deleteMemory: (id: string) => void;

    upsertLetter: (letter: any) => void;
    deleteLetter: (id: string) => void;

    setPinnedIds: (itemType: 'memory' | 'letter', ids: string[]) => void;

    upsertMood: (mood: any) => void;
    deleteMood: (id: string) => void;

    upsertMilestone: (milestone: any) => void;

    upsertCycleLog: (log: any) => void;
    upsertSupportLog: (log: any) => void;

    updatePolaroid: (userId: string, targetUserId: string, polaroid: any) => void;
    updateDoodle: (doodle: any) => void;

    upsertBucketItem: (item: any) => void;
    deleteBucketItem: (id: string) => void;

    setCounts: (counts: { memoriesCount?: number, lettersCount?: number }) => void;
    getPartnerDisplayName: () => string;
}

export const useOrbitStore = create<OrbitState>((set, get) => ({
    isInitialized: false,

    profile: null,
    partnerProfile: null,
    couple: null,

    memories: [],
    letters: [],
    bucketList: [],
    milestones: {},
    insights: [],
    polaroids: { userPolaroid: null, partnerPolaroid: null },
    doodle: null,

    userTodayMoods: [],
    partnerTodayMoods: [],
    memoriesCount: 0,
    lettersCount: 0,
    unreadMemoriesCount: 0,
    unreadLettersCount: 0,
    userCycle: null,
    partnerCycle: null,
    cycleLogs: [],
    supportLogs: [],

    pinnedMemoryIds: [],
    pinnedLetterIds: [],

    lastFullSyncAt: 0,
    lastDeltaSyncs: {},
    currentDateIST: "",
    wsConnected: false,
    hasE2EEKey: false,
    lastPolaroidOptimisticAt: 0,

    setInitialized: (val) => set({ isInitialized: val }),

    setCoreData: (data) => set((state) => {
        const next: Partial<OrbitState> = { ...data };
        if (Array.isArray((next as any).memories)) {
            const fallbackCoupleId =
                (next as any)?.coupleId ||
                (next as any)?.profile?.couple_id ||
                state.profile?.couple_id ||
                null;
            (next as any).memories = ((next as any).memories as any[]).map((memory) =>
                normalizeMemoryRecord(memory, fallbackCoupleId)
            );
        }
        if ((next as any).lastDeltaSyncs) {
            (next as any).lastDeltaSyncs = {
                ...state.lastDeltaSyncs,
                ...(next as any).lastDeltaSyncs
            };
        }
        // Optimistic lock: don't overwrite polaroids from a sync if an optimistic
        // update happened in the last 15 seconds (prevents vanishing polaroid after upload)
        const OPTIMISTIC_LOCK_MS = 15_000;
        if ((next as any).polaroids && Date.now() - state.lastPolaroidOptimisticAt < OPTIMISTIC_LOCK_MS) {
            delete (next as any).polaroids;
        }
        return { ...state, ...next };
    }),

    setWsConnected: (val) => set({ wsConnected: val }),
    setHasE2EEKey: (val) => set({ hasE2EEKey: val }),

    upsertMemory: (memory) => set((state) => {
        const normalizedMemory = normalizeMemoryRecord(memory, state.profile?.couple_id || null);
        const index = state.memories.findIndex(m => m.id === normalizedMemory.id);
        let newMemories = [...state.memories];
        if (index > -1) newMemories[index] = { ...newMemories[index], ...normalizedMemory };
        else newMemories.unshift(normalizedMemory);
        // Sort safely falling back to created_at if memory_date is null
        newMemories = newMemories.sort((a, b) => new Date(b.memory_date || b.created_at).getTime() - new Date(a.memory_date || a.created_at).getTime());
        // Enforce cap - upped to 150 for deeper pagination
        if (newMemories.length > 150) newMemories = newMemories.slice(0, 150);
        const isNew = index === -1;
        return {
            memories: newMemories,
            memoriesCount: isNew ? (state.memoriesCount + 1) : state.memoriesCount
        };
    }),

    deleteMemory: (id) => set((state) => ({ memories: state.memories.filter(m => m.id !== id) })),

    upsertLetter: (letter) => set((state) => {
        const index = state.letters.findIndex(l => l.id === letter.id);
        let newLetters = [...state.letters];
        if (index > -1) newLetters[index] = { ...newLetters[index], ...letter };
        else newLetters.unshift(letter);
        newLetters = newLetters.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        // Enforce cap - upped to 150 for deeper pagination
        if (newLetters.length > 150) newLetters = newLetters.slice(0, 150);
        const isNew = index === -1;
        return {
            letters: newLetters,
            lettersCount: isNew ? (state.lettersCount + 1) : state.lettersCount
        };
    }),

    deleteLetter: (id) => set((state) => ({ letters: state.letters.filter(l => l.id !== id) })),

    setPinnedIds: (itemType, ids) => set((state) => ({
        [itemType === 'memory' ? 'pinnedMemoryIds' : 'pinnedLetterIds']: ids
    })),

    upsertMood: (mood) => set((state) => {
        const isPartner = mood.user_id === state.partnerProfile?.id;
        const listName = isPartner ? 'partnerTodayMoods' : 'userTodayMoods';
        const list = [...state[listName]];
        const index = list.findIndex(m => m.id === mood.id);
        if (index > -1) list[index] = { ...list[index], ...mood };
        else list.unshift(mood);
        const rolling24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
        const filtered = list.filter((m: any) => new Date(m.created_at).getTime() >= rolling24hStart);
        return { [listName]: filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) }
    }),

    deleteMood: (id) => set((state) => ({
        userTodayMoods: state.userTodayMoods.filter(m => m.id !== id),
        partnerTodayMoods: state.partnerTodayMoods.filter(m => m.id !== id)
    })),

    upsertMilestone: (milestone) => set((state) => ({
        milestones: { ...state.milestones, [milestone.category]: milestone }
    })),

    upsertCycleLog: (log) => set((state) => {
        const index = state.cycleLogs.findIndex(l => l.id === log.id);
        const newList = [...state.cycleLogs];
        if (index > -1) newList[index] = { ...newList[index], ...log };
        else newList.unshift(log);
        return { cycleLogs: newList.sort((a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()).slice(0, 30) };
    }),

    upsertSupportLog: (log) => set((state) => {
        const index = state.supportLogs.findIndex(l => l.id === log.id);
        const newList = [...state.supportLogs];
        if (index > -1) newList[index] = { ...newList[index], ...log };
        else newList.unshift(log);
        return { supportLogs: newList.sort((a, b) => new Date(b.created_at || b.log_date).getTime() - new Date(a.created_at || a.log_date).getTime()).slice(0, 30) };
    }),

    updatePolaroid: (userId, targetUserId, polaroid) => set((state) => {
        const isUser = userId === targetUserId;
        return {
            polaroids: {
                ...state.polaroids,
                [isUser ? 'userPolaroid' : 'partnerPolaroid']: polaroid
            },
            lastPolaroidOptimisticAt: Date.now(), // lock consolidated sync for 15s
        };
    }),

    updateDoodle: (doodle) => set({ doodle }),

    upsertBucketItem: (item) => set((state) => {
        const index = state.bucketList.findIndex(i => i.id === item.id);
        const next = [...state.bucketList];
        if (index > -1) next[index] = { ...next[index], ...item };
        else next.unshift(item);
        return { bucketList: next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) };
    }),

    deleteBucketItem: (id) => set((state) => ({ bucketList: state.bucketList.filter(i => i.id !== id) })),

    setCounts: (counts) => set((state) => ({ ...state, ...counts })),
    getPartnerDisplayName: () => {
        const state = get();
        if (state.profile?.partner_nickname) return state.profile.partner_nickname;
        return state.partnerProfile?.display_name || 'Partner';
    },
}));
