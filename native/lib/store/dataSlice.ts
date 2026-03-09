import { StateCreator } from 'zustand';
import { MemoryData, PolaroidData, LetterData, MoodData, BucketItem } from './types';
import { db, storage, auth } from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, Unsubscribe, limit, where } from 'firebase/firestore';
import { repository } from '../repository';
import { getTodayIST } from '../utils';
import { memories as memoriesTable, letters as lettersTable, moods as moodsTable, bucketList as bucketTable, polaroids as polaroidsTable } from '../db/schema';

// Best-in-Class: Tiered Persistence Strategy for Redmi 10 Optimization
const SYNC_COOLDOWN = {
    INTERACTION: 2000,    // 2s: Fast-tapping UI (Bucket list, tasks)
    VITAL_STATS: 3000,    // 3s: Health data (Symptoms, moods)
    READ_RECEIPT: 5000,   // 5s: "Intent check" (Ensure user actually read the letter)
};

export interface DataSlice {
    memories: MemoryData[];
    polaroids: PolaroidData[];
    letters: LetterData[];
    moods: MoodData[];
    bucketList: BucketItem[];
    milestones: Record<string, any>;
    cycleLogs: Record<string, any>;
    bucketSyncTimers: Record<string, ReturnType<typeof setTimeout>>;
    letterSyncTimers: Record<string, ReturnType<typeof setTimeout>>;
    cycleLogSyncTimers: Record<string, ReturnType<typeof setTimeout>>;
    fetchData: (userId: string) => () => void;
    syncNow: () => Promise<void>;
    updateBucketItemOptimistic: (id: string, isCompleted: boolean) => void;
    addBucketItemOptimistic: (title: string, isPrivate?: boolean) => void;
    deleteBucketItemOptimistic: (id: string) => void;
    updateLetterReadOptimistic: (id: string, isRead: boolean) => void;
    logSymptomsOptimistic: (userId: string, symptoms: string[]) => void;
    logSexDriveOptimistic: (userId: string, level: string) => void;
    submitMoodOptimistic: (userId: string, emoji: string, note?: string) => void;
    clearMoodOptimistic: (userId: string) => void;
    deleteMemoryOptimistic: (memory: any) => void;
    resetData: () => void;
}

export const createDataSlice: StateCreator<DataSlice & any> = (set, get) => ({
    memories: [],
    polaroids: [],
    letters: [],
    moods: [],
    bucketList: [],
    milestones: {},
    cycleLogs: {},
    cycleLogSyncTimers: {},
    bucketSyncTimers: {},
    letterSyncTimers: {},

    fetchData: (userId: string) => {
        const state = get();
        const isInitialLoad = !state.profile;

        if (state.loading && state.profile?.id === userId) {
            return () => { };
        }

        if (isInitialLoad) {
            set({ loading: true });
        }

        // Best-in-Class: Instant Local Load
        const loadLocal = async () => {
            console.log("[DataSlice] Loading from local SQLite...");
            const [m, l, mo, b, p, profs] = await Promise.all([
                repository.getMemories(),
                repository.getLetters(),
                repository.getMoods(),
                repository.getBucketList(),
                repository.getPolaroids(),
                repository.getProfiles()
            ]);

            set((state: any) => {
                const currentBucketTimers = state.bucketSyncTimers || {};
                const currentLetterTimers = state.letterSyncTimers || {};

                const mergedBucket = b.map((item: any) => (
                    currentBucketTimers[item.id]
                        ? (state.bucketList.find((i: any) => i.id === item.id) || item)
                        : item
                ));

                const mergedLetters = l.map((item: any) => (
                    currentLetterTimers[item.id]
                        ? (state.letters.find((i: any) => i.id === item.id) || item)
                        : item
                ));

                const cachedMe = profs.find((u: any) => !u.is_partner);
                const cachedPartner = profs.find((u: any) => !!u.is_partner);

                return {
                    memories: m,
                    letters: mergedLetters,
                    moods: mo,
                    bucketList: mergedBucket,
                    polaroids: p,
                    profile: state.profile || cachedMe || null,
                    partnerProfile: state.partnerProfile || cachedPartner || null,
                    loading: false
                };
            });
            console.log("[DataSlice] Local load complete with conflict checks.");
        };
        loadLocal();

        const timeout = setTimeout(() => {
            if (get().loading) {
                console.warn("[Store] Loading safety timeout triggered after 8s");
                set({ loading: false });
            }
        }, 8000);

        let unsubs: Unsubscribe[] = [];
        let coupleUnsubs: Unsubscribe[] = [];
        let currentCoupleId: string | null = null;

        const clearCoupleUnsubs = () => {
            coupleUnsubs.forEach(u => u());
            coupleUnsubs = [];
        };

        // Token handling is now centralized in Index.tsx to avoid redundancy
        // Store just reads it from useOrbitStore.getState().idToken when needed

        const userRef = doc(db, 'users', userId);
        const unsubUser = onSnapshot(userRef, (snapshot) => {
            const profileData = snapshot.data();
            const newCoupleId = profileData?.couple_id;

            // Only update wallpaperConfig from Firestore when it has an explicit value set.
            // This prevents the snapshot listener from overwriting the user's optimistic
            // local selection before the Firestore write has propagated back.
            const updates: any = {
                profile: { id: snapshot.id, ...profileData },
            };
            const canApplyRemoteWallpaper = Date.now() >= (get().wallpaperConfigDirtyUntil || 0);
            if (profileData?.wallpaper_mode && canApplyRemoteWallpaper) {
                const remoteMode = profileData.wallpaper_mode;
                const normalizedMode =
                    remoteMode === 'custom' || remoteMode === 'shared'
                        ? remoteMode
                        : 'stars';
                updates.wallpaperConfig = {
                    mode: normalizedMode,
                    grayscale: !!profileData?.wallpaper_grayscale,
                    filter: profileData?.wallpaper_filter || 'Natural',
                };
            }
            set(updates);
            if (profileData) repository.saveProfile(snapshot.id, profileData, false);


            if (newCoupleId !== currentCoupleId) {
                clearCoupleUnsubs();
                currentCoupleId = newCoupleId;

                if (newCoupleId) {
                    const coupleId = newCoupleId;
                    const coupleRef = doc(db, 'couples', coupleId);

                    // Best-in-Class: Run Delta Syncs in parallel background
                    const runSyncs = async () => {
                        console.log("[DataSlice] Background Delta Sync started...");
                        const { runBackgroundCleanup } = await import('../CleanupService');
                        const results = await Promise.all([
                            repository.syncCollection('memories', coupleId, memoriesTable, 'memories'),
                            repository.syncCollection('letters', coupleId, lettersTable, 'letters'),
                            repository.syncCollection('moods', coupleId, moodsTable, 'moods'),
                            repository.syncCollection('bucket_list', coupleId, bucketTable, 'bucket_list'),
                            repository.syncCollection('polaroids', coupleId, polaroidsTable, 'polaroids'),
                            runBackgroundCleanup(), // Purge expired 3-day polaroids
                        ]);

                        // If any sync found changes, refresh the store from SQLite
                        if (results.some(r => r === true)) {
                            console.log("[DataSlice] Sync found changes, refreshing store.");
                            loadLocal();
                        }
                    };
                    runSyncs();

                    const unsubCouple = onSnapshot(coupleRef, async (coupleSnap) => {
                        const coupleData = coupleSnap.data();
                        set({
                            couple: { id: coupleSnap.id, ...coupleData },
                            loading: false
                        });

                        const partnerId = coupleData?.user1_id === userId ? coupleData?.user2_id : coupleData?.user1_id;
                        if (partnerId) {
                            const partnerRef = doc(db, 'users', partnerId);
                            const unsubPartner = onSnapshot(partnerRef, (partnerSnap) => {
                                set({ partnerProfile: { id: partnerSnap.id, ...partnerSnap.data() } as any });
                            });
                            coupleUnsubs.push(unsubPartner);
                        }
                    });
                    coupleUnsubs.push(unsubCouple);

                    // Direct Firestore listeners for memories + polaroids so images
                    // always render correctly, bypassing any SQLite cache issues.
                    const memoriesRef = collection(db, 'couples', coupleId, 'memories');
                    const unsubMemories = onSnapshot(
                        query(memoriesRef, orderBy('created_at', 'desc'), limit(50)),
                        (snap) => {
                            const mems = snap.docs.map(d => {
                                const data = d.data();
                                const imageUrls = Array.isArray(data.image_urls) ? data.image_urls : (data.image_url ? [data.image_url] : []);
                                return {
                                    ...data,
                                    id: d.id,
                                    image_url: imageUrls[0] || null,
                                    image_urls: imageUrls,
                                    read_by: Array.isArray(data.read_by) ? data.read_by : [],
                                    created_at: data.created_at?.toMillis?.() ?? data.created_at ?? null,
                                    updated_at: data.updated_at?.toMillis?.() ?? data.updated_at ?? null,
                                    memory_date: data.memory_date?.toMillis?.() ?? data.memory_date ?? null,
                                };
                            });
                            console.log('[DataSlice] Direct memories snapshot:', mems.length, 'memories');
                            set({ memories: mems });
                        }
                    );
                    coupleUnsubs.push(unsubMemories);

                    const polaroidsRef = collection(db, 'couples', coupleId, 'polaroids');
                    const lettersRef = collection(db, 'couples', coupleId, 'letters');
                    const unsubLetters = onSnapshot(
                        query(lettersRef, orderBy('created_at', 'desc'), limit(100)),
                        (snap) => {
                            const ls = snap.docs.map(d => {
                                const data = d.data();
                                return {
                                    ...data,
                                    id: d.id,
                                    title: data.title || data.subject || 'Untitled Letter',
                                    content: data.content || '',
                                    sender_id: data.sender_id || '',
                                    sender_name: data.sender_name || null,
                                    receiver_id: data.receiver_id || null,
                                    unlock_type: data.unlock_type || null,
                                    unlock_date: data.unlock_date || null,
                                    is_scheduled: !!data.is_scheduled,
                                    scheduled_delivery_time: typeof data.scheduled_delivery_time === 'number'
                                        ? data.scheduled_delivery_time
                                        : (data.scheduled_delivery_time?.toMillis?.() ?? null),
                                    is_vanish: !!data.is_vanish,
                                    is_read: !!data.is_read,
                                    created_at: data.created_at?.toMillis?.() ?? data.created_at ?? null,
                                    updated_at: data.updated_at?.toMillis?.() ?? data.updated_at ?? null,
                                };
                            });
                            set((state: any) => {
                                const currentTimers = state.letterSyncTimers || {};
                                const merged = ls.map((item: any) => (
                                    currentTimers[item.id]
                                        ? (state.letters.find((i: any) => i.id === item.id) || item)
                                        : item
                                ));
                                return { letters: merged };
                            });
                        }
                    );
                    coupleUnsubs.push(unsubLetters);

                    const moodsRef = collection(db, 'couples', coupleId, 'moods');
                    const today = getTodayIST();
                    const qMoods = query(moodsRef, where('mood_date', '==', today));

                    const unsubMoods = onSnapshot(qMoods, (snap) => {
                        const ms = snap.docs.map(d => {
                            const data = d.data() as any;
                            return {
                                ...data,
                                id: d.id,
                                created_at: data.created_at?.toMillis?.() ?? data.created_at ?? null,
                                updated_at: data.updated_at?.toMillis?.() ?? data.updated_at ?? null,
                            } as MoodData;
                        });
                        // Best-in-Class: Client-side Sort to avoid Firestore Index requirement (Failed Precondition Fix)
                        const sortedMoods = ms.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
                        console.log('[DataSlice] Real-time today moods snapshot:', sortedMoods.length, 'moods');
                        set({ moods: sortedMoods });
                    });
                    coupleUnsubs.push(unsubMoods);

                    const unsubPolaroids = onSnapshot(
                        query(polaroidsRef, orderBy('created_at', 'desc'), limit(20)),
                        (snap) => {
                            const pols = snap.docs.map(d => ({
                                ...d.data(),
                                id: d.id,
                                created_at: d.data().created_at?.toMillis?.() ?? d.data().created_at ?? null,
                            }));
                            set({ polaroids: pols });
                        }
                    );
                    coupleUnsubs.push(unsubPolaroids);


                    // We still keep specific listeners for high-priority real-time collections if needed,
                    // but Delta Sync handles the bulk optimization. 
                    // To keep it "Best in Class", we can actually keep onSnapshot for SMALL collections 
                    // and use Delta Sync for LARGE ones.

                    const milestonesRef = collection(db, 'couples', coupleId, 'milestones');
                    const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
                        const m: Record<string, any> = {};
                        snap.docs.forEach(d => {
                            m[d.id] = d.data();
                        });
                        set({ milestones: m });
                    });
                    coupleUnsubs.push(unsubMilestones);

                    const logsRef = collection(db, 'couples', coupleId, 'cycle_logs');
                    const unsubLogs = onSnapshot(logsRef, (snap) => {
                        const logs: Record<string, any> = {};
                        snap.docs.forEach(d => {
                            const data = d.data();
                            const uid = data.user_id;
                            if (!logs[uid]) logs[uid] = {};
                            logs[uid][data.log_date] = data;
                        });
                        set((state: any) => {
                            const nextLogs = { ...state.cycleLogs };
                            Object.keys(logs).forEach(uid => {
                                if (!nextLogs[uid]) nextLogs[uid] = {};
                                Object.keys(logs[uid]).forEach(date => {
                                    const timerKey = `${uid}_${date}`;
                                    if (state.cycleLogSyncTimers && state.cycleLogSyncTimers[timerKey]) {
                                        // Keep optimistic state, don't overwrite from server yet
                                        console.log(`[Store] Preserving optimistic state for log ${timerKey}`);
                                    } else {
                                        nextLogs[uid][date] = logs[uid][date];
                                    }
                                });
                            });
                            return { cycleLogs: nextLogs };
                        });
                    });
                    coupleUnsubs.push(unsubLogs);
                } else {
                    set({ loading: false });
                }
            }
        });

        unsubs.push(unsubUser);

        return () => {
            clearTimeout(timeout);
            unsubs.forEach(unsub => unsub());
            clearCoupleUnsubs();
        };
    },

    syncNow: async () => {
        const state = get();
        const coupleId = state.couple?.id;
        if (!coupleId) return;

        console.log("[DataSlice] Explicit Delta Sync triggered...");
        const results = await Promise.all([
            repository.syncCollection('memories', coupleId, memoriesTable, 'memories'),
            repository.syncCollection('letters', coupleId, lettersTable, 'letters'),
            repository.syncCollection('moods', coupleId, moodsTable, 'moods'),
            repository.syncCollection('bucket_list', coupleId, bucketTable, 'bucket_list'),
            repository.syncCollection('polaroids', coupleId, polaroidsTable, 'polaroids'),
        ]);

        if (results.some(r => r === true)) {
            const [m, l, mo, b, p] = await Promise.all([
                repository.getMemories(),
                repository.getLetters(),
                repository.getMoods(),
                repository.getBucketList(),
                repository.getPolaroids()
            ]);
            set({ memories: m, letters: l, moods: mo, bucketList: b, polaroids: p });
            console.log("[DataSlice] Explicit Delta Sync hydrated to state.");
        }
    },

    updateBucketItemOptimistic: (id: string, isCompleted: boolean) => {
        // 1. INSTANT: UI Update
        set((state: any) => ({
            bucketList: (state.bucketList || []).map((item: any) =>
                item.id === id ? { ...item, is_completed: isCompleted } : item
            )
        }));

        // 2. DEFERRED: Local Persistence & Cloud Sync
        // We defer this so the UI update above can happen in THIS frame.
        setTimeout(async () => {
            repository.updateBucketItemStatus(id, isCompleted);

            const state = get();
            const timers = state.bucketSyncTimers || {};
            if (timers[id]) {
                clearTimeout(timers[id]);
            }

            // GUARD: Don't sync temp IDs to Firestore
            if (id.toString().startsWith('temp_')) {
                console.log(`[Store] Skipping bucket sync for temp ID: ${id}`);
                return;
            }

            const newTimer = setTimeout(async () => {
                const { toggleBucketItem: syncFn } = await import('../auth');
                console.log(`[Store] INTERACTION tier sync (2s) triggered for bucket ${id}`);
                await syncFn(id, isCompleted);

                set((s: any) => {
                    const nextTimers = { ...(s.bucketSyncTimers || {}) };
                    if (nextTimers[id]) delete nextTimers[id];
                    return { bucketSyncTimers: nextTimers };
                });
            }, SYNC_COOLDOWN.INTERACTION);

            set((s: any) => ({
                bucketSyncTimers: { ...(s.bucketSyncTimers || {}), [id]: newTimer }
            }));
        }, 0);
    },

    updateLetterReadOptimistic: (id: string, isRead: boolean) => {
        // 1. INSTANT: UI Update
        set((state: any) => ({
            letters: (state.letters || []).map((item: any) =>
                item.id === id ? { ...item, is_read: isRead } : item
            )
        }));

        // 2. DEFERRED: Local Persistence & Cloud Sync
        setTimeout(async () => {
            repository.updateLetterReadStatus(id, isRead);

            const state = get();
            const timers = state.letterSyncTimers || {};
            if (timers[id]) {
                clearTimeout(timers[id]);
            }

            const newTimer = setTimeout(async () => {
                const { updateLetterReadStatus: syncFn } = await import('../auth');
                console.log(`[Store] READ_RECEIPT tier sync (5s) triggered for letter ${id}`);
                await syncFn(id, isRead);

                set((s: any) => {
                    const nextTimers = { ...(s.letterSyncTimers || {}) };
                    if (nextTimers[id]) delete nextTimers[id];
                    return { letterSyncTimers: nextTimers };
                });
            }, SYNC_COOLDOWN.READ_RECEIPT);

            set((s: any) => ({
                letterSyncTimers: { ...(s.letterSyncTimers || {}), [id]: newTimer }
            }));
        }, 0);
    },

    logSymptomsOptimistic: (userId: string, symptoms: string[]) => {
        const today = getTodayIST();

        // 1. INSTANT: UI Update
        set((state: any) => {
            const nextLogs = { ...state.cycleLogs };
            if (!nextLogs[userId]) nextLogs[userId] = {};
            nextLogs[userId][today] = {
                ...nextLogs[userId][today],
                user_id: userId,
                log_date: today,
                symptoms,
                updated_at: new Date().toISOString()
            };
            return { cycleLogs: nextLogs };
        });

        // 2. DEFERRED: Cloud Sync
        setTimeout(async () => {
            const state = get();
            const timerKey = `${userId}_${today}`;
            const timers = state.cycleLogSyncTimers || {};

            if (timers[timerKey]) {
                clearTimeout(timers[timerKey]);
            }

            const newTimer = setTimeout(async () => {
                const { logSymptoms: syncFn } = await import('../auth');
                console.log(`[Store] VITAL_STATS tier sync (3s) triggered for symptoms`);
                await syncFn(symptoms, { notifyPartner: false });

                set((s: any) => {
                    const nextTimers = { ...(s.cycleLogSyncTimers || {}) };
                    if (nextTimers[timerKey]) delete nextTimers[timerKey];
                    return { cycleLogSyncTimers: nextTimers };
                });
            }, SYNC_COOLDOWN.VITAL_STATS);

            set((s: any) => ({
                cycleLogSyncTimers: { ...(s.cycleLogSyncTimers || {}), [timerKey]: newTimer }
            }));
        }, 0);
    },

    addBucketItemOptimistic: (title: string, isPrivate: boolean = false) => {
        const tempId = `temp_${Date.now()}`;
        const userId = get().profile?.id;

        // 1. INSTANT: UI Update
        set((state: any) => ({
            bucketList: [
                {
                    id: tempId,
                    title,
                    is_completed: false,
                    is_private: isPrivate,
                    created_by: userId,
                    created_at: Date.now(),
                    updated_at: Date.now()
                } as any,
                ...(state.bucketList || [])
            ]
        }));

        // 2. DEFERRED: Local & Cloud
        setTimeout(async () => {
            try {
                const { addBucketItem } = await import('../auth');
                const result = await addBucketItem(title, '', isPrivate);

                if (result.success && result.id) {
                    // Swap temp ID for real ID in state
                    set((state: any) => ({
                        bucketList: (state.bucketList || []).map((item: any) =>
                            item.id === tempId ? { ...item, id: result.id } : item
                        )
                    }));

                    // Best-in-Class: Persistence swap
                    try {
                        await repository.getBucketList().then(list => set({ bucketList: list }));
                    } catch (repoErr) {
                        console.error("[Store] Repo update error after add:", repoErr);
                    }
                }
            } catch (err) {
                console.error("[Store] addBucketItemOptimistic background failure:", err);
            }
        }, 0);
    },

    deleteBucketItemOptimistic: (id: string) => {
        // 1. INSTANT: UI Update
        set((state: any) => ({
            bucketList: (state.bucketList || []).filter((item: any) => item.id !== id)
        }));

        // 2. DEFERRED: Local & Cloud
        setTimeout(async () => {
            repository.deleteBucketItem(id);

            // GUARD: Don't hit Firestore for temp IDs
            if (id.startsWith('temp_')) return;

            const { deleteBucketItem: syncFn } = await import('../auth');
            await syncFn(id);
        }, 0);
    },

    logSexDriveOptimistic: (userId: string, level: string) => {
        const today = getTodayIST();
        const timerKey = `${userId}_${today}_libido`;

        // 1. INSTANT: UI Update
        set((state: any) => {
            const nextLogs = { ...state.cycleLogs };
            if (!nextLogs[userId]) nextLogs[userId] = {};
            nextLogs[userId][today] = {
                ...nextLogs[userId][today],
                user_id: userId,
                log_date: today,
                sex_drive: level,
                updated_at: new Date().toISOString()
            };
            return { cycleLogs: nextLogs };
        });

        // 2. DEFERRED: Sync with cooldown
        setTimeout(() => {
            const state = get();
            const timers = state.cycleLogSyncTimers || {};
            if (timers[timerKey]) clearTimeout(timers[timerKey]);

            const newTimer = setTimeout(async () => {
                const { logSexDrive: syncFn } = await import('../auth');
                console.log(`[Store] VITAL_STATS tier (3s) triggered for libido`);
                await syncFn(level);

                set((s: any) => {
                    const nextTimers = { ...(s.cycleLogSyncTimers || {}) };
                    if (nextTimers[timerKey]) delete nextTimers[timerKey];
                    return { cycleLogSyncTimers: nextTimers };
                });
            }, SYNC_COOLDOWN.VITAL_STATS);

            set((s: any) => ({
                cycleLogSyncTimers: { ...(s.cycleLogSyncTimers || {}), [timerKey]: newTimer }
            }));
        }, 0);
    },

    submitMoodOptimistic: (userId: string, emoji: string, note: string = '') => {
        const today = getTodayIST();

        // CONSECUTIVE RESET: If current latest mood is same, clear it
        const currentMoods = (get().moods || []).filter((m: any) => m.user_id === userId && m.mood_date === today);
        const latest = currentMoods[0];

        if (latest && latest.emoji === emoji) {
            console.log(`[Store] Consecutive mood detected (${emoji}), clearing instead.`);
            get().clearMoodOptimistic(userId);
            return;
        }

        const tempId = `temp_mood_${Date.now()}`;

        // 1. INSTANT: UI Update
        set((state: any) => ({
            moods: [
                {
                    id: tempId,
                    user_id: userId,
                    emoji,
                    mood_text: note,
                    mood_date: today,
                    created_at: Date.now()
                } as any,
                ...(state.moods || []).filter((m: any) => !(m.user_id === userId && m.mood_date === today))
            ]
        }));

        // 2. DEFERRED: Local & Cloud
        setTimeout(async () => {
            try {
                const { submitMood: syncFn } = await import('../auth');
                const result = await syncFn(emoji, note);
                if (result.success) {
                    repository.getMoods().then(list => set({ moods: list }));
                }
            } catch (err) {
                console.error("[Store] submitMoodOptimistic failed:", err);
            }
        }, 0);
    },

    clearMoodOptimistic: (userId: string) => {
        const today = getTodayIST();

        // 1. INSTANT: UI Update
        set((state: any) => ({
            moods: (state.moods || []).filter((m: any) => !(m.user_id === userId && m.mood_date === today))
        }));

        // 2. DEFERRED: Local & Cloud
        setTimeout(async () => {
            try {
                const { clearMood: syncFn } = await import('../auth');
                await syncFn();
                repository.getMoods().then(list => set({ moods: list }));
            } catch (err) {
                console.error("[Store] clearMoodOptimistic failed:", err);
            }
        }, 0);
    },

    deleteMemoryOptimistic: (memory: any) => {
        // 1. INSTANT: UI Update
        set((state: any) => ({
            memories: (state.memories || []).filter((m: any) => m.id !== memory.id)
        }));

        // 2. DEFERRED: Cloud Sync (Cleanup R2 + Firebase)
        setTimeout(async () => {
            const { deleteMemory } = await import('../auth');
            await deleteMemory(memory);
        }, 0);
    },

    resetData: () => {
        set({
            memories: [],
            polaroids: [],
            letters: [],
            moods: [],
            bucketList: [],
            milestones: {},
            cycleLogs: {},
            cycleLogSyncTimers: {},
            bucketSyncTimers: {},
            letterSyncTimers: {},
            profile: null,
            partnerProfile: null,
            loading: false,
            idToken: null,
            couple: null
        });
    }
});
