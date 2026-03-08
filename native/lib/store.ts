import { create } from 'zustand';
import { auth, db, rtdb } from './firebase';
import { doc, onSnapshot, collection, query, orderBy, Unsubscribe, limit } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';


interface PolaroidData {
    id: string;
    image_url: string;
    caption?: string;
    created_at: any;
    user_id?: string;
}

interface MemoryData {
    id: string;
    title: string;
    description?: string;
    image_url?: string;
    created_at: any;
}

interface LetterData {
    id: string;
    content: string;
    sender_id: string;
    created_at: any;
    is_read: boolean;
}

interface MoodData {
    id: string;
    emoji: string;
    mood_text: string | null;
    mood_date: string;
    user_id: string;
    created_at: any;
}

interface BucketItem {
    id: string;
    title: string;
    description?: string;
    is_completed: boolean;
    is_private: boolean;
    created_at: any;
    created_by: string;
}

interface OrbitState {
    profile: any | null;
    partnerProfile: any | null;
    couple: any | null;
    memories: MemoryData[];
    polaroids: PolaroidData[];
    letters: LetterData[];
    moods: MoodData[];
    bucketList: BucketItem[];
    milestones: Record<string, any>;
    cycleLogs: Record<string, any>; // [userId]: [logDate]: data
    idToken: string | null;
    loading: boolean;
    activeTabIndex: number;
    setTabIndex: (index: number) => void;
    isPagerScrollEnabled: boolean;
    setPagerScrollEnabled: (enabled: boolean) => void;
    setProfile: (profile: any) => void;
    setPartnerProfile: (profile: any) => void;
    setCouple: (couple: any) => void;
    isNotificationDrawerOpen: boolean;
    setNotificationDrawerOpen: (open: boolean) => void;
    isMoodDrawerOpen: boolean;
    setMoodDrawerOpen: (open: boolean) => void;
    appMode: 'moon' | 'lunara';
    setAppMode: (mode: 'moon' | 'lunara') => void;
    toggleAppMode: () => void;
    initAppMode: () => Promise<void>;
    // Optimistic Atmosphere State
    wallpaperConfig: {
        mode: 'stars' | 'custom' | 'shared';
        grayscale: boolean;
        filter: 'Natural' | 'Glass' | 'Tint' | 'Pro';
    };
    setWallpaperConfig: (config: Partial<OrbitState['wallpaperConfig']>) => void;
    isSearchOpen: boolean;
    setSearchOpen: (open: boolean) => void;
    mediaViewerState: {
        isOpen: boolean;
        imageUrls: string[];
        initialIndex: number;
        ownerId?: string;
        mediaId?: string;
        type?: 'memory' | 'polaroid';
    };
    openMediaViewer: (imageUrls: string[], initialIndex?: number, ownerId?: string, mediaId?: string, type?: 'memory' | 'polaroid') => void;
    closeMediaViewer: () => void;
    fetchData: (userId: string) => () => void;
}

export const useOrbitStore = create<OrbitState>((set, get) => ({
    profile: null,
    partnerProfile: null,
    couple: null,
    memories: [],
    polaroids: [],
    letters: [],
    moods: [],
    bucketList: [],
    milestones: {},
    cycleLogs: {},
    idToken: null,
    activeTabIndex: 1, // Default to Dashboard tab
    loading: true,
    isNotificationDrawerOpen: false,
    isPagerScrollEnabled: true,
    mediaViewerState: {
        isOpen: false,
        imageUrls: [],
        initialIndex: 0,
    },

    setProfile: (profile: any) => set({ profile }),
    setPartnerProfile: (partnerProfile: any) => set({ partnerProfile }),
    setCouple: (couple: any) => set({ couple }),
    setTabIndex: (index: number) => set({ activeTabIndex: index }),
    setNotificationDrawerOpen: (open: boolean) => set({ isNotificationDrawerOpen: open }),
    isMoodDrawerOpen: false,
    setMoodDrawerOpen: (open: boolean) => set({ isMoodDrawerOpen: open }),
    appMode: 'moon',
    setAppMode: (mode: 'moon' | 'lunara') => {
        AsyncStorage.setItem('orbit_app_mode', mode).catch(console.error);
        set({ appMode: mode });
    },
    toggleAppMode: () => set((state) => {
        const newMode = state.appMode === 'moon' ? 'lunara' : 'moon';
        AsyncStorage.setItem('orbit_app_mode', newMode).catch(console.error);
        return { appMode: newMode };
    }),
    initAppMode: async () => {
        try {
            const savedMode = await AsyncStorage.getItem('orbit_app_mode');
            if (savedMode === 'lunara') {
                set({ appMode: 'lunara', activeTabIndex: 6 }); // 6 is Lunara home
            } else {
                set({ appMode: 'moon', activeTabIndex: 1 }); // 1 is Dashboard
            }
        } catch (e) {
            console.error("Failed to load app mode", e);
            set({ appMode: 'moon', activeTabIndex: 1 });
        }
    },

    wallpaperConfig: {
        mode: 'stars',
        grayscale: false,
        filter: 'Natural',
    },
    setWallpaperConfig: (config) => set((state) => ({
        wallpaperConfig: { ...state.wallpaperConfig, ...config }
    })),
    isSearchOpen: false,
    setSearchOpen: (open: boolean) => set({ isSearchOpen: open }),
    setPagerScrollEnabled: (enabled: boolean) => set({ isPagerScrollEnabled: enabled }),
    openMediaViewer: (imageUrls, initialIndex = 0, ownerId, mediaId, type) => set({
        mediaViewerState: { isOpen: true, imageUrls, initialIndex, ownerId, mediaId, type }
    }),
    closeMediaViewer: () => set({
        mediaViewerState: { isOpen: false, imageUrls: [], initialIndex: 0, ownerId: undefined, mediaId: undefined, type: undefined }
    }),

    fetchData: (userId: string) => {
        const state = get();
        // Only show full-screen loader if we don't have basic profile data yet
        const isInitialLoad = !state.profile;

        if (get().loading && get().profile?.id === userId) {
            return () => { };
        }

        if (isInitialLoad) {
            set({ loading: true });
        }

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

        // Immediately get the ID token for image proxying
        auth.currentUser?.getIdToken().then((token) => {
            set({ idToken: token });
        });

        // Listen to user profile
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

            // Only restart sub-subscriptions if couple_id actually changed
            if (newCoupleId !== currentCoupleId) {
                clearCoupleUnsubs();
                currentCoupleId = newCoupleId;

                if (newCoupleId) {
                    const coupleId = newCoupleId;
                    // Listen to couple data
                    const coupleRef = doc(db, 'couples', coupleId);
                    const unsubCouple = onSnapshot(coupleRef, async (coupleSnap) => {
                        const coupleData = coupleSnap.data();
                        console.log("[Store] Couple snapshot received, setting loading false");
                        set({
                            couple: { id: coupleSnap.id, ...coupleData },
                            loading: false
                        });

                        // Find partner ID
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

                    // Listen to Polaroids
                    const polaroidsRef = collection(db, 'couples', coupleId, 'polaroids');
                    const qP = query(polaroidsRef, orderBy('created_at', 'desc'), limit(25));
                    const unsubPolaroids = onSnapshot(qP, (snap) => {
                        const p = snap.docs.map(d => {
                            const data = d.data();
                            const img = data.image_url || data.url || (data.image_urls && data.image_urls[0]);
                            return { id: d.id, ...data, image_url: img } as PolaroidData;
                        });
                        set({ polaroids: p });
                    });
                    coupleUnsubs.push(unsubPolaroids);

                    // Listen to Memories
                    const memoriesRef = collection(db, 'couples', coupleId, 'memories');
                    const qM = query(memoriesRef, orderBy('created_at', 'desc'), limit(25));
                    const unsubMemories = onSnapshot(qM, (snap) => {
                        const m = snap.docs.map(d => {
                            const data = d.data();
                            const img = data.image_url || data.url || (data.image_urls && data.image_urls[0]);
                            return { id: d.id, ...data, image_url: img } as MemoryData;
                        });
                        set({ memories: m });
                    });
                    coupleUnsubs.push(unsubMemories);

                    // Listen to Letters via Firestore
                    const lettersRef = collection(db, 'couples', coupleId, 'letters');
                    const qL = query(lettersRef, orderBy('created_at', 'desc'), limit(25));
                    const unsubLetters = onSnapshot(qL, (snap) => {
                        const l = snap.docs.map(d => ({ id: d.id, ...d.data() } as LetterData));
                        set({ letters: l });
                    });
                    coupleUnsubs.push(unsubLetters);

                    // Listen to Moods
                    const moodsRef = collection(db, 'couples', coupleId, 'moods');
                    const qMoods = query(moodsRef, orderBy('created_at', 'desc'));
                    const unsubMoods = onSnapshot(qMoods, (snap) => {
                        const mo = snap.docs.map(d => ({ id: d.id, ...d.data() } as MoodData));
                        set({ moods: mo });
                    });
                    coupleUnsubs.push(unsubMoods);

                    // Listen to Bucket List
                    const bucketRef = collection(db, 'couples', coupleId, 'bucket_list');
                    const qBucket = query(bucketRef, orderBy('created_at', 'desc'));
                    const unsubBucket = onSnapshot(qBucket, (snap) => {
                        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as BucketItem));
                        set({ bucketList: items });
                    });
                    coupleUnsubs.push(unsubBucket);

                    // Listen to Milestones
                    const milestonesRef = collection(db, 'couples', coupleId, 'milestones');
                    const unsubMilestones = onSnapshot(milestonesRef, (snap) => {
                        const m: Record<string, any> = {};
                        snap.docs.forEach(d => {
                            m[d.id] = d.data();
                        });
                        set({ milestones: m });
                    });
                    coupleUnsubs.push(unsubMilestones);

                    // Listen to Cycle Logs (Today's logs)
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
                    // No couple ID, stop loading
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
}));
