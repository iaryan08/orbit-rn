'use server'

import { adminDb } from '@/lib/firebase/admin'
import { sendPushNotification } from '@/lib/push-server'
import { FieldValue } from 'firebase-admin/firestore'

/**
 * Broadcasts a notification to ALL users in the database.
 * Use this sparingly for major feature updates.
 */
export async function broadcastUpdateNotification() {
    try {
        // 1. Get all users
        const usersSnap = await adminDb.collection('users').get();
        const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
        for (const user of users) {
            try {
                // Internal DB Notification
                await adminDb.collection('notifications').add({
                    recipient_id: user.id,
                    type: 'announcement',
                    title,
                    message,
                    action_url: '/dashboard',
                    metadata: { type: 'announcement' },
                    is_read: false,
                    created_at: FieldValue.serverTimestamp()
                });

                sentCount++

                // Push Notification
                const pushResult = await sendPushNotification(user.id, title, "Enjoy a calmer, more polished space for your memories.", '/dashboard')
                if (pushResult.success) pushCount += (pushResult.sent || 0)

            } catch (e) {
                console.warn(`Failed to notify user ${user.id}:`, e)
            }
        }

        return {
            success: true,
            totalUsers: users.length,
            dbNotificationsSent: sentCount,
            pushNotificationsSent: pushCount
        }
    } catch (err: any) {
        console.error("Failed to fetch users for broadcast:", err)
        return { success: false, error: err.message || "Database error" }
    }
}
