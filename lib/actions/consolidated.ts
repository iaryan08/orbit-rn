'use server'

import { createClient } from '@/lib/supabase/server'
import { getTodayIST } from '@/lib/utils'
import { getDashboardPolaroids } from '@/lib/actions/polaroids'
import { getDoodle } from '@/lib/actions/doodles'
import { cache } from 'react'

/**
 * CONSOLIDATED DATA FETCHERS v3
 * High-performance, streaming-compatible server actions.
 * Optimized to eliminate layout shifts by fetching all core UI data in a single parallel batch.
 */

// Memoize core data fetching to prevent double-hits in the same request life-cycle
export const getCoreDashboardData = cache(async () => {
    try {
        console.log('[Orbit-Dashboard] Fetching core data (v3)...')
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        const selectFields = 'id, partner_id, couple_id, gender, display_name, avatar_url, city, timezone, latitude, longitude, location_source, updated_at'

        // 1. Fetch authenticated user's profile
        const { data: profile, error: pError } = await supabase
            .from('profiles')
            .select(selectFields)
            .eq('id', user.id)
            .single()

        if (pError || !profile) {
            console.error('[getCoreDashboardData] User profile error:', pError)
            return { success: false, error: 'Profile not found' }
        }

        let partnerId = profile.partner_id
        const coupleId = profile.couple_id

        // 2. Partner Discovery Logic (Crucial for image/data loading)
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

        const rolling24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

        // 3. Parallel fetching of all related dashboard data
        // Fetching everything in one batch ensures No Layout Shifts (no "popping" components)
        const [
            pProfileRes,
            coupleRes,
            pMoodsRes,
            uMoodsRes,
            countsRes,
            userCycleRes,
            partnerCycleRes,
            cycleLogsRes,
            supportLogsRes,
            polaroids,
            doodle
        ] = await Promise.all([
            partnerId ? supabase.from('profiles').select(selectFields).eq('id', partnerId).single() : Promise.resolve({ data: null, error: null }),
            coupleId ? supabase.from('couples').select('id, user1_id, user2_id, anniversary_date, paired_at, couple_code').eq('id', coupleId).single() : Promise.resolve({ data: null, error: null }),
            partnerId ? supabase.from('moods').select('id, created_at, emoji, mood_text, mood:emoji, note:mood_text').eq('user_id', partnerId).gte('created_at', rolling24hStart.toISOString()).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
            supabase.from('moods').select('id, created_at, emoji, mood_text, mood:emoji, note:mood_text').eq('user_id', user.id).gte('created_at', rolling24hStart.toISOString()).order('created_at', { ascending: false }),
            coupleId ? Promise.all([
                supabase.from('memories').select('*', { count: 'exact', head: true }).eq('couple_id', coupleId),
                supabase.from('love_letters').select('*', { count: 'exact', head: true }).eq('couple_id', coupleId)
            ]) : Promise.resolve([{ count: 0 }, { count: 0 }]),
            supabase.from('cycle_profiles').select('*').eq('user_id', user.id).maybeSingle(),
            partnerId ? supabase.from('cycle_profiles').select('*').eq('user_id', partnerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
            coupleId ? supabase.from('cycle_logs').select('*').eq('couple_id', coupleId).limit(30) : Promise.resolve({ data: [], error: null }),
            coupleId ? supabase.from('support_logs').select('*').eq('couple_id', coupleId).limit(30) : Promise.resolve({ data: [], error: null }),
            getDashboardPolaroids(coupleId ?? undefined),
            getDoodle(coupleId ?? undefined)
        ])

        const memoriesCount = (countsRes as any)[0]?.count || 0
        const lettersCount = (countsRes as any)[1]?.count || 0

        const normalizedCycleLogs = (cycleLogsRes?.data || []).map((l: any) => ({
            ...l,
            log_date: l.log_date || l.date || l.created_at
        })).sort((a: any, b: any) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime())

        const normalizedSupportLogs = (supportLogsRes?.data || []).map((l: any) => ({
            ...l,
            log_date: l.log_date || l.date || l.created_at
        })).sort((a: any, b: any) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime())

        return {
            success: true,
            data: {
                profile: { ...profile, partner_id: partnerId },
                partnerProfile: pProfileRes?.data,
                couple: coupleRes?.data,
                partnerTodayMoods: pMoodsRes?.data || [],
                userTodayMoods: uMoodsRes?.data || [],
                memoriesCount,
                lettersCount,
                userCycle: userCycleRes?.data,
                partnerCycle: partnerCycleRes?.data,
                cycleLogs: normalizedCycleLogs,
                supportLogs: normalizedSupportLogs,
                currentDateIST: getTodayIST(),
                polaroids,
                doodle
            }
        }
    } catch (e: any) {
        console.error('[getCoreDashboardData] Critical Exception:', e)
        return { success: false, error: e.message }
    }
})

export async function getDashboardData() {
    return await getCoreDashboardData()
}

export async function fetchBucketListData(coupleId: string) {
    try {
        const supabase = await createClient()
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
        const supabase = await createClient()
        const todayIST = getTodayIST() // YYYY-MM-DD
        const [y, m, d] = todayIST.split('-').map(Number)
        const month = m
        const day = d

        const [memoriesRes, milestonesRes] = await Promise.all([
            supabase.rpc('get_on_this_day_memories', {
                target_couple_id: coupleId,
                target_month: month,
                target_day: day
            }),
            supabase.rpc('get_on_this_day_milestones', {
                target_couple_id: coupleId,
                target_month: month,
                target_day: day
            })
        ])

        const rpcMemories = memoriesRes.data || []
        const rpcMilestones = milestonesRes.data || []
        if (rpcMemories.length > 0 || rpcMilestones.length > 0) {
            return {
                memories: rpcMemories,
                milestones: rpcMilestones
            }
        }

        // Fallback path: handle schema/date variations when RPC returns empty.
        const [memoryFallbackRes, milestoneFallbackRes] = await Promise.all([
            supabase
                .from('memories')
                .select('id, title, description, image_urls, location, memory_date, created_at, is_encrypted, iv')
                .eq('couple_id', coupleId),
            supabase
                .from('milestones')
                .select('id, couple_id, category, milestone_date, date_user1, date_user2, content_user1, content_user2, time_user1, time_user2, created_at')
                .eq('couple_id', coupleId)
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

        const fallbackMemories = (memoryFallbackRes.data || [])
            .filter((row: any) => sameMonthDay(normalizeDate(row.memory_date || row.created_at)))

        const fallbackMilestonesRaw = (milestoneFallbackRes.data || [])
        const fallbackMilestones: any[] = []

        for (const row of fallbackMilestonesRaw) {
            const primaryDate = normalizeDate(row.milestone_date)
            if (sameMonthDay(primaryDate)) {
                fallbackMilestones.push({
                    ...row,
                    milestone_date: row.milestone_date || row.created_at
                })
                continue
            }

            const date1 = normalizeDate(row.date_user1)
            if (sameMonthDay(date1)) {
                fallbackMilestones.push({
                    ...row,
                    milestone_date: row.date_user1,
                    isOwnDate: true
                })
            }

            const date2 = normalizeDate(row.date_user2)
            if (sameMonthDay(date2)) {
                fallbackMilestones.push({
                    ...row,
                    milestone_date: row.date_user2,
                    isOwnDate: false
                })
            }
        }

        return {
            memories: fallbackMemories,
            milestones: fallbackMilestones
        }
    } catch (e) {
        console.error('[fetchOnThisDayData] Exception:', e)
        return { memories: [], milestones: [] }
    }
}
