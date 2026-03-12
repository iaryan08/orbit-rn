import { StateCreator } from 'zustand';
import { MemoryData, PolaroidData, LetterData, MoodData, BucketItem } from './types';
import { db, auth, rtdb } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, onSnapshot, Unsubscribe, Timestamp, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { repository } from '../repository';
import { getTodayIST } from '../utils';
import { memories as memoriesTable, letters as lettersTable, moods as moodsTable, bucketList as bucketTable, polaroids as polaroidsTable } from '../db/schema';
import { triggerMirroring } from '../MirrorService';
import * as Haptics from 'expo-haptics';
import { AuthSlice, strip } from './authSlice';

// Advanced Merge: Updates state only for changed items, maintaining reference stability
const mergeCollections = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
    if (strip(current) === strip(incoming)) return current;

    const currentMap = new Map(current.map(i => [i.id, i]));
    const result: T[] = [];
    let hasChanged = current.length !== incoming.length;

    for (const newItem of incoming) {
        const existing = currentMap.get(newItem.id);
        if (existing) {
            if (strip(existing) !== strip(newItem)) {
                result.push({ ...existing, ...newItem });
                hasChanged = true;
            } else {
                result.push(existing);
            }
        } else {
            result.push(newItem);
            hasChanged = true;
        }
    }

    return hasChanged ? result : current;
};

const getComparableTimestamp = (value: any): number => {
    if (typeof value === 'number') return value;
    if (value?.toMillis && typeof value.toMillis === 'function') return value.toMillis();
    if (value?.seconds && typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const collapseLatestMoods = (items: MoodData[]): MoodData[] => {
    const latestBySlot = new Map<string, MoodData>();
    for (const item of items) {
        const slotKey = `${item.user_id || 'unknown'}_${item.mood_date || 'unknown'}`;
        const existing = latestBySlot.get(slotKey);
        if (!existing) {
            latestBySlot.set(slotKey, item);
            continue;
        }
        const existingStamp = Math.max(
            getComparableTimestamp((existing as any).updated_at),
            getComparableTimestamp(existing.created_at)
        );
        const nextStamp = Math.max(
            getComparableTimestamp((item as any).updated_at),
            getComparableTimestamp(item.created_at)
        );
        if (nextStamp >= existingStamp) {
            latestBySlot.set(slotKey, item);
        }
    }

    return Array.from(latestBySlot.values()).sort((a, b) => {
        const aStamp = Math.max(
            getComparableTimestamp((a as any).updated_at),
            getComparableTimestamp(a.created_at)
        );
        const bStamp = Math.max(
            getComparableTimestamp((b as any).updated_at),
            getComparableTimestamp(b.created_at)
        );
        return bStamp - aStamp;
    });
};

const resolveCoupleId = (state: any): string | null =>
    state.couple?.id || state.profile?.couple_id || state.activeCoupleId || null;

export interface DataSlice {
    memories: MemoryData[]
    polaroids: PolaroidData[]
    letters: LetterData[]
    moods: MoodData[]
    bucketList: BucketItem[]
    musicState: any | null
    notifications: any[]
    milestones: Record<string, any>
    cycleLogs: Record<string, any>
    loading: boolean
    isSyncing: boolean
    profile: any | null
    partnerProfile: any | null
    couple: any | null
    fetchData: (userId: string) => () => void
    syncNow: () => Promise<void>
    updateBucketItemOptimistic: (id: string, isCompleted: boolean) => void
    updateLetterReadOptimistic: (id: string, isRead: boolean) => void
    logSymptomsOptimistic: (userId: string, symptoms: string[]) => void
    addBucketItemOptimistic: (title: string, isPrivate?: boolean) => void
    addPolaroidOptimistic: (imageUrl: string, caption: string | null) => void
    deleteBucketItemOptimistic: (id: string) => void
    logSexDriveOptimistic: (userId: string, level: string) => void
    submitMoodOptimistic: (userId: string, emoji: string, note?: string) => void
    clearMoodOptimistic: (userId: string) => void
    deleteMemoryOptimistic: (memory: MemoryData) => void
    sendLetterOptimistic: (letter: Partial<LetterData>) => Promise<void>
    addMemoryOptimistic: (memory: Partial<MemoryData>) => Promise<void>
    sendHeartbeatOptimistic: () => void
    resetData: () => void,
    runJanitor: () => Promise<void>,
    activeUnsubs: Unsubscribe[],
    activeCoupleUnsubs: Unsubscribe[],
    activeCoupleId: string | null,
    activePartnerId: string | null,
    fetchingUserId: string | null
}

export const createDataSlice: StateCreator<DataSlice & any> = (set, get) => ({
    memories: [],
    polaroids: [],
    letters: [],
    moods: [],
    bucketList: [],
    musicState: null,
    notifications: [],
    milestones: {},
    cycleLogs: {},
    idToken: null,
    isSyncing: false,
    activeUnsubs: [],
    activeCoupleUnsubs: [],
    activeCoupleId: null,
    activePartnerId: null,
    fetchingUserId: null as string | null,

    runJanitor: async () => {
        const { activeCoupleId, profile } = get();
        if (!activeCoupleId || !profile?.id) return;

        try {
            console.log("[Janitor] Cleaning ephemeral RTDB nodes...");
            const { ref, remove, get: rtdbGet } = require('firebase/database');

            // Persist the shared cinema/music state locally before clearing ephemeral RTDB transport nodes.
            try {
                const [activeTrackSnap, queueSnap, tapeSnap] = await Promise.all([
                    rtdbGet(ref(rtdb, `couples/${activeCoupleId}/music/active_track`)),
                    rtdbGet(ref(rtdb, `couples/${activeCoupleId}/music/queue`)),
                    rtdbGet(ref(rtdb, `couples/${activeCoupleId}/music/tape`)),
                ]);

                const activeTrack = activeTrackSnap.val();
                const queue = queueSnap.val() || [];
                const tape = tapeSnap.val() || [];

                await repository.saveMusicState(activeCoupleId, {
                    current_track: activeTrack?.song || null,
                    queue: Array.isArray(queue) ? queue : [],
                    playlist: Array.isArray(tape) ? tape : [],
                    is_playing: !!activeTrack?.isPlaying,
                    progress_ms: typeof activeTrack?.position === 'number' ? Math.round(activeTrack.position * 1000) : 0,
                });
            } catch (snapshotError) {
                console.warn("[Janitor] Failed to snapshot shared music state:", snapshotError);
            }

            // 1. Wipe my own broadcasts (drawing/typing indicators)
            const myBroadcastRef = ref(rtdb, `broadcasts/${activeCoupleId}/${profile.id}`);
            await remove(myBroadcastRef);

            // 2. Clear music session heartbeat if stalled (Logic check)
            // We use remove() to ensure we don't pay for "zombie" data sitting in RTDB
            console.log("[Janitor] RTDB Sweep Complete.");
        } catch (e) {
            console.warn("[Janitor] Failed to sweep:", e);
        }
    },

    fetchData: (userId: string) => {
        const state = get();

        // 🛡️ Senior Guard: Prevent redundant initialization if already fetching/listening for this user
        if (state.fetchingUserId === userId) return () => { };
        if (state.activeUnsubs.length > 0 && state.profile?.id === userId) return () => { };

        set({ fetchingUserId: userId });

        // Performance: Cleanup existing listeners if switching users or forced refresh
        state.activeUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
        state.activeCoupleUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
        set({ activeUnsubs: [], activeCoupleUnsubs: [] });

        let isCleanedUp = false;

        // Show ultra-fast startup loader ONLY if cold boot with zero data
        const needsLoader = !state.profile && state.memories.length === 0;
        console.log("[DataSlice] fetchData starting. NeedsLoader:", needsLoader);
        if (needsLoader) {
            set({ loading: true });
        }

        // 🛡️ Safety Unlock: Ensure app is NEVER stuck for more than 7s
        const safetyUnlock = setTimeout(() => {
            if (get().loading && !isCleanedUp) {
                console.warn("[DataSlice] Safety unlock triggered. Breaking boot hang.");
                set({ loading: false, fetchingUserId: null });
            }
        }, 7000);

        const bootstrapFromLocal = async () => {
            console.log("[DataSlice] Bootstrap from SQLite starting...");
            try {
                // 1. Load profiles from instant SQLite cache
                const profs = await repository.getProfiles().catch(() => []);
                const me = profs.find((u: any) => u.id === userId);
                const partner = profs.find((u: any) => u.id !== userId && u.couple_id === me?.couple_id);

                const normalize = (p: any) => {
                    if (!p) return null;
                    let loc = null;
                    if (p.location_json) {
                        try { loc = typeof p.location_json === 'string' ? JSON.parse(p.location_json) : p.location_json; } catch (e) { }
                    }
                    return { ...p, location: loc };
                };

                const myProfile = normalize(me);
                const pProfile = normalize(partner);
                const cachedCouple = myProfile?.couple_id
                    ? await repository.getCouple(myProfile.couple_id).catch(() => null)
                    : null;

                // 2. Hydrate collections
                const [mems, lets, pols, moody, buck] = await Promise.all([
                    repository.getMemories().catch(() => []),
                    repository.getLetters().catch(() => []),
                    repository.getPolaroids().catch(() => []),
                    repository.getMoods().catch(() => []),
                    repository.getBucketList().catch(() => [])
                ]);

                if (!isCleanedUp) {
                    // 🚀 PERFORMANCE: Single atomic state update to prevent re-render thrashing
                    set({
                        profile: myProfile || get().profile,
                        couple: cachedCouple || get().couple,
                        activeCoupleId: myProfile?.couple_id || get().activeCoupleId,
                        partnerProfile: pProfile || get().partnerProfile,
                        activePartnerId: pProfile?.id || get().activePartnerId,
                        memories: mems,
                        letters: lets,
                        polaroids: pols,
                        moods: moody,
                        bucketList: buck,
                        loading: false
                    });
                }
            } catch (e) {
                console.warn("[DataSlice] Bootstrap failed:", e);
                set({ loading: false });
            }
        };

        const performSilentDeltaSync = async (coupleId: string) => {
            if (isCleanedUp) return;
            // 2500ms delay to let the app finish booting and first paint
            await new Promise(r => setTimeout(r, 2500));
            if (isCleanedUp) return;

            set({ isSyncing: true });
            try {
                let anyChanged = false;

                // Sequential Sync (Background work, doesn't touch UI directly)
                if (await repository.syncCollection('moods', coupleId, moodsTable, 'moods')) anyChanged = true;
                if (await repository.syncCollection('letters', coupleId, lettersTable, 'letters')) anyChanged = true;
                if (await repository.syncCollection('polaroids', coupleId, polaroidsTable, 'polaroids')) anyChanged = true;
                if (await repository.syncCollection('bucket_list', coupleId, bucketTable, 'bucket_list')) anyChanged = true;
                if (await repository.syncCollection('memories', coupleId, memoriesTable, 'memories')) anyChanged = true;

                // 🚀 COOLING: Only bootstrap ONCE if something actually changed on the server
                if (anyChanged && !isCleanedUp) {
                    await bootstrapFromLocal();
                }

                // Background Mirroring
                const { memories, polaroids, idToken, profile, partnerProfile } = get();
                if (idToken && !isCleanedUp) {
                    triggerMirroring(memories, polaroids, idToken, profile, partnerProfile);
                }

            } finally {
                if (!isCleanedUp) set({ isSyncing: false });
            }
        };

        const cleanup = () => {
            isCleanedUp = true;
            clearTimeout(safetyUnlock);
            if (activePartnerUnsub) {
                activePartnerUnsub();
                activePartnerUnsub = null;
            }
            if (activeCoupleUnsub) activeCoupleUnsub();
            if (activeMusicUnsub) activeMusicUnsub();
            if (activeMilestonesUnsub) activeMilestonesUnsub();
            if (activeCycleUnsub) activeCycleUnsub();
            if (activeMoodsUnsub) activeMoodsUnsub();
            if (activeLettersUnsub) activeLettersUnsub();
            const s = get();
            s.activeUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            s.activeCoupleUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            set({ activeUnsubs: [], activeCoupleUnsubs: [], fetchingUserId: null });
        };


        // 🚀 BOOT CRITICAL: Load from SQLite INSTANTLY before network
        // This ensures the app is never empty/white even on an airplane.
        bootstrapFromLocal();

        // VITAL LISTENERS (Profile & Couple Metadata only)
        // These are tiny Firestore documents (<1KB). We listen to them for real-time paired state.
        const setupVitalListeners = async () => {
            console.log("[DataSlice] Setup Vital Listeners starting...");
            if (isCleanedUp) return;

            // 1. User Profile Listener
            const userRef = doc(db, 'users', userId);
            const unsubUser = onSnapshot(userRef, (snapshot) => {
                const data = snapshot.data();
                if (!data || isCleanedUp) return;

                const current = get().profile;
                const next = { id: snapshot.id, ...data };
                if (strip(current) !== strip(next)) set({ profile: next });

                repository.saveProfile(snapshot.id, data, false);

                const cId = data?.couple_id;
                if (cId && (cId !== get().activeCoupleId || !activeCoupleUnsub)) {
                    set({ activeCoupleId: cId });
                    subscribeToCoupleMetadata(cId);
                }
            });
            set((s: any) => ({ activeUnsubs: [...s.activeUnsubs, unsubUser] }));

            // Notifications Listener (user-scoped)
            const notifsRef = collection(db, 'users', userId, 'notifications');
            const unsubNotifications = onSnapshot(query(notifsRef, orderBy('created_at', 'desc'), limit(100)), (snap) => {
                if (isCleanedUp) return;

                const nextNotifications = snap.docs
                    .map((d) => {
                        const data: any = d.data();
                        const ts = data?.created_at;
                        const createdAt =
                            ts && typeof ts?.toDate === 'function'
                                ? ts.toDate()
                                : data?.created_at
                                    ? new Date(data.created_at)
                                    : new Date();
                        return {
                            id: d.id,
                            ...data,
                            created_at: createdAt,
                        };
                    })
                    .sort((a, b) => {
                        const at = a.created_at instanceof Date ? a.created_at.getTime() : 0;
                        const bt = b.created_at instanceof Date ? b.created_at.getTime() : 0;
                        return bt - at;
                    });

                const current = get().notifications || [];
                if (strip(current) !== strip(nextNotifications)) {
                    set({ notifications: nextNotifications });
                }
            });
            set((s: any) => ({ activeUnsubs: [...s.activeUnsubs, unsubNotifications] }));
        };

        let activePartnerUnsub: Unsubscribe | null = null;
        let activeCoupleUnsub: Unsubscribe | null = null;
        let activeMusicUnsub: Unsubscribe | null = null;
        let activeMilestonesUnsub: Unsubscribe | null = null;
        let activeCycleUnsub: Unsubscribe | null = null;
        let activeMoodsUnsub: Unsubscribe | null = null;
        let activeLettersUnsub: Unsubscribe | null = null;

        const subscribeToCoupleMetadata = (coupleId: string) => {
            if (activeCoupleUnsub) activeCoupleUnsub();
            if (activeMusicUnsub) activeMusicUnsub();
            if (activeMilestonesUnsub) activeMilestonesUnsub();
            if (activeCycleUnsub) activeCycleUnsub();
            if (activeMoodsUnsub) activeMoodsUnsub();
            if (activeLettersUnsub) activeLettersUnsub();

            const coupleRef = doc(db, 'couples', coupleId);
            const unsubCouple = onSnapshot(coupleRef, (snap) => {
                const data = snap.data();
                if (!data || isCleanedUp) return;

                const current = get().couple;
                const next = { id: snap.id, ...data };
                if (strip(current) !== strip(next)) set({ couple: next });
                repository.saveCouple(snap.id, data);

                // Derived Partner Meta-Listener
                const pId = data?.user1_id === userId ? data?.user2_id : data?.user1_id;
                if (pId && pId !== get().activePartnerId) {
                    if (activePartnerUnsub) {
                        activePartnerUnsub();
                        activePartnerUnsub = null;
                    }
                    set({ activePartnerId: pId });
                    const pRef = doc(db, 'users', pId);
                    const unsubPartner = onSnapshot(pRef, (pSnap) => {
                        const pData = pSnap.data();
                        if (!pData || isCleanedUp) return;
                        const fullP = { id: pSnap.id, ...pData };
                        if (strip(get().partnerProfile) !== strip(fullP)) set({ partnerProfile: fullP });
                        repository.saveProfile(pSnap.id, pData, true);
                    });
                    activePartnerUnsub = unsubPartner;
                    set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubPartner] }));
                }
            });
            activeCoupleUnsub = unsubCouple;
            // CRITICAL: Ensure the couple unsub is also tracked
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubCouple] }));

            // DELTA SYNC TRIGGER
            // We do NOT use onSnapshot for large collections (Memories/Letters). We delta-sync silently.
            performSilentDeltaSync(coupleId);

            // LIVE PRESENCE: Music & Shared Playback State
            // This is a small real-time listener (<1KB) to keep both partners in sync.
            const musicRef = doc(db, 'couples', coupleId, 'music_session', 'current');
            const unsubMusic = onSnapshot(musicRef, (snap) => {
                const data = snap.data();
                if (!data || isCleanedUp) return;

                // Deep compare to prevent re-renders
                const current = get().musicState;
                if (strip(current) !== strip(data)) {
                    set({ musicState: { ...data, id: snap.id } });
                    // Sync to local SQLite for offline resilience
                    repository.saveMusicState(coupleId, data);
                }
            });
            activeMusicUnsub = unsubMusic;
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMusic] }));

            // 📍 INTNSTANT SYNC: Intimacy Milestones
            const milestonesRef = collection(db, 'couples', coupleId, 'milestones');
            const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
                const m: Record<string, any> = {};
                snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
                if (strip(get().milestones) !== strip(m)) set({ milestones: m });
            });
            activeMilestonesUnsub = unsubMilestones;
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMilestones] }));

            // 📍 REAL-TIME PRESENCE: Partner Feeling Updates
            const cycleRef = collection(db, 'couples', coupleId, 'cycle_logs');
            const unsubCycle = onSnapshot(cycleRef, (snap) => {
                const logs: any = { ...get().cycleLogs };
                snap.docs.forEach(d => {
                    const data = d.data();
                    const uId = data.user_id;
                    if (!logs[uId]) logs[uId] = {};
                    logs[uId][data.log_date] = data;
                });
                if (strip(get().cycleLogs) !== strip(logs)) set({ cycleLogs: logs });
            });
            activeCycleUnsub = unsubCycle;
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubCycle] }));

            // 🕒 REAL-TIME MOOD SYNC (Bridge the ephemeral gap)
            const moodsRef = collection(db, 'couples', coupleId, 'moods');
            const unsubMoods = onSnapshot(query(moodsRef, orderBy('updated_at', 'desc'), limit(50)), (snap) => {
                const mo: MoodData[] = [];
                snap.docs.forEach(d => {
                    const entry = { id: d.id, ...d.data() } as MoodData;
                    mo.push(entry);
                    repository.saveMoodLocal(entry).catch(() => { });
                });
                const currentMoods = collapseLatestMoods(get().moods);
                const nextMoods = collapseLatestMoods(mergeCollections(currentMoods, mo));
                if (strip(currentMoods) !== strip(nextMoods)) set({ moods: nextMoods });
            });
            activeMoodsUnsub = unsubMoods;
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMoods] }));

            // Bucket list should feel live like the web app, not delayed behind delta sync.
            const bucketRef = collection(db, 'couples', coupleId, 'bucket_list');
            const unsubBucket = onSnapshot(query(bucketRef, orderBy('created_at', 'desc'), limit(200)), (snap) => {
                const nextBucket: any[] = [];
                snap.docs.forEach((d) => {
                    const data: any = d.data();
                    const entry = { id: d.id, ...data };
                    repository.saveBucketItemLocal(entry).catch(() => { });
                    if (data?.deleted) return;
                    nextBucket.push(entry);
                });
                const currentBucket = get().bucketList;
                const merged = mergeCollections(currentBucket, nextBucket as BucketItem[]);
                if (strip(currentBucket) !== strip(merged)) set({ bucketList: merged });
            });
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubBucket] }));

            // ✉️ REAL-TIME LETTER SYNC (instant reflection like memories)
            const lettersRef = collection(db, 'couples', coupleId, 'letters');
            const unsubLetters = onSnapshot(query(lettersRef, orderBy('created_at', 'desc'), limit(200)), (snap) => {
                const nextLetters: any[] = [];
                snap.docs.forEach((d) => {
                    const data: any = d.data();
                    const entry = { id: d.id, ...data };
                    repository.saveLetterLocal(entry).catch(() => { });
                    if (data?.deleted) return;
                    nextLetters.push(entry);
                });
                const currentLetters = get().letters;
                const merged = mergeCollections(currentLetters, nextLetters as LetterData[]);
                if (strip(currentLetters) !== strip(merged)) set({ letters: merged });
            });
            activeLettersUnsub = unsubLetters;
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubLetters] }));

            // Memories also need a light live bridge so sender/native sees new items immediately.
            const memoriesRef = collection(db, 'couples', coupleId, 'memories');
            const unsubMemories = onSnapshot(query(memoriesRef, orderBy('created_at', 'desc'), limit(100)), (snap) => {
                const nextMemories: any[] = [];
                snap.docs.forEach((d) => {
                    const data: any = d.data();
                    const entry = { id: d.id, ...data };
                    repository.saveMemoryLocal(entry).catch(() => { });
                    if (data?.deleted) return;
                    nextMemories.push(entry);
                });
                const currentMemories = get().memories;
                const merged = mergeCollections(currentMemories, nextMemories as MemoryData[]);
                if (strip(currentMemories) !== strip(merged)) set({ memories: merged });
            });
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMemories] }));
        };

        // Vitals provide the most critical 'unblocking' data (profile/couple) from Cloud.
        setupVitalListeners();
        const bootCoupleId = get().activeCoupleId;
        if (bootCoupleId) {
            subscribeToCoupleMetadata(bootCoupleId);
        }

        return cleanup;
    },

    syncNow: async () => {
        const { couple, isSyncing } = get();
        if (!couple?.id || isSyncing) return;
        set({ isSyncing: true });
        try {
            // Force Sequential Delta Sync
            await repository.syncCollection('memories', couple.id, memoriesTable, 'memories');
            await repository.syncCollection('letters', couple.id, lettersTable, 'letters');
            await repository.syncCollection('moods', couple.id, moodsTable, 'moods');
            await repository.syncCollection('bucket_list', couple.id, bucketTable, 'bucket_list');
            await repository.syncCollection('polaroids', couple.id, polaroidsTable, 'polaroids');

            const [m, l, mo, b, p] = await Promise.all([
                repository.getMemories(), repository.getLetters(), repository.getMoods(),
                repository.getBucketList(), repository.getPolaroids()
            ]);

            const s = get();
            const nextM = mergeCollections(s.memories, m as MemoryData[]);
            const nextL = mergeCollections(s.letters, l as LetterData[]);
            const nextMo = mergeCollections(s.moods, mo as MoodData[]);
            const nextB = mergeCollections(s.bucketList, b as BucketItem[]);
            const nextP = mergeCollections(s.polaroids, p as PolaroidData[]);

            const updates: Partial<DataSlice> = {};
            if (nextM !== s.memories) updates.memories = nextM;
            if (nextL !== s.letters) updates.letters = nextL;
            if (nextMo !== s.moods) updates.moods = nextMo;
            if (nextB !== s.bucketList) updates.bucketList = nextB;
            if (nextP !== s.polaroids) updates.polaroids = nextP;

            set({ ...updates, isSyncing: false });

            // 🛡️ DATA LONGEVITY (Phase 3): Mirror assets to local storage after manual refresh
            const { memories: m_after, polaroids: p_after, idToken, profile, partnerProfile } = get();
            if (idToken) triggerMirroring(m_after, p_after, idToken, profile, partnerProfile);
        } catch (e) {
            set({ isSyncing: false });
        }
    },

    // OPTIMISTIC MUTATORS (Instant UI feel)
    updateBucketItemOptimistic: (id: string, isCompleted: boolean) => {
        const state = get();
        const { bucketList } = state;
        const next = bucketList.map((i: any) => i.id === id ? { ...i, is_completed: isCompleted } : i);
        set({ bucketList: next });
        repository.updateBucketItemStatus(id, isCompleted);
        const coupleId = resolveCoupleId(state);
        if (coupleId) updateDoc(doc(db, 'couples', coupleId, 'bucket_list', id), { is_completed: isCompleted, updated_at: Timestamp.now() });
    },

    updateLetterReadOptimistic: (id: string, isRead: boolean) => {
        const { letters } = get();
        const next = letters.map((l: any) => l.id === id ? { ...l, is_read: isRead } : l);
        set({ letters: next });
        repository.updateLetterReadStatus(id, isRead);
        const { couple } = get();
        if (couple?.id) updateDoc(doc(db, 'couples', couple.id, 'letters', id), { is_read: isRead, updated_at: Timestamp.now() });
    },

    logSymptomsOptimistic: (userId: string, symptoms: string[]) => {
        const today = getTodayIST();
        const state = get();
        const { cycleLogs } = state;
        const userLogs = { ...(cycleLogs[userId] || {}) };
        userLogs[today] = { ...(userLogs[today] || {}), symptoms, user_id: userId, log_date: today };
        set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });
        const coupleId = resolveCoupleId(state);
        if (coupleId) setDoc(doc(db, 'couples', coupleId, 'cycle_logs', `${userId}_${today}`), { user_id: userId, log_date: today, symptoms, updated_at: Timestamp.now() }, { merge: true });
    },

    addBucketItemOptimistic: (title: string, isPrivate: boolean = false) => {
        const tempId = `temp_${Date.now()}`;
        const { bucketList, profile } = get();
        const newItem: BucketItem = {
            id: tempId,
            title,
            description: null,
            is_completed: false,
            is_private: isPrivate,
            created_by: profile?.id || 'local',
            created_at: Date.now(),
            deleted: false
        };
        set({ bucketList: [newItem, ...bucketList] });
    },

    addPolaroidOptimistic: (imageUrl: string, caption: string | null) => {
        const today = getTodayIST();
        const { polaroids, profile } = get();
        const polaroidId = `${profile?.id}_${today}`;
        const newPolaroid: PolaroidData = {
            id: polaroidId,
            image_url: imageUrl,
            caption: caption,
            created_at: Date.now(),
            user_id: profile?.id || null,
            polaroid_date: today
        };
        // Replace existing for today if it exists (Optimistic)
        set({ polaroids: [newPolaroid, ...polaroids.filter((p: PolaroidData) => p.id !== polaroidId)] });
        // Persist instantly to local SQLite so it survives app reload before cloud sync completes.
        repository.savePolaroidLocal(newPolaroid).catch((e) => console.warn('[Repo] savePolaroidLocal failed:', e));
    },

    deleteBucketItemOptimistic: (id: string) => {
        const state = get();
        const { bucketList } = state;
        set({ bucketList: bucketList.filter((i: any) => i.id !== id) });
        repository.deleteBucketItem(id);
        const coupleId = resolveCoupleId(state);
        if (coupleId && !id.startsWith('temp_')) updateDoc(doc(db, 'couples', coupleId, 'bucket_list', id), { deleted: true, updated_at: Timestamp.now() });
    },

    logSexDriveOptimistic: (userId: string, level: string) => {
        const today = getTodayIST();
        const state = get();
        const { cycleLogs } = state;
        const userLogs = { ...(cycleLogs[userId] || {}) };
        userLogs[today] = { ...(userLogs[today] || {}), sex_drive: level, user_id: userId, log_date: today };
        set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });
        const coupleId = resolveCoupleId(state);
        if (coupleId) setDoc(doc(db, 'couples', coupleId, 'cycle_logs', `${userId}_${today}`), { user_id: userId, log_date: today, sex_drive: level, updated_at: Timestamp.now() }, { merge: true });
    },

    submitMoodOptimistic: (userId: string, emoji: string, note: string = '') => {
        const today = getTodayIST();
        const moodId = `${userId}_${today}`;
        const state = get();
        const { moods } = state;
        const coupleId = resolveCoupleId(state);
        const newMood: MoodData = { id: moodId, user_id: userId, emoji, mood_text: note, mood_date: today, created_at: Date.now() };

        // Use deterministic ID for optimistic update to match sync later
        set({ moods: [newMood, ...moods.filter((m: MoodData) => m.id !== moodId)] });

        // Sync to cloud
        if (coupleId) {
            setDoc(doc(db, 'couples', coupleId, 'moods', `${userId}_${today}`), {
                id: `${userId}_${today}`,
                user_id: userId,
                emoji,
                mood_text: note,
                mood_date: today,
                created_at: Timestamp.now(),
                updated_at: Timestamp.now()
            }, { merge: true });

            // 🚀 High-Frequency Presence Sync (RTDB)
            // Mirrors latest vibe to presence for zero-latency partner view
            const { ref, update, serverTimestamp } = require('firebase/database');
            const presenceRef = ref(rtdb, `presence/${coupleId}/${userId}`);
            update(presenceRef, {
                latest_mood: { emoji, note, timestamp: Date.now() },
                last_changed: serverTimestamp()
            });
        }
    },

    clearMoodOptimistic: (userId: string) => {
        const today = getTodayIST();
        const state = get();
        const { moods } = state;
        const coupleId = resolveCoupleId(state);
        set({ moods: moods.filter((m: MoodData) => !(m.user_id === userId && m.mood_date === today)) });

        if (coupleId) {
            // Delete mood for today in cloud
            deleteDoc(doc(db, 'couples', coupleId, 'moods', `${userId}_${today}`));
        }
    },

    deleteMemoryOptimistic: (memory: MemoryData) => {
        const { memories, couple } = get();
        // UI-Optimistic: remove immediately
        set({ memories: memories.filter((m: MemoryData) => m.id !== memory.id) });

        // Background: Soft-delete locally for sync logic
        // We set deleted: 1 so it stays in SQLite but hidden from UI
        repository.deleteMemory(memory.id);

        // Background: Cloud Soft-Delete (Standard Delta Sync Pattern)
        if (couple?.id) {
            updateDoc(doc(db, 'couples', couple.id, 'memories', memory.id), {
                deleted: true,
                updated_at: Timestamp.now()
            });
        }
    },

    sendLetterOptimistic: async (letter: Partial<LetterData>) => {
        const tempId = `temp_letter_${Date.now()}`;
        const { letters, couple, profile } = get();

        const fullLetter: LetterData = {
            id: tempId,
            content: letter.content || '',
            title: letter.title || 'Untitled',
            sender_id: letter.sender_id || profile?.id || '',
            receiver_id: letter.receiver_id || '',
            sender_name: profile?.display_name || null,
            created_at: Date.now(),
            updated_at: Date.now(),
            is_read: false,
            is_vanish: !!letter.is_vanish,
            is_scheduled: !!letter.is_scheduled,
            scheduled_delivery_time: letter.scheduled_delivery_time || null,
            unlock_type: letter.unlock_type || 'instant',
        };

        // 1. Instant UI update
        set({ letters: [fullLetter, ...letters] });

        // 2. Local persistence (survives app reload/crash)
        await repository.saveLetterLocal?.(fullLetter);

        // 3. Background Cloud Sync
        if (couple?.id) {
            const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
            const dataToSync = {
                ...fullLetter,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };
            delete (dataToSync as any).id; // Let Firestore generate real ID

            addDoc(collection(db, 'couples', couple.id, 'letters'), dataToSync).catch((e: unknown) => {
                console.error("[DataSlice] Background Letter Sync failed:", e);
            });
        }
    },

    addMemoryOptimistic: async (memory: Partial<MemoryData>) => {
        const tempId = `temp_mem_${Date.now()}`;
        const { memories, couple, profile } = get();

        const fullMemory: MemoryData = {
            id: tempId,
            title: memory.title || 'Moment',
            content: memory.content || '',
            image_url: memory.image_url || null,
            image_urls: memory.image_urls || [],
            sender_id: memory.sender_id || profile?.id || '',
            sender_name: memory.sender_name || profile?.display_name || null,
            couple_id: couple?.id || '',
            memory_date: memory.memory_date || new Date().toISOString(),
            created_at: Date.now(),
            updated_at: Date.now(),
            type: 'image'
        };

        // 1. Instant UI update
        set({ memories: [fullMemory, ...memories] });

        // 2. Local persistence
        await repository.saveMemoryLocal?.(fullMemory);

        // 3. Background Cloud Sync (Assumes images already uploaded by screen)
        if (couple?.id) {
            const { addDoc, collection, serverTimestamp } = require('firebase/firestore');
            const dataToSync = {
                ...fullMemory,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };
            delete (dataToSync as any).id;

            addDoc(collection(db, 'couples', couple.id, 'memories'), dataToSync).catch((e: unknown) => {
                console.error("[DataSlice] Background Memory Sync failed:", e);
            });
        }
    },

    sendHeartbeatOptimistic: () => {
        const state = get();
        const { profile } = state;
        const coupleId = resolveCoupleId(state);
        if (!coupleId || !profile?.id) return;

        // Heartbeat is a direct live signal, not a spark.
        const { ref, set, update, serverTimestamp } = require('firebase/database');
        const vibeRef = ref(rtdb, `vibrations/${coupleId}`);
        set(vibeRef, {
            senderId: profile.id,
            timestamp: Date.now(),
            type: 'heartbeat'
        });

        const presenceRef = ref(rtdb, `presence/${coupleId}/${profile.id}`);
        update(presenceRef, {
            is_online: true,
            last_changed: serverTimestamp()
        });

        // Local Haptic Feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    },

    resetData: () => {
        const { activeUnsubs, activeCoupleUnsubs } = get();
        activeUnsubs.forEach((u: any) => u());
        activeCoupleUnsubs.forEach((u: any) => u());
        set({ memories: [], polaroids: [], letters: [], moods: [], bucketList: [], notifications: [], milestones: {}, cycleLogs: {}, loading: false, profile: null, partnerProfile: null, couple: null, activeUnsubs: [], activeCoupleUnsubs: [], fetchingUserId: null });
    }
});
