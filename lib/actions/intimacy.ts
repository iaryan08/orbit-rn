'use server'

import { createClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/actions/notifications'
import { revalidatePath } from 'next/cache'

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { error: "No couple found" }

    // Logic to determine user1/user2 for content field
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

    const updateData: any = {
        couple_id: profile.couple_id,
        category: payload.category,
        [contentField]: payload.content,
        updated_at: new Date().toISOString()
    }

    if (payload.date) {
        if (showDualDates) {
            updateData[dateField] = payload.date
            // Also update the shared field as a fallback/summary
            updateData.milestone_date = payload.date
        } else {
            // Strictly shared
            updateData.milestone_date = payload.date
            // We can also clear user-specific dates or keep them as backup, 
            // but the component will prioritize milestone_date for these.
        }
    }

    const { error } = await supabase
        .from('milestones')
        .upsert(updateData, { onConflict: 'couple_id, category' })

    if (error) return { error: error.message }

    // Notify Partner
    const partnerId = isUser1 ? couple.user2_id : couple.user1_id
    if (partnerId) {
        // Map category ID to readable label (simple approach)
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

    revalidatePath('/intimacy')
    return { success: true }
}
