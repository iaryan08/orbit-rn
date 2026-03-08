import { StateCreator } from 'zustand';
import { MemoryData, PolaroidData, LetterData, MoodData, BucketItem } from './types';
import { db, storage, auth } from '../firebase';
import { doc, onSnapshot, collection, query, orderBy, Unsubscribe, limit } from 'firebase/firestore';
import { repository } from '../repository';
import { memories as memoriesTable, letters as lettersTable, moods as moodsTable, bucketList as bucketTable, polaroids as polaroidsTable } from '../db/schema';

export interface DataSlice {
    memories: MemoryData[];
    polaroids: PolaroidData[];
    letters: LetterData[];
    moods: MoodData[];
    bucketList: BucketItem[];
    milestones: Record<string, any>;
    cycleLogs: Record<string, any>;
    fetchData: (userId: string) => () => void;
}

export const createDataSlice: StateCreator<DataSlice & any> = (set, get) => ({
    memories: [],
    polaroids: [],
    letters: [],
    moods: [],
    bucketList: [],
    milestones: {},
    cycleLogs: {},

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
            const [m, l, mo, b] = await Promise.all([
                repository.getMemories(),
                repository.getLetters(),
                repository.getMoods(),
                repository.getBucketList()
            ]);
            set({
                memories: m,
                letters: l,
                moods: mo,
                bucketList: b,
                loading: false // Stop full-screen loader immediately
            });
            console.log("[DataSlice] Local load complete.");
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

        if (auth.currentUser) {
            auth.currentUser.getIdToken().then((token) => {
                set({ idToken: token });
            }).catch(err => console.error("[Store] Error getting ID token:", err));
        }

        const userRef = doc(db, 'users', userId);
        const unsubUser = onSnapshot(userRef, (snapshot) => {
            const profileData = snapshot.data();
            const newCoupleId = profileData?.couple_id;

            set({
                profile: { id: snapshot.id, ...profileData },
                wallpaperConfig: {
                    mode: profileData?.wallpaper_mode || 'stars',
                    grayscale: !!profileData?.wallpaper_grayscale,
                    filter: profileData?.wallpaper_filter || 'Natural',
                }
            });

            if (newCoupleId !== currentCoupleId) {
                clearCoupleUnsubs();
                currentCoupleId = newCoupleId;

                if (newCoupleId) {
                    const coupleId = newCoupleId;
                    const coupleRef = doc(db, 'couples', coupleId);

                    // Best-in-Class: Run Delta Syncs in parallel background
                    const runSyncs = async () => {
                        console.log("[DataSlice] Background Delta Sync started...");
                        const results = await Promise.all([
                            repository.syncCollection('memories', coupleId, memoriesTable, 'memories'),
                            repository.syncCollection('letters', coupleId, lettersTable, 'letters'),
                            repository.syncCollection('moods', coupleId, moodsTable, 'moods'),
                            repository.syncCollection('bucket_list', coupleId, bucketTable, 'bucket_list'),
                            repository.syncCollection('polaroids', coupleId, polaroidsTable, 'polaroids'),
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
                        set({ cycleLogs: logs });
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
    }
});
