import { db, auth } from '@/lib/firebase/client'
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit as firestoreLimit, Timestamp } from 'firebase/firestore'
import { orbitFetch } from '@/lib/client/network'
import { getTodayIST } from '@/lib/utils'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'

let dashboardInFlight: Promise<any> | null = null;
let lastDashboardSyncAt = 0;
const SYNC_COOLDOWN_MS = 30000;
const dashDebug = (...args: any[]) => {
    if (typeof window === 'undefined') return
    try {
        if (localStorage.getItem('orbit:debug:sync') === '1') console.log(...args)
    } catch { }
}

const DASHBOARD_CACHE_VERSION = 3

type DashboardCacheEnvelope = {
    version: number
    lastSyncedAt: string
    data: any
}

function sanitizeDashboardCacheData(input: any): any {
    if (!input || typeof input !== 'object') return null
    const next = { ...input }
    delete next.lastDeltaSyncs
    delete next.lastFullSyncAt
    return next
}

export function readDashboardCache(cacheKey: string): { data: any | null, lastSyncedAt: string | null } {
    const raw = readOfflineCache<any>(cacheKey)
    if (!raw) return { data: null, lastSyncedAt: null }

    if (
        typeof raw === 'object' &&
        raw !== null &&
        raw.version === DASHBOARD_CACHE_VERSION &&
        typeof raw.lastSyncedAt === 'string' &&
        'data' in raw
    ) {
        const envelope = raw as DashboardCacheEnvelope
        return { data: sanitizeDashboardCacheData(envelope.data), lastSyncedAt: envelope.lastSyncedAt }
    }
    return { data: sanitizeDashboardCacheData(raw), lastSyncedAt: null }
}

function writeDashboardCache(cacheKey: string, data: any) {
    const envelope: DashboardCacheEnvelope = {
        version: DASHBOARD_CACHE_VERSION,
        lastSyncedAt: new Date().toISOString(),
        data: sanitizeDashboardCacheData(data),
    }
    writeOfflineCache(cacheKey, envelope)
}

function mergeRecentById(existing: any[] = [], incoming: any[] = [], limitNum = 30) {
    const merged = new Map<string, any>()
    for (const item of existing) {
        if (item?.id) merged.set(String(item.id), item)
    }
    for (const item of incoming) {
        if (item?.id) merged.set(String(item.id), item)
    }

    return Array.from(merged.values())
        .map((row: any) => ({
            ...row,
            log_date: row.log_date || row.date || row.created_at
        }))
        .sort((a: any, b: any) => new Date(b.log_date || b.updated_at || b.created_at || 0).getTime() - new Date(a.log_date || a.updated_at || a.created_at || 0).getTime())
        .slice(0, limitNum)
}

export async function getCachedDashboardData() {
    const user = auth.currentUser;
    if (!user) return null
    const { data } = readDashboardCache(`dashboard:${user.uid}`)
    return data
}

export async function getCoreDashboardData(providedUser?: any, providedCoupleId?: string, force = false) {
    const now = Date.now();
    if (dashboardInFlight) return dashboardInFlight;

    if (!force && (now - lastDashboardSyncAt < SYNC_COOLDOWN_MS)) {
        const cached = await getCachedDashboardData();
        return { success: true, data: cached, cached: true, reason: 'cooldown' };
    }

    dashboardInFlight = (async () => {
        try {
            const user = providedUser || auth.currentUser;
            if (!user) return { success: false, error: 'Not authenticated' }

            const cacheKey = `dashboard:${user.uid}`
            const { data: cachedData, lastSyncedAt } = readDashboardCache(cacheKey)

            if (typeof navigator !== 'undefined' && navigator.onLine === false && cachedData) {
                return { success: true, data: cachedData, cached: true }
            }

            // 1. Try Consolidated API first
            try {
                const apiPath = '/api/sync/consolidated';
                const vercelUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '';
                const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
                const targetUrl = isNative ? (vercelUrl + apiPath) : apiPath;

                const response = await orbitFetch(targetUrl);
                if (response.ok) {
                    const aggregate = await response.json();
                    const nextData = {
                        ...cachedData,
                        ...aggregate,
                        currentDateIST: getTodayIST()
                    };
                    writeDashboardCache(cacheKey, nextData);
                    lastDashboardSyncAt = Date.now();
                    return { success: true, data: nextData, incremental: !!cachedData };
                }
            } catch (err) {
                console.warn('[Consolidated API] Fallback to direct Firestore', err);
            }

            // 2. Direct Firestore fallback
            let coupleId = providedCoupleId || cachedData?.profile?.couple_id;
            let profile = cachedData?.profile;

            if (!profile || !coupleId) {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (!userDoc.exists()) return { success: false, error: 'Profile not found' };
                profile = { id: user.uid, ...userDoc.data() };
                coupleId = profile.couple_id;
            }

            if (!coupleId) return { success: true, data: { profile } };

            const coupleDoc = await getDoc(doc(db, 'couples', coupleId));
            const coupleData = coupleDoc.data();
            const partnerId = coupleData?.user1_id === user.uid ? coupleData?.user2_id : coupleData?.user1_id;

            // Simple fetches for basic dashboard
            const [memoriesSnap, bucketSnap, cycleSnap] = await Promise.all([
                getDocs(query(collection(db, 'couples', coupleId, 'memories'), orderBy('created_at', 'desc'), firestoreLimit(20))),
                getDocs(query(collection(db, 'couples', coupleId, 'bucket_list'), orderBy('created_at', 'desc'))),
                getDocs(query(collection(db, 'couples', coupleId, 'cycle_logs'), orderBy('log_date', 'desc'), firestoreLimit(10)))
            ]);

            const nextData = {
                ...cachedData,
                profile,
                couple: { id: coupleId, ...coupleData },
                memories: memoriesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                bucketList: bucketSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                cycleLogs: cycleSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                currentDateIST: getTodayIST()
            };

            writeDashboardCache(cacheKey, nextData);
            lastDashboardSyncAt = Date.now();
            return { success: true, data: nextData, incremental: !!cachedData };

        } catch (e: any) {
            console.error('[Consolidated-Client] Error:', e);
            return { success: false, error: e.message };
        } finally {
            dashboardInFlight = null;
        }
    })();

    return dashboardInFlight;
}

export async function fetchBucketListData(coupleId: string) {
    const q = query(collection(db, 'couples', coupleId, 'bucket_list'), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchOnThisDayData(coupleId: string) {
    // Client-side JS filtering for "On This Day"
    const snap = await getDocs(collection(db, 'couples', coupleId, 'memories'));
    const today = getTodayIST();
    const [_, m, d] = today.split('-').map(Number);

    const memories = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(mry => {
            const dateStr = mry.memory_date || mry.created_at;
            if (!dateStr) return false;
            const dt = new Date(dateStr);
            return (dt.getMonth() + 1) === m && dt.getDate() === d;
        });

    return { memories, milestones: [] };
}
