import { db } from './firebase';
import { serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { getTodayIST } from './utils';

export async function sendNotification({
    recipientId,
    actorId,
    type,
    title,
    message,
    actionUrl,
    metadata,
    skipPush = false
}: any) {
    if (actorId && recipientId === actorId) return { success: false, error: "Cannot notify self" };

    try {
        const notifRef = collection(db, 'users', recipientId, 'notifications');
        await addDoc(notifRef, {
            recipient_id: recipientId,
            actor_id: actorId || null,
            type,
            title,
            message,
            action_url: actionUrl || null,
            metadata: metadata || {},
            is_read: false,
            created_at: serverTimestamp()
        });

        // Simplified push trigger for native (no fetch to /api/trigger-push for now, or use full URL)
        // In a real app, this would hit the backend API

        return { success: true };
    } catch (error: any) {
        console.error("[Notification] Failed to send:", error);
        return { success: false, error: error.message };
    }
}

export async function markAsRead(userId: string, notificationId: string) {
    if (!userId || !notificationId) return { success: false };
    try {
        const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const notifRef = doc(db, 'users', userId, 'notifications', notificationId);
        await updateDoc(notifRef, {
            is_read: true,
            updated_at: serverTimestamp() || new Date().toISOString()
        });
        return { success: true };
    } catch (error: any) {
        console.error("[Notification] Failed to mark as read:", error);
        return { success: false, error: error.message };
    }
}
