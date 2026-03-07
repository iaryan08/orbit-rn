'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/push-server'

/**
 * Broadcasts a notification to ALL users in the database.
 * Use this sparingly for major feature updates.
 */
export async function broadcastUpdateNotification() {
    const supabase = await createAdminClient()

    // 1. Get all users
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, display_name')

    if (error) {
        console.error("Failed to fetch profiles for broadcast:", error)
        return { success: false, error: "Database error" }
    }

    const title = "Zen & Cohesion Update is Live! 🌿"
    const message = "We've refined the Orbit experience to be even more beautiful:\n\n" +
        "• 🖼️ Cleaner Canvas: Modals and cards now have tighter, distraction-free spacing.\n" +
        "• ✍️ Typography Tune-up: Metadata is now cleaner and easier to read without italics.\n" +
        "• ⚡ Performance Boost: Smoother animations and faster interactions across the board.\n" +
        "• 🔔 Smart Notifications: You'll now be notified when memories, letters, or polaroids are updated.\n\n" +
        "Enjoy a calmer, more polished space for your memories."

    let sentCount = 0
    let pushCount = 0

    // 2. Insert into notifications table for everyone
    // Note: Doing this in a loop might be slow for many users, but fine for now.
    for (const profile of profiles) {
        try {
            // Internal DB Notification
            const { error: notifyError } = await supabase
                .from('notifications')
                .insert({
                    recipient_id: profile.id,
                    type: 'announcement',
                    title,
                    message,
                    action_url: '/dashboard',
                    metadata: { type: 'announcement' }
                })

            if (!notifyError) sentCount++

            // Push Notification
            const pushResult = await sendPushNotification(profile.id, title, "Enjoy a calmer, more polished space for your memories.", '/dashboard')
            if (pushResult.success) pushCount += (pushResult.sent || 0)

        } catch (e) {
            console.warn(`Failed to notify user ${profile.id}:`, e)
        }
    }

    return {
        success: true,
        totalUsers: profiles.length,
        dbNotificationsSent: sentCount,
        pushNotificationsSent: pushCount
    }
}
