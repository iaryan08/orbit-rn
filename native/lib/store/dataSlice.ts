import { StateCreator } from 'zustand';
import { MemoryData, PolaroidData, LetterData, MoodData, BucketItem } from './types';
import { db, auth, rtdb } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, onSnapshot, Unsubscribe, Timestamp, updateDoc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, update, serverTimestamp as rtdbServerTimestamp, remove, get as rtdbGet } from 'firebase/database';
import { repository } from '../repository';
import { getTodayIST, throttle } from '../utils';
import { memories as memoriesTable, letters as lettersTable, moods as moodsTable, bucketList as bucketTable, polaroids as polaroidsTable, offlineMutations as mutationsTable, cycleLogs as cycleLogsTable } from '../db/schema';
import { triggerMirroring } from '../MirrorService';
import * as Haptics from 'expo-haptics';
import { AuthSlice, strip } from './authSlice';
import { flushMutationQueue } from '../offline-queue';

// Advanced Merge: Updates state only for changed items, maintaining reference stability
const mergeCollections = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
    if (strip(current) === strip(incoming)) return current;

    const result: T[] = [...incoming];
    let hasChanged = current.length !== incoming.length;

    // 🛡️ Optimistic Preservation: Keep "temp_" items from current state that haven't synced yet
    const tempItems = current.filter(i => i.id.startsWith('temp_'));
    for (const temp of tempItems) {
        if (!incoming.find(i => i.id === temp.id)) {
            result.unshift(temp); // Keep temp items at top
            hasChanged = true;
        }
    }

    // Reference stability: if nothing truly changed, return current
    if (!hasChanged && strip(current) === strip(result)) return current;

    return result;
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
    idToken: string | null
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
    updateMemoryOptimistic: (id: string, updates: Partial<MemoryData>) => void
    updatePolaroidOptimistic: (id: string, updates: Partial<PolaroidData>) => void
    savePolaroidToMemoriesOptimistic: (polaroid: PolaroidData) => Promise<void>
    sendHeartbeatOptimistic: () => void
    resetData: () => void,
    deletePolaroidOptimistic: (id: string) => void,
    addCommentOptimistic: (targetId: string, type: 'memory' | 'polaroid', text: string) => void,
    runJanitor: () => Promise<void>,
    pauseListeners: () => void,
    resumeListeners: () => void,
    flushQueue: () => Promise<void>,
    activeUnsubs: Unsubscribe[],
    activeCoupleUnsubs: Unsubscribe[]
    tabUnsubs: Record<string, Unsubscribe[]>
    activeCoupleId: string | null
    activePartnerId: string | null
    fetchingUserId: string | null
    lastForegroundTime: number
    toggleTabListener: (tabId: string, enabled: boolean) => void
}

export const createDataSlice: StateCreator<DataSlice & any> = (set, get) => {
    const throttledUpdatePresence = throttle((coupleId: string, userId: string, data: any) => {
        const presenceRef = ref(rtdb, `presence/${coupleId}/${userId}`);
        update(presenceRef, { ...data, last_changed: rtdbServerTimestamp() }).catch(() => { });
    }, 15000); // 15s throttle for presence metadata updates (vibe/heartbeat)

    const syncWallpaperFromProfile = (data: any) => {
        if (!data) return;
        const { wallpaperConfig, wallpaperConfigDirtyUntil, setWallpaperConfig } = get();
        if (Date.now() < (wallpaperConfigDirtyUntil || 0)) return;

        const nextMode = (data.wallpaper_mode === 'custom' || data.wallpaper_mode === 'shared') ? data.wallpaper_mode : 'stars';
        const nextGrayscale = !!data.wallpaper_grayscale;
        const nextAestheticRaw = data.wallpaper_aesthetic || data.background_aesthetic;
        const nextAesthetic = (nextAestheticRaw === 'Glass' || nextAestheticRaw === 'Ethereal' || nextAestheticRaw === 'Obsidian' || nextAestheticRaw === 'Cinema')
            ? nextAestheticRaw
            : 'Natural';

        if (
            nextMode !== wallpaperConfig.mode ||
            nextGrayscale !== wallpaperConfig.grayscale ||
            nextAesthetic !== wallpaperConfig.aesthetic
        ) {
            setWallpaperConfig({ mode: nextMode, grayscale: nextGrayscale, aesthetic: nextAesthetic });
        }
    };

    return {
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
        tabUnsubs: {},
        activeCoupleId: null,
        activePartnerId: null,
        fetchingUserId: null as string | null,
        lastForegroundTime: Date.now(),
        loading: false,
        profile: null,
        partnerProfile: null,
        couple: null,

        pauseListeners: () => {
            const { activeUnsubs, activeCoupleUnsubs, tabUnsubs } = get();
            console.log("[DataSlice] Pausing all listeners for background mode...");
            activeUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            activeCoupleUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            Object.values(tabUnsubs).forEach((uList: unknown) => (uList as any[]).forEach(u => u && typeof u === 'function' && u()));
            set({ activeUnsubs: [], activeCoupleUnsubs: [], tabUnsubs: {} });
        },

        flushQueue: async () => {
            const { profile } = get();
            if (!profile?.id) return;

            console.log("[DataSlice] Attempting to flush offline mutation queue...");
            const result = await flushMutationQueue();
            if (result.processed > 0) {
                console.log(`[DataSlice] Flushed ${result.processed} mutations from queue.`);
                // After flushing mutations, we might need to refresh local data
                // but the delta sync will handle it or listeners will trigger.
            }
        },

        resumeListeners: () => {
            const { profile, fetchingUserId } = get();
            set({ lastForegroundTime: Date.now() });
            if (profile?.id && !fetchingUserId) {
                console.log("[DataSlice] Resuming listeners for foreground mode...");
                get().fetchData(profile.id);
                get().flushQueue(); // 🚀 Phase 8: Flush offline queue on foreground
            }
        },

        toggleTabListener: (tabId: string, enabled: boolean) => {
            const state = get();
            const coupleId = state.activeCoupleId;
            if (!coupleId) return;

            const currentUnsubs = state.tabUnsubs[tabId] || [];

            if (enabled) {
                // If already enabled, do nothing
                if (currentUnsubs.length > 0) return;

                console.log(`[DataSlice] Enabling listeners for tab: ${tabId}`);
                const newUnsubs: Unsubscribe[] = [];

                // 📍 Tab-Specific Live Listeners
                if (tabId === 'dashboard' || tabId === 'moods' || tabId === 'lunara') {
                    const cycleRef = collection(db, 'couples', coupleId, 'cycle_logs');
                    const unsubCycle = onSnapshot(cycleRef, (snap) => {
                        const logs: any = { ...get().cycleLogs };
                        let changed = false;
                        snap.docs.forEach(d => {
                            const data = d.data();
                            const uId = data.user_id;
                            const logDate = data.log_date;
                            if (uId && logDate) {
                                if (!logs[uId]) logs[uId] = {};
                                const existing = strip(logs[uId][logDate]);
                                const next = strip(data);
                                if (existing !== next) {
                                    logs[uId][logDate] = data;
                                    changed = true;
                                    repository.saveCycleLogLocal(uId, logDate, data).catch(() => { });
                                }
                            }
                        });
                        if (changed) set({ cycleLogs: logs });
                    });
                    newUnsubs.push(unsubCycle);

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
                    newUnsubs.push(unsubMoods);
                }

                if (tabId === 'dashboard' || tabId === 'letters') {
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
                    newUnsubs.push(unsubLetters);
                }

                if (tabId === 'dashboard' || tabId === 'memories') {
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
                    newUnsubs.push(unsubMemories);
                }

                if (tabId === 'dashboard' || tabId === 'bucket_list') {
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
                    newUnsubs.push(unsubBucket);
                }

                if (tabId === 'dashboard' || tabId === 'milestones') {
                    const milestonesRef = collection(db, 'couples', coupleId, 'milestones');
                    const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
                        const m: Record<string, any> = {};
                        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
                        if (strip(get().milestones) !== strip(m)) set({ milestones: m });
                    });
                    newUnsubs.push(unsubMilestones);
                }

                if (tabId === 'dashboard') {
                    const polaroidsRef = collection(db, 'couples', coupleId, 'polaroids');
                    const unsubPolaroids = onSnapshot(query(polaroidsRef, orderBy('created_at', 'desc'), limit(50)), (snap) => {
                        const po: PolaroidData[] = [];
                        const now = Date.now();
                        const expirationMs = 48 * 60 * 60 * 1000;
                        const { deletePolaroid } = require('../../lib/auth');

                        snap.docs.forEach(d => {
                            const data = d.data();
                            const entry = { id: d.id, ...data } as PolaroidData;
                            
                            // 🚀 Phase 3: 48-hour auto-deletion logic
                            const createdAt = getComparableTimestamp(data.created_at);
                            if (createdAt > 0 && now - createdAt > expirationMs) {
                                // Background cleanup for expired polaroids
                                console.log(`[PolaroidEngine] Purging expired polaroid: ${d.id}`);
                                deletePolaroid(entry).catch(() => {});
                                return;
                            }

                            po.push(entry);
                            repository.savePolaroidLocal(entry).catch(() => { });
                        });
                        const currentPolaroids = get().polaroids;
                        const merged = mergeCollections(currentPolaroids, po);
                        if (strip(currentPolaroids) !== strip(merged)) set({ polaroids: merged });
                    });
                    newUnsubs.push(unsubPolaroids);
                }

                set({ tabUnsubs: { ...state.tabUnsubs, [tabId]: newUnsubs } });
            } else {
                // Disable: cleanup and remove from map
                console.log(`[DataSlice] Disabling listeners for tab: ${tabId}`);
                currentUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
                const nextTabUnsubs = { ...state.tabUnsubs };
                delete nextTabUnsubs[tabId];
                set({ tabUnsubs: nextTabUnsubs });
            }
        },

        runJanitor: async () => {
            const { activeCoupleId, profile, pauseListeners } = get();
            if (!activeCoupleId || !profile?.id) return;

            try {
                console.log("[Janitor] Cleaning ephemeral RTDB nodes...");
                pauseListeners(); // 🚀 Phase 7: Detach all Firestore listeners on background

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
                } catch (snapshotError: any) {
                    const msg = String(snapshotError?.message || snapshotError || '');
                    if (msg.toLowerCase().includes('permission denied')) {
                        // Expected on restricted RTDB rules; skip without noisy warning
                    } else {
                        console.warn("[Janitor] Failed to snapshot shared music state:", snapshotError);
                    }
                }

                // 1. Wipe my own broadcasts (drawing/typing indicators)
                const myBroadcastRef = ref(rtdb, `broadcasts/${activeCoupleId}/${profile.id}`);
                await remove(myBroadcastRef);

                // 2. Clear music session heartbeat if stalled (Logic check)
                // We use remove() to ensure we don't pay for "zombie" data sitting in RTDB
                console.log("[Janitor] RTDB Sweep Complete.");

                // 3. Polaroid 48h Expiry (Logic Check)
                const { polaroids } = get();
                const now = Date.now();
                const expiryMs = 48 * 60 * 60 * 1000;
                const expiredIds = polaroids
                    .filter((p: PolaroidData) => {
                        const stamp = getComparableTimestamp(p.created_at);
                        return stamp > 0 && (now - stamp) > expiryMs;
                    })
                    .map((p: PolaroidData) => p.id);

                if (expiredIds.length > 0) {
                    console.log(`[Janitor] Expiring ${expiredIds.length} polaroids...`);
                    const nextPolaroids = polaroids.filter((p: PolaroidData) => !expiredIds.includes(p.id));
                    set({ polaroids: nextPolaroids });
                    for (const id of expiredIds) {
                        const polaroid = polaroids.find((p: PolaroidData) => p.id === id);
                        (repository as any).deletePolaroid(id);
                        import('../auth').then(m => m.deletePolaroid(polaroid || id));
                    }
                }
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
                        let cp = null;
                        if (p.cycle_profile_json) {
                            try { cp = typeof p.cycle_profile_json === 'string' ? JSON.parse(p.cycle_profile_json) : p.cycle_profile_json; } catch (e) { }
                        }
                        return { ...p, location: loc, cycle_profile: cp || p.cycle_profile };
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
                            cycleLogs: await repository.getCycleLogs().catch(() => ({})),
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
                    if (await repository.syncCollection('cycle_logs', coupleId, cycleLogsTable, 'cycle_logs')) anyChanged = true;

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
                    const next: any = { id: snapshot.id, ...data };
                    if (strip(current) !== strip(next)) {
                        const avatarChanged = current?.avatar_url !== next?.avatar_url;
                        set({ 
                            profile: next,
                            ...(avatarChanged ? { lastAvatarUpdate: Date.now() } : {})
                        });
                        syncWallpaperFromProfile(next);
                    }

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
                    if (pId) {
                        if (pId !== get().activePartnerId || !activePartnerUnsub) {
                            if (activePartnerUnsub) {
                                activePartnerUnsub();
                                activePartnerUnsub = null;
                            }
                            set({ activePartnerId: pId });
                            const pRef = doc(db, 'users', pId);
                            const unsubPartner = onSnapshot(pRef, (pSnap) => {
                                const pData = pSnap.data();
                                if (!pData || isCleanedUp) return;
                                const fullP: any = { id: pSnap.id, ...pData };
                                if (strip(get().partnerProfile) !== strip(fullP)) {
                                    const avatarChanged = get().partnerProfile?.avatar_url !== fullP?.avatar_url;
                                    set({ 
                                        partnerProfile: fullP,
                                        ...(avatarChanged ? { lastAvatarUpdate: Date.now() } : {})
                                    });
                                }
                                repository.saveProfile(pSnap.id, pData, true);
                            });
                            activePartnerUnsub = unsubPartner;
                            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubPartner] }));
                        }
                    }
                });
                activeCoupleUnsub = unsubCouple;
                // CRITICAL: Ensure the couple unsub is also tracked
                set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubCouple] }));

                // DELTA SYNC TRIGGER
                // We do NOT use onSnapshot for large collections (Memories/Letters) by default.
                performSilentDeltaSync(coupleId);

                // LIVE PRESENCE: Music & Shared Playback State
                const musicRef = doc(db, 'couples', coupleId, 'music_session', 'current');
                const unsubMusic = onSnapshot(musicRef, (snap) => {
                    const data = snap.data();
                    if (!data || isCleanedUp) return;
                    const current = get().musicState;
                    if (strip(current) !== strip(data)) {
                        set({ musicState: { ...data, id: snap.id } });
                        repository.saveMusicState(coupleId, data);
                    }
                });
                activeMusicUnsub = unsubMusic;
                set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMusic] }));
            };

            // Vitals provide the most critical 'unblocking' data (profile/couple) from Cloud.
            setupVitalListeners();
            get().flushQueue(); // 🚀 Phase 8: Flush offline queue on initial fetch
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
            const { bucketList } = get();
            const next = bucketList.map((i: any) => i.id === id ? { ...i, is_completed: isCompleted } : i);
            set({ bucketList: next });
            repository.updateBucketItemStatus(id, isCompleted);

            // 🚀 Sync via Auth Action (handles offline queue)
            import('../auth').then(m => m.toggleBucketItem(id, isCompleted));
        },

        updateLetterReadOptimistic: (id: string, isRead: boolean) => {
            const { letters } = get();
            const letter = letters.find((l: any) => l.id === id);
            if (!letter) return;

            const isVanish = letter.unlock_type === 'one_time';

            if (isVanish && isRead) {
                // If opening a vanishing letter, remove it immediately from local store
                set({ letters: letters.filter((l: any) => l.id !== id) });
            } else {
                const next = letters.map((l: any) => l.id === id ? { ...l, is_read: isRead } : l);
                set({ letters: next });
            }

            repository.updateLetterReadStatus(id, isRead);

            // 🚀 Sync via Auth Action (pass isVanish so auth can delete from DB)
            import('../auth').then(m => m.updateLetterReadStatus(id, isRead, isVanish));
        },

        logSymptomsOptimistic: (userId: string, symptoms: string[]) => {
            const today = getTodayIST();
            const state = get();
            const { cycleLogs } = state;
            const userLogs = { ...(cycleLogs[userId] || {}) };
            userLogs[today] = { ...(userLogs[today] || {}), symptoms, user_id: userId, log_date: today };
            set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.logSymptoms(symptoms));
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

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.addBucketItem(title, '', isPrivate));
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
            // Persist instantly to local SQLite
            repository.savePolaroidLocal(newPolaroid).catch((e) => console.warn('[Repo] savePolaroidLocal failed:', e));

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.submitPolaroid(imageUrl, caption || undefined));
        },

        deletePolaroidOptimistic: (id: string) => {
            const { polaroids } = get();
            const polaroid = polaroids.find((p: PolaroidData) => p.id === id);
            if (!polaroid) return;

            set({ polaroids: polaroids.filter((p: PolaroidData) => p.id !== id) });
            (repository as any).deletePolaroid(id);

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.deletePolaroid(polaroid));
        },


        deleteBucketItemOptimistic: (id: string) => {
            const state = get();
            const { bucketList } = state;
            set({ bucketList: bucketList.filter((i: any) => i.id !== id) });
            repository.deleteBucketItem(id);

            // 🚀 Sync via Auth Action
            if (!id.startsWith('temp_')) {
                import('../auth').then(m => m.deleteBucketItem(id));
            }
        },

        logSexDriveOptimistic: (userId: string, level: string) => {
            const today = getTodayIST();
            const state = get();
            const { cycleLogs } = state;
            const userLogs = { ...(cycleLogs[userId] || {}) };
            userLogs[today] = { ...(userLogs[today] || {}), sex_drive: level, user_id: userId, log_date: today };
            set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.logSexDrive(level));
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

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.submitMood(emoji, note));

            // 🚀 Throttled Presence Sync (RTDB)
            if (coupleId) {
                throttledUpdatePresence(coupleId, userId, {
                    latest_mood: { emoji, note, timestamp: Date.now() },
                });
            }
        },

        clearMoodOptimistic: (userId: string) => {
            const today = getTodayIST();
            const state = get();
            const { moods } = state;
            set({ moods: moods.filter((m: MoodData) => !(m.user_id === userId && m.mood_date === today)) });

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.clearMood());
        },

        deleteMemoryOptimistic: (memory: MemoryData) => {
            const { memories } = get();
            // UI-Optimistic: remove immediately
            set({ memories: memories.filter((m: MemoryData) => m.id !== memory.id) });

            // Soft-delete locally for sync logic
            repository.deleteMemory(memory.id);

            // 🚀 Sync via Auth Action
            import('../auth').then(m => m.deleteMemory(memory));
        },

        sendLetterOptimistic: async (letter: Partial<LetterData>) => {
            const tempId = `temp_letter_${Date.now()}`;
            const { letters, profile } = get();

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

            // 2. Local persistence
            await repository.saveLetterLocal?.(fullLetter);

            // 🚀 3. Background Cloud Sync via Action
            import('../auth').then(m => m.sendLetter(fullLetter));
        },

        addMemoryOptimistic: async (memory: Partial<MemoryData>) => {
            const tempId = memory.id || `temp_mem_${Date.now()}`;
            const { memories, profile } = get();

            const fullMemory: MemoryData = {
                id: tempId,
                title: memory.title || 'Moment',
                content: memory.content || '',
                image_url: memory.image_url || null,
                image_urls: memory.image_urls || [],
                sender_id: memory.sender_id || profile?.id || '',
                sender_name: memory.sender_name || profile?.display_name || null,
                couple_id: memory.couple_id || '',
                memory_date: memory.memory_date || new Date().toISOString(),
                created_at: Date.now(),
                updated_at: Date.now(),
                type: 'image',
                source: memory.source || 'manual',
                source_polaroid_id: memory.source_polaroid_id || null
            };

            // 1. Instant UI update
            set({ memories: [fullMemory, ...memories] });

            // 2. Local persistence
            await repository.saveMemoryLocal?.(fullMemory);

            // 🚀 3. Background Cloud Sync
            import('../auth').then(m => m.savePolaroidToMemories(fullMemory));
        },

        addCommentOptimistic: async (targetId: string, type: 'memory' | 'polaroid', text: string) => {
            const { memories, polaroids, profile } = get();
            const timestamp = Date.now();
            
            const newComment = {
                id: `temp_comment_${timestamp}`,
                user_id: profile?.id || 'unknown',
                user_name: profile?.display_name || 'Partner',
                user_avatar_url: profile?.avatar_url || null,
                text,
                created_at: timestamp
            };

            if (type === 'memory') {
                const next = memories.map((m: any) => 
                    m.id === targetId 
                        ? { ...m, comments: [...(m.comments || []), newComment], updated_at: timestamp } 
                        : m
                );
                set({ memories: next });
                const updated = next.find((m: any) => m.id === targetId);
                if (updated) repository.saveMemoryLocal?.(updated);
            } else {
                const next = polaroids.map((p: any) => 
                    p.id === targetId 
                        ? { ...p, comments: [...(p.comments || []), newComment], updated_at: timestamp } 
                        : p
                );
                set({ polaroids: next });
                const updated = next.find((p: any) => p.id === targetId);
                if (updated) repository.savePolaroidLocal(updated);
            }

            // Cloud sync
            import('../auth').then(m => m.addComment(targetId, type, text));
        },

        savePolaroidToMemoriesOptimistic: async (polaroid: any) => {
            const { profile } = get();
            const memoryData: Partial<MemoryData> = {
                title: 'Daily Polaroid',
                content: polaroid.caption || 'A moment shared',
                image_url: polaroid.image_url,
                type: 'image',
                source: 'polaroid',
                source_polaroid_id: polaroid.id,
                sender_id: polaroid.user_id,
                sender_name: profile?.display_name || null
            };
            
            // Re-use addMemoryOptimistic logic
            return get().addMemoryOptimistic(memoryData as any);
        },

        updateMemoryOptimistic: (id: string, updates: Partial<MemoryData>) => {
            const { memories } = get();
            const next = memories.map((m: MemoryData) => m.id === id ? { ...m, ...updates, updated_at: Date.now() } : m);
            set({ memories: next });
            const item = memories.find((m: MemoryData) => m.id === id);
            if (item) repository.saveMemoryLocal?.({ ...item, ...updates } as any);
        },

        updatePolaroidOptimistic: (id: string, updates: Partial<PolaroidData>) => {
            const { polaroids } = get();
            const next = polaroids.map((p: PolaroidData) => p.id === id ? { ...p, ...updates, updated_at: Date.now() } : p);
            set({ polaroids: next });
            const item = polaroids.find((p: PolaroidData) => p.id === id);
            if (item) repository.savePolaroidLocal({ ...item, ...updates } as any);
        },

        sendHeartbeatOptimistic: () => {
            const state = get();
            const { profile } = state;
            const coupleId = resolveCoupleId(state);
            if (!coupleId || !profile?.id) return;

            // Heartbeat is a direct live signal, not a spark.
            const vibeRef = ref(rtdb, `vibrations/${coupleId}`);
            update(vibeRef, {
                senderId: profile.id,
                timestamp: Date.now(),
                type: 'heartbeat'
            });

            // Throttled Presence Update
            throttledUpdatePresence(coupleId, profile.id, { is_online: true });

            // Local Haptic Feedback
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        },

        resetData: () => {
            const { activeUnsubs, activeCoupleUnsubs, tabUnsubs } = get();
            activeUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            activeCoupleUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            Object.values(tabUnsubs).forEach((uList: unknown) => (uList as any[]).forEach(u => u && typeof u === 'function' && u()));
            set({
                memories: [],
                polaroids: [],
                letters: [],
                moods: [],
                bucketList: [],
                musicState: null,
                notifications: [],
                milestones: {},
                cycleLogs: {},
                loading: false,
                isSyncing: false,
                profile: null,
                partnerProfile: null,
                couple: null,
                idToken: null,
                activeUnsubs: [],
                activeCoupleUnsubs: [],
                tabUnsubs: {},
                activeCoupleId: null,
                activePartnerId: null,
                fetchingUserId: null,
                lastForegroundTime: Date.now()
            });
        }
    };
};
