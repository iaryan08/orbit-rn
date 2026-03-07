import { createClient } from '@/lib/supabase/client'
import { orbitFetch } from '@/lib/client/network'
import { getTodayIST } from '@/lib/utils'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'
import { getClientUser } from '@/lib/client/get-user'

let dashboardInFlight: Promise<any> | null = null;
let lastDashboardSyncAt = 0;
const SYNC_COOLDOWN_MS = 30000; // 30s deduplication window for dashboard thermal stability
const dashDebug = (...args: any[]) => {
    if (typeof window === 'undefined') return
    try {
        if (localStorage.getItem('orbit:debug:sync') === '1') console.log(...args)
    } catch { }
}

const isValidId = (id: any): id is string => typeof id === 'string' && id !== 'undefined' && id.length > 0;

const DASHBOARD_CACHE_VERSION = 3
const SCHEMA_COLUMN_SUPPORT_KEY_PREFIX = 'orbit:schema:column-support'

type DashboardCacheEnvelope = {
    version: number
    lastSyncedAt: string
    data: any
}

function sanitizeDashboardCacheData(input: any): any {
    if (!input || typeof input !== 'object') return null
    const next = { ...input }
    // Tab-level lists/sync timers are handled by tab sync, not dashboard cache.
    // letters now included in consolidated sync for "instant" dashboard view.
    // delete next.letters
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

    // Backward compatibility for previous cache shape where data was stored directly.
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

function mergeRecentById(existing: any[] = [], incoming: any[] = [], limit = 30) {
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
        .slice(0, limit)
}

function hasRecentRow(rows: any[] | null | undefined) {
    return Array.isArray(rows) && rows.length > 0
}

function getColumnSupport(table: string, column: string): boolean | null {
    if (typeof window === 'undefined') return null
    const key = `${SCHEMA_COLUMN_SUPPORT_KEY_PREFIX}:${table}:${column}`
    const raw = localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
    return null
}

function setColumnSupport(table: string, column: string, supported: boolean) {
    if (typeof window === 'undefined') return
    const key = `${SCHEMA_COLUMN_SUPPORT_KEY_PREFIX}:${table}:${column}`
    localStorage.setItem(key, supported ? '1' : '0')
}

function isMissingColumnError(error: any, column: string) {
    const msg = String(error?.message || '').toLowerCase()
    const details = String(error?.details || '').toLowerCase()
    const hint = String(error?.hint || '').toLowerCase()
    const combined = `${msg} ${details} ${hint}`
    return combined.includes(column.toLowerCase()) && (combined.includes('column') || combined.includes('schema'))
}

export async function getCachedDashboardData() {
    const supabase = createClient()
    const user = await getClientUser(supabase)
    if (!user) return null

    const { data } = readDashboardCache(`dashboard:${user.id}`)
    return data
}

export async function getCoreDashboardData(providedUser?: any, providedCoupleId?: string, force = false) {
    const now = Date.now();

    // 1. Deduplication & Cooldown Logic
    if (dashboardInFlight) return dashboardInFlight;

    if (!force && (now - lastDashboardSyncAt < SYNC_COOLDOWN_MS)) {
        dashDebug(`[Orbit-Dashboard] Skipping sync (cooldown active: ${Math.round((SYNC_COOLDOWN_MS - (now - lastDashboardSyncAt)) / 1000)}s)`);
        const cached = await getCachedDashboardData();
        return { success: true, data: cached, cached: true, reason: 'cooldown' };
    }

    dashboardInFlight = (async () => {
        try {
            const supabase = createClient()
            const user = providedUser || await getClientUser(supabase)
            if (!user) return { success: false, error: 'Not authenticated' }

            dashDebug(`[Orbit-Dashboard] Fetching core data for ${user.id}...`)

            const cacheKey = `dashboard:${user.id}`
            const { data: cachedData, lastSyncedAt } = readDashboardCache(cacheKey)

            const offlineFallback = (errorMessage: string) => {
                if (cachedData) {
                    return { success: true, data: cachedData, cached: true, error: errorMessage }
                }
                return { success: false, error: errorMessage }
            }

            if (typeof navigator !== 'undefined' && navigator.onLine === false && cachedData) {
                return { success: true, data: cachedData, cached: true }
            }

            const syncBufferMs = 60 * 1000
            let incrementalSince = new Date(0).toISOString()
            if (lastSyncedAt) {
                const parsed = new Date(lastSyncedAt)
                if (!Number.isNaN(parsed.getTime())) {
                    incrementalSince = new Date(parsed.getTime() - syncBufferMs).toISOString()
                }
            }
            const rolloutStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const moodSince = rolloutStart

            // 2. Try Consolidated API first
            try {
                const apiPath = '/api/sync/consolidated';
                const vercelUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '';
                const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

                const targetUrl = isNative ? (vercelUrl + apiPath) : apiPath;

                dashDebug(`[Orbit-Dashboard] Trying consolidated sync via ${targetUrl}...`);
                const response = await orbitFetch(targetUrl);

                if (response.ok) {
                    const aggregate = await response.json();

                    const nextData = {
                        ...cachedData,
                        ...aggregate,
                        memories: Array.isArray(aggregate.memories) ? aggregate.memories : (cachedData?.memories || []),
                        bucketList: Array.isArray(aggregate.bucketList) ? aggregate.bucketList : (cachedData?.bucketList || []),
                        cycleLogs: mergeRecentById(cachedData?.cycleLogs || [], aggregate.cycleLogs || [], 100),
                        supportLogs: mergeRecentById(cachedData?.supportLogs || [], aggregate.supportLogs || [], 100),
                        letters: Array.isArray(aggregate.letters) ? aggregate.letters : (cachedData?.letters || []),
                        unreadMemoriesCount: aggregate.unreadMemoriesCount ?? cachedData?.unreadMemoriesCount ?? 0,
                        unreadLettersCount: aggregate.unreadLettersCount ?? cachedData?.unreadLettersCount ?? 0,
                        currentDateIST: getTodayIST()
                    };

                    writeDashboardCache(cacheKey, nextData);
                    lastDashboardSyncAt = Date.now();
                    dashDebug(`[Orbit-Dashboard] Consolidated sync successful (merged)!`);
                    return { success: true, data: nextData, incremental: !!cachedData };
                } else {
                    console.warn(`[Orbit-Dashboard] Consolidated API returned ${response.status}`);
                }
            } catch (err) {
                console.warn('[Orbit-Dashboard] Consolidated API failed, falling back to individual fetches', err);
            }

            let coupleId = providedCoupleId
            let effectiveProfile = cachedData?.profile

            if (!coupleId || !effectiveProfile) {
                const { data: profile, error: pError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                if (pError) {
                    console.error('[Orbit-Dashboard] Profile fetch failed:', pError)
                    return offlineFallback('Profile fetch error')
                }
                effectiveProfile = profile
                coupleId = profile?.couple_id
            }

            let partnerId = effectiveProfile?.partner_id

            if (!partnerId && coupleId) {
                const { data: coupleData } = await supabase
                    .from('couples')
                    .select('user1_id, user2_id')
                    .eq('id', coupleId)
                    .single()

                if (coupleData) {
                    partnerId = (coupleData.user1_id === user.id) ? coupleData.user2_id : coupleData.user1_id
                }
            }

            const [
                pProfileRes,
                coupleRes,
                userCycleRes,
                partnerCycleRes,
                pMoodsRes,
                uMoodsRes,
                userPolaroidRes,
                partnerPolaroidRes,
                doodleRes,
                bucketListRes,
                onThisDayRes,
                cycleLogsRes,
                supportLogsRes,
            ] = await Promise.all([
                isValidId(partnerId) ? supabase.from('profiles').select('*').eq('id', partnerId).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                isValidId(coupleId) ? supabase.from('couples').select('*').eq('id', coupleId).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                supabase.from('cycle_profiles').select('*').eq('user_id', user.id).maybeSingle(),
                isValidId(partnerId) ? supabase.from('cycle_profiles').select('*').eq('user_id', partnerId).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                isValidId(partnerId) ? supabase.from('moods').select('id, created_at, emoji, mood_text, mood:emoji, note:mood_text').eq('user_id', partnerId).gte('created_at', moodSince).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
                supabase.from('moods').select('id, created_at, emoji, mood_text, mood:emoji, note:mood_text').eq('user_id', user.id).gte('created_at', moodSince).order('created_at', { ascending: false }),
                isValidId(coupleId) ? supabase.from('polaroids').select('*').eq('couple_id', coupleId).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                (isValidId(coupleId) && isValidId(partnerId)) ? supabase.from('polaroids').select('*').eq('couple_id', coupleId).eq('user_id', partnerId).order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                isValidId(coupleId) ? supabase.from('doodles').select('*').eq('couple_id', coupleId).order('updated_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
                isValidId(coupleId) ? supabase.from('bucket_list').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
                isValidId(coupleId) ? fetchOnThisDayData(coupleId) : Promise.resolve({ memories: [], milestones: [] }),
                isValidId(coupleId) ? supabase.from('cycle_logs').select('*').eq('couple_id', coupleId).order('log_date', { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null } as any),
                isValidId(coupleId) ? supabase.from('support_logs').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [], error: null } as any),
            ])

            const shouldRefreshCounts = !cachedData;
            const countsRes = ((shouldRefreshCounts) && isValidId(coupleId))
                ? await Promise.all([
                    supabase.from('memories').select('*', { count: 'exact', head: true }).eq('couple_id', coupleId),
                    supabase.from('love_letters').select('*', { count: 'exact', head: true }).eq('couple_id', coupleId),
                ])
                : null

            const memoriesCount = countsRes?.[0]?.count ?? cachedData?.memoriesCount ?? 0
            const lettersCount = countsRes?.[1]?.count ?? cachedData?.lettersCount ?? 0

            const nextData = {
                ...cachedData,
                profile: effectiveProfile ? { ...effectiveProfile, partner_id: partnerId } : null,
                partnerProfile: pProfileRes?.data ?? cachedData?.partnerProfile ?? null,
                couple: coupleRes?.data ?? cachedData?.couple ?? null,
                userCycle: userCycleRes?.data ?? cachedData?.userCycle ?? cachedData?.userTodayCycle ?? null,
                partnerCycle: partnerCycleRes?.data ?? cachedData?.partnerCycle ?? cachedData?.partnerTodayCycle ?? null,
                userTodayCycle: userCycleRes?.data ?? cachedData?.userTodayCycle ?? cachedData?.userCycle ?? null,
                partnerTodayCycle: partnerCycleRes?.data ?? cachedData?.partnerTodayCycle ?? cachedData?.partnerCycle ?? null,
                partnerTodayMoods: mergeRecentById(cachedData?.partnerTodayMoods || [], pMoodsRes?.data || [], 100)
                    .filter((row: any) => new Date(row.created_at).getTime() >= new Date(rolloutStart).getTime()),
                userTodayMoods: mergeRecentById(cachedData?.userTodayMoods || [], uMoodsRes?.data || [], 100)
                    .filter((row: any) => new Date(row.created_at).getTime() >= new Date(rolloutStart).getTime()),
                memoriesCount,
                lettersCount,
                currentDateIST: getTodayIST(),
                polaroids: {
                    userPolaroid: (userPolaroidRes?.data !== undefined && userPolaroidRes.data !== null) ? userPolaroidRes.data : (cachedData?.polaroids?.userPolaroid ?? null),
                    partnerPolaroid: (partnerPolaroidRes?.data !== undefined && partnerPolaroidRes.data !== null) ? partnerPolaroidRes.data : (cachedData?.polaroids?.partnerPolaroid ?? null),
                },
                doodle: doodleRes?.data ?? cachedData?.doodle ?? null,
                bucketList: mergeRecentById(cachedData?.bucketList || [], bucketListRes?.data || [], 100),
                memories: mergeRecentById(cachedData?.memories || [], onThisDayRes?.memories || [], 150),
                milestones: onThisDayRes?.milestones || cachedData?.milestones || [],
                cycleLogs: mergeRecentById(cachedData?.cycleLogs || [], cycleLogsRes?.data || [], 100),
                supportLogs: mergeRecentById(cachedData?.supportLogs || [], supportLogsRes?.data || [], 100),
            }

            writeDashboardCache(cacheKey, nextData)
            lastDashboardSyncAt = Date.now();
            return { success: true, data: nextData, incremental: !!cachedData }
        } catch (e: any) {
            console.error('[Orbit-Dashboard] Critical error:', e)
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                const { data: cached } = readDashboardCache(`dashboard:${session.user.id}`)
                if (cached) return { success: true, data: cached, cached: true, error: e.message }
            }
            return { success: false, error: e.message }
        } finally {
            dashboardInFlight = null;
        }
    })();

    return dashboardInFlight;
}

export async function getDashboardData(providedUser?: any, providedCoupleId?: string, force = false) {
    return await getCoreDashboardData(providedUser, providedCoupleId, force)
}

export async function fetchBucketListData(coupleId: string) {
    try {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('bucket_list')
            .select('*')
            .eq('couple_id', coupleId)

        if (error) {
            console.error('[fetchBucketListData] DB Error:', error)
            return []
        }

        return (data || []).map((item: any) => ({
            ...item,
            is_completed: item.is_completed ?? item.is_done ?? false
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } catch (e) {
        console.error('[fetchBucketListData] Exception:', e)
        return []
    }
}

export async function fetchOnThisDayData(coupleId: string) {
    try {
        const supabase = createClient()
        const todayIST = getTodayIST()
        const [y, m, d] = todayIST.split('-').map(Number)
        const month = m
        const day = d

        const [memoryRes, milestoneRes] = await Promise.all([
            supabase.from('memories')
                .select('id, title, description, image_urls, location, memory_date, created_at, user_id, is_encrypted, iv')
                .eq('couple_id', coupleId)
                .limit(50),
            supabase.from('milestones')
                .select('id, title, category, milestone_date, date_user1, date_user2, couple_id')
                .eq('couple_id', coupleId)
                .limit(50)
        ])

        const normalizeDate = (v: any) => {
            if (!v) return null
            const s = String(v)
            const iso = s.includes('T') ? s : `${s}T12:00:00`
            const dt = new Date(iso)
            if (Number.isNaN(dt.getTime())) return null
            return dt
        }

        const sameMonthDay = (dt: Date | null) => !!dt && (dt.getMonth() + 1) === month && dt.getDate() === day

        const memories = (memoryRes.data || [])
            .filter((row: any) => sameMonthDay(normalizeDate(row.memory_date || row.created_at)))

        const milestonesRaw = (milestoneRes.data || [])
        const milestones: any[] = []

        for (const row of milestonesRaw) {
            const primaryDate = normalizeDate(row.milestone_date)
            if (sameMonthDay(primaryDate)) {
                milestones.push({ ...row, milestone_date: row.milestone_date || row.created_at })
                continue
            }
            const date1 = normalizeDate(row.date_user1)
            if (sameMonthDay(date1)) {
                milestones.push({ ...row, milestone_date: row.date_user1, isOwnDate: true })
            }
            const date2 = normalizeDate(row.date_user2)
            if (sameMonthDay(date2)) {
                milestones.push({ ...row, milestone_date: row.date_user2, isOwnDate: false })
            }
        }

        return { memories, milestones }
    } catch (e) {
        console.error('[fetchOnThisDayData] Exception:', e)
        return { memories: [], milestones: [] }
    }
}
