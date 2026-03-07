import { db, auth } from '@/lib/firebase/client'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'

export async function broadcastUpdateNotification() {
    // Note: Client-side broadcasts are usually restricted. 
    // This is a legacy placeholder migrated to Firestore pattern.

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const title = "Zen & Cohesion Update is Live! 🌿"
        const message = "We've refined the Orbit experience to be even more beautiful:\n\n" +
            "• 🖼️ Cleaner Canvas: Modals and cards now have tighter, distraction-free spacing.\n" +
            "• ✍️ Typography Tune-up: Metadata is now cleaner and easier to read without italics.\n" +
            "• ⚡ Performance Boost: Smoother animations and faster interactions across the board.\n" +
            "• 🔔 Smart Notifications: You'll now be notified when memories, letters, or polaroids are updated.\n\n" +
            "Enjoy a calmer, more polished space for your memories."

        let sentCount = 0

        for (const user of users) {
            try {
                await addDoc(collection(db, 'notifications'), {
                    recipient_id: user.id,
                    type: 'announcement',
                    title,
                    message,
                    action_url: '/dashboard',
                    metadata: { type: 'announcement' },
                    is_read: false,
                    created_at: serverTimestamp()
                });
                sentCount++
            } catch (e) {
                console.warn(`Failed to notify user ${user.id}:`, e)
            }
        }

        return {
            success: true,
            totalUsers: users.length,
            dbNotificationsSent: sentCount,
            pushNotificationsSent: 0
        }
    } catch (error: any) {
        console.error("Failed to fetch users for broadcast:", error)
        return { success: false, error: error.message }
    }
}
