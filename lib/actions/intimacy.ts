'use server'

import { adminDb } from '@/lib/firebase/admin'
import { sendNotification } from '@/lib/actions/notifications'
import { revalidatePath } from 'next/cache'
import { FieldValue } from 'firebase-admin/firestore'
import { requireUser } from '@/lib/firebase/auth-server'

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
    time?: string;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const couple = coupleDoc.data();
        if (!couple) return { error: "Couple error" }

        const isUser1 = couple.user1_id === user.uid
        const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category)
        const contentField = isUser1 ? "content_user1" : "content_user2"
        const dateField = isUser1 ? "date_user1" : "date_user2"
        const timeField = isUser1 ? "time_user1" : "time_user2"

        const updateData: any = {
            couple_id: profile.couple_id,
            category: payload.category,
            [contentField]: payload.content,
            updated_at: FieldValue.serverTimestamp()
        }

        if (payload.date) {
            updateData.milestone_date = payload.date
            if (showDualDates) {
                updateData[dateField] = payload.date
            }
        }
        if (payload.time) {
            updateData.milestone_time = payload.time
            if (showDualDates) {
                updateData[timeField] = payload.time
            }
        }

        const milestoneRef = adminDb.collection('couples').doc(profile.couple_id).collection('milestones').doc(payload.category);
        await milestoneRef.set(updateData, { merge: true });

        // Notify Partner
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
                actorId: user.uid,
                type: 'intimacy',
                title: 'Intimacy Memory Added',
                message: `${profile.display_name || 'Your partner'} added a memory for: ${label}`,
                actionUrl: '/intimacy'
            })
        }

        revalidatePath('/intimacy')
        return { success: true }
    } catch (err: any) {
        console.error('[logIntimacyMilestone] Error:', err);
        return { error: err.message || 'Failed to log intimacy milestone' }
    }
}
