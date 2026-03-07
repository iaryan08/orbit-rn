import { createClient } from '@/lib/supabase/client'
import { sendNotification } from '@/lib/client/notifications'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'
import { LocalDB } from '@/lib/client/local-db'

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
    time?: string;
}) {
    if (isOffline()) {
        await enqueueMutation('intimacy.log', payload)
        return { success: true, queued: true }
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) return { error: "Unauthorized" }
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('couple_id, display_name')
            .eq('id', user.id)
            .single()

        if (!profile?.couple_id || profile.couple_id === 'undefined') return { error: "No couple found" }

        const { data: couple } = await supabase
            .from('couples')
            .select('user1_id, user2_id')
            .eq('id', profile.couple_id)
            .single()

        if (!couple) return { error: "Couple error" }

        const isUser1 = couple.user1_id === user.id
        const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category)
        const contentField = isUser1 ? "content_user1" : "content_user2"
        const dateField = isUser1 ? "date_user1" : "date_user2"
        const timeField = isUser1 ? "time_user1" : "time_user2"

        const updateData: any = {
            couple_id: profile.couple_id,
            category: payload.category,
            [contentField]: payload.content,
            updated_at: new Date().toISOString()
        }

        if (payload.date) {
            if (showDualDates) {
                updateData[dateField] = payload.date
                updateData.milestone_date = payload.date
            } else {
                updateData.milestone_date = payload.date
            }
        }
        if (payload.time) {
            updateData.milestone_time = payload.time
            if (showDualDates) {
                updateData[timeField] = payload.time
            }
        }

        let { error } = await supabase
            .from('milestones')
            .upsert(updateData, { onConflict: 'couple_id, category' })

        if (error) {
            const msg = String(error.message || '').toLowerCase()
            const timeColumnMissing = msg.includes('milestone_time') && (msg.includes('column') || msg.includes('schema'))
            if (timeColumnMissing) {
                const fallbackData = { ...updateData }
                delete fallbackData.milestone_time
                const retry = await supabase
                    .from('milestones')
                    .upsert(fallbackData, { onConflict: 'couple_id, category' })
                error = retry.error
            }
        }

        if (error) return { error: error.message }

        // Keep quick local mirror for offline rendering.
        const cacheKey = `intimacy:${profile.couple_id}`
        const current = readOfflineCache<any[]>(cacheKey) || []
        const next = [...current.filter((x: any) => x?.category !== payload.category), updateData]
        writeOfflineCache(cacheKey, next)

        try {
            if (updateData) {
                await LocalDB.upsertFromSync('milestones', { ...updateData, pending_sync: 0 })
            }
        } catch (dbErr) {
            console.warn('[logIntimacyMilestone] SQLite sync failed:', dbErr)
        }

        const partnerId = isUser1 ? couple.user2_id : couple.user1_id
        if (partnerId) {
            const labels: Record<string, string> = {
                "first_talk": "First Talk",
                "first_hug": "First Hug",
                "first_kiss": "First Kiss",
                "first_french_kiss": "First French Kiss",
                "first_sex": "First Sex",
                "first_oral": "First Oral Sex",
                "first_time_together": "First Time Together",
                "first_surprise": "First Surprise",
                "first_memory": "First Memory",
                "first_confession": "First Confession",
                "first_promise": "First Promise",
                "first_night_together": "First Night Together",
                "first_time_alone": "First Time Alone",
                "first_movie_date": "First Movie Date",
                "first_intimate_moment": "First Intimate Moment"
            }
            const label = labels[payload.category] || "Intimacy Milestone"

            await sendNotification({
                recipientId: partnerId,
                actorId: user.id,
                type: 'intimacy',
                title: 'Intimacy Memory Added',
                message: `${profile.display_name || 'Your partner'} added a memory for: ${label}`,
                actionUrl: '/intimacy'
            })
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('intimacy.log', payload)
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to log intimacy milestone' }
    }
}
