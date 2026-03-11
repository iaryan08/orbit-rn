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
            const { ref, remove } = require('firebase/database');

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

        // Show ultra-fast startup loader ONLY if cold boot with zero data
        const needsLoader = !state.profile && state.memories.length === 0;
        console.log("[DataSlice] fetchData starting. NeedsLoader:", needsLoader);
        if (needsLoader) {
            set({ loading: true });
        }

        // 🛡️ Safety Unlock: Ensure app is NEVER stuck for more than 7s
        const safetyUnlock = setTimeout(() => {
            if (get().loading) {
                console.warn("[DataSlice] Safety unlock triggered. Breaking boot hang.");
                set({ loading: false, fetchingUserId: null });
            }
        }, 7000);

        let isCleanedUp = false;

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
                if (cId && cId !== get().activeCoupleId) {
                    set({ activeCoupleId: cId });
                    subscribeToCoupleMetadata(cId);
                }
            });
            set((s: any) => ({ activeUnsubs: [...s.activeUnsubs, unsubUser] }));

            // Notifications Listener (user-scoped)
            const notifsRef = collection(db, 'users', userId, 'notifications');
            const unsubNotifications = onSnapshot(notifsRef, (snap) => {
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

        const subscribeToCoupleMetadata = (coupleId: string) => {
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
                    set({ activePartnerId: pId });
                    const pRef = doc(db, 'users', pId);
                    const unsubPartner = onSnapshot(pRef, (pSnap) => {
                        const pData = pSnap.data();
                        if (!pData || isCleanedUp) return;
                        const fullP = { id: pSnap.id, ...pData };
                        if (strip(get().partnerProfile) !== strip(fullP)) set({ partnerProfile: fullP });
                        repository.saveProfile(pSnap.id, pData, true);
                    });
                    set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubPartner] }));
                }
            });
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
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMusic] }));

            // 📍 INTNSTANT SYNC: Intimacy Milestones
            const milestonesRef = collection(db, 'couples', coupleId, 'milestones');
            const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
                const m: Record<string, any> = {};
                snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
                if (strip(get().milestones) !== strip(m)) set({ milestones: m });
            });
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
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubCycle] }));

            // 🕒 REAL-TIME MOOD SYNC (Bridge the ephemeral gap)
            const moodsRef = collection(db, 'couples', coupleId, 'moods');
            const unsubMoods = onSnapshot(query(moodsRef, orderBy('mood_date', 'desc'), limit(15)), (snap) => {
                const mo: any[] = [];
                snap.docs.forEach(d => mo.push({ id: d.id, ...d.data() }));
                const currentMoods = get().moods;
                const nextMoods = mergeCollections(currentMoods, mo as MoodData[]);
                if (strip(currentMoods) !== strip(nextMoods)) set({ moods: nextMoods });
            });
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubMoods] }));

            // ✉️ REAL-TIME LETTER SYNC (instant reflection like memories)
            const lettersRef = collection(db, 'couples', coupleId, 'letters');
            const unsubLetters = onSnapshot(query(lettersRef, orderBy('created_at', 'desc'), limit(200)), (snap) => {
                const nextLetters: any[] = [];
                snap.docs.forEach((d) => {
                    const data: any = d.data();
                    if (data?.deleted) return;
                    nextLetters.push({ id: d.id, ...data });
                });
                const currentLetters = get().letters;
                const merged = mergeCollections(currentLetters, nextLetters as LetterData[]);
                if (strip(currentLetters) !== strip(merged)) set({ letters: merged });
            });
            set((s: any) => ({ activeCoupleUnsubs: [...s.activeCoupleUnsubs, unsubLetters] }));
        };

        const performSilentDeltaSync = async (coupleId: string) => {
            if (isCleanedUp) return;
            // 1500ms is the sweet spot for JS hydration to finish
            await new Promise(r => setTimeout(r, 1500));
            if (isCleanedUp) return;

            set({ isSyncing: true });
            try {
                // High Priority: Moods
                const moodsChanged = await repository.syncCollection('moods', coupleId, moodsTable, 'moods');
                if (moodsChanged && !isCleanedUp) await bootstrapFromLocal();
                await new Promise(r => setTimeout(r, 400));

                // High Priority: Letters
                const lettersChanged = await repository.syncCollection('letters', coupleId, lettersTable, 'letters');
                if (lettersChanged && !isCleanedUp) await bootstrapFromLocal();
                await new Promise(r => setTimeout(r, 400));

                // High Priority: Polaroids
                const polaroidsChanged = await repository.syncCollection('polaroids', coupleId, polaroidsTable, 'polaroids');
                if (polaroidsChanged && !isCleanedUp) await bootstrapFromLocal();
                await new Promise(r => setTimeout(r, 400));

                // Medium Priority: Bucket List
                const bucketChanged = await repository.syncCollection('bucket_list', coupleId, bucketTable, 'bucket_list');
                if (bucketChanged && !isCleanedUp) await bootstrapFromLocal();

                const memsChanged = await repository.syncCollection('memories', coupleId, memoriesTable, 'memories');
                if (memsChanged && !isCleanedUp) await bootstrapFromLocal();

                // 🛡️ DATA LONGEVITY (Phase 3): Mirror assets to local storage after sync
                const { memories, polaroids, idToken, profile, partnerProfile } = get();
                if (idToken && !isCleanedUp) {
                    triggerMirroring(memories, polaroids, idToken, profile, partnerProfile);
                }

            } finally {
                set({ isSyncing: false });
            }
        };

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
                let c = null;
                if (myProfile?.couple_id) c = await repository.getCouple(myProfile.couple_id).catch(() => null);

                if (isCleanedUp) return;

                // Atomic Bootstrap: Load EVERYTHING from local in one go with MERGE to maintain references
                const [m, l, mo, b, p] = await Promise.all([
                    repository.getMemories().catch(() => []),
                    repository.getLetters().catch(() => []),
                    repository.getMoods().catch(() => []),
                    repository.getBucketList().catch(() => []),
                    repository.getPolaroids().catch(() => [])
                ]);

                if (isCleanedUp) return;

                const s = get();
                console.log("[DataSlice] Bootstrap from Local SUCCESS. Loading: false");
                set({
                    // Keep last known in-memory profile data during transient/local cache gaps
                    // to avoid "Partner" fallback flicker on first paint/re-hydration.
                    profile: myProfile || s.profile,
                    partnerProfile: pProfile || s.partnerProfile,
                    couple: c || s.couple,
                    memories: mergeCollections(s.memories, m as MemoryData[]),
                    letters: mergeCollections(s.letters, l as LetterData[]),
                    moods: mergeCollections(s.moods, mo as MoodData[]),
                    bucketList: mergeCollections(s.bucketList, b as BucketItem[]),
                    polaroids: mergeCollections(s.polaroids, p as PolaroidData[]),
                    loading: false
                });

            } catch (err) {
                console.error("[DataSlice] Bootstrap failed:", err);
                set({ loading: false });
            }
        };

        // 🚀 Boot Architecture: Run both paths in parallel
        // Vitals provide the most critical 'unblocking' data (profile/couple) from Cloud.
        // Local bootstrap provides the high-volume data (memories/letters) from SQLite.
        bootstrapFromLocal();
        setupVitalListeners();

        return () => {
            clearTimeout(safetyUnlock);
            isCleanedUp = true;
            const s = get();
            s.activeUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            s.activeCoupleUnsubs.forEach((u: any) => u && typeof u === 'function' && u());
            set({ activeUnsubs: [], activeCoupleUnsubs: [], fetchingUserId: null });
        };
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
        const { couple } = get();
        if (couple?.id) updateDoc(doc(db, 'couples', couple.id, 'bucket_list', id), { is_completed: isCompleted, updated_at: Timestamp.now() });
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
        const { cycleLogs } = get();
        const userLogs = { ...(cycleLogs[userId] || {}) };
        userLogs[today] = { ...(userLogs[today] || {}), symptoms, user_id: userId, log_date: today };
        set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });
        const { couple } = get();
        if (couple?.id) setDoc(doc(db, 'couples', couple.id, 'cycle_logs', `${userId}_${today}`), { user_id: userId, log_date: today, symptoms, updated_at: Timestamp.now() }, { merge: true });
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
        const { bucketList } = get();
        set({ bucketList: bucketList.filter((i: any) => i.id !== id) });
        repository.deleteBucketItem(id);
        const { couple } = get();
        if (couple?.id && !id.startsWith('temp_')) updateDoc(doc(db, 'couples', couple.id, 'bucket_list', id), { deleted: true, updated_at: Timestamp.now() });
    },

    logSexDriveOptimistic: (userId: string, level: string) => {
        const today = getTodayIST();
        const { cycleLogs } = get();
        const userLogs = { ...(cycleLogs[userId] || {}) };
        userLogs[today] = { ...(userLogs[today] || {}), sex_drive: level, user_id: userId, log_date: today };
        set({ cycleLogs: { ...cycleLogs, [userId]: userLogs } });
        const { couple } = get();
        if (couple?.id) setDoc(doc(db, 'couples', couple.id, 'cycle_logs', `${userId}_${today}`), { user_id: userId, log_date: today, sex_drive: level, updated_at: Timestamp.now() }, { merge: true });
    },

    submitMoodOptimistic: (userId: string, emoji: string, note: string = '') => {
        const today = getTodayIST();
        const moodId = `${userId}_${today}`;
        const { moods, couple } = get();
        const newMood: MoodData = { id: moodId, user_id: userId, emoji, mood_text: note, mood_date: today, created_at: Date.now() };

        // Use deterministic ID for optimistic update to match sync later
        set({ moods: [newMood, ...moods.filter((m: MoodData) => m.id !== moodId)] });

        // Sync to cloud
        if (couple?.id) {
            setDoc(doc(db, 'couples', couple.id, 'moods', `${userId}_${today}`), {
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
            const presenceRef = ref(rtdb, `presence/${couple.id}/${userId}`);
            update(presenceRef, {
                latest_mood: { emoji, note, timestamp: Date.now() },
                last_changed: serverTimestamp()
            });
        }
    },

    clearMoodOptimistic: (userId: string) => {
        const today = getTodayIST();
        const { moods, couple } = get();
        set({ moods: moods.filter((m: MoodData) => !(m.user_id === userId && m.mood_date === today)) });

        if (couple?.id) {
            // Delete mood for today in cloud
            deleteDoc(doc(db, 'couples', couple.id, 'moods', `${userId}_${today}`));
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

    sendHeartbeatOptimistic: () => {
        const { couple, profile } = get();
        if (!couple?.id || !profile?.id) return;

        // 💫 INTANT CONNECTION: Broadcast Spark to RTDB (Sync with Web)
        const { ref, set, update, serverTimestamp } = require('firebase/database');
        const vibeRef = ref(rtdb, `vibrations/${couple.id}`);
        set(vibeRef, {
            senderId: profile.id,
            timestamp: Date.now(),
            type: 'spark'
        });

        const presenceRef = ref(rtdb, `presence/${couple.id}/${profile.id}`);
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
