import { createClient } from '@/lib/supabase/client'
import { sendNotification } from '@/lib/client/notifications'

export async function broadcastUpdateNotification() {
    // In standalone mode, broadcasting to everyone is only possible if the client
    // has the admin role or an RPC function is used.
    // For now, this function is mostly a placeholder as clients shouldn't broadcast to everyone directly
    // unless authenticated as an admin.

    const supabase = createClient()

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, display_name')

    if (error) {
        console.error("Failed to fetch profiles for broadcast:", error)
        return { success: false, error: "Database error. Note: Client-side broadcasts require specific RLS policies." }
    }

    const title = "Zen & Cohesion Update is Live! 🌿"
    const message = "We've refined the Orbit experience to be even more beautiful:\n\n" +
        "• 🖼️ Cleaner Canvas: Modals and cards now have tighter, distraction-free spacing.\n" +
        "• ✍️ Typography Tune-up: Metadata is now cleaner and easier to read without italics.\n" +
        "• ⚡ Performance Boost: Smoother animations and faster interactions across the board.\n" +
        "• 🔔 Smart Notifications: You'll now be notified when memories, letters, or polaroids are updated.\n\n" +
        "Enjoy a calmer, more polished space for your memories."

    let sentCount = 0

    if (profiles) {
        for (const profile of profiles) {
            try {
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

                // Standalone Push Notification logic will go here eventually if a backend is paired
                // or local notifications if broadcasting locally (not applicable here).

            } catch (e) {
                console.warn(`Failed to notify user ${profile.id}:`, e)
            }
        }
    }

    return {
        success: true,
        totalUsers: profiles?.length || 0,
        dbNotificationsSent: sentCount,
        pushNotificationsSent: 0
    }
}
