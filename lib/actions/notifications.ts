'use server'

import { adminDb } from '@/lib/firebase/admin'
import { revalidatePath } from 'next/cache'
import { sendPushNotification } from '@/lib/push-server'

export type NotificationType =
    | 'mood'
    | 'letter'
    | 'memory'
    | 'period_start'
    | 'ovulation'
    | 'intimacy'
    | 'on_this_day'
    | 'spark'
    | 'heartbeat'
    | 'comment'
    | 'polaroid'
    | 'bucket_list'
    | 'announcement'

interface CreateNotificationParams {
    recipientId: string
    actorId?: string // Optional, null if system
    type: NotificationType
    title: string
    message: string
    actionUrl?: string
    metadata?: any
}

/**
 * Sends a notification to a specific user using Firestore.
 */
export async function sendNotification({
    recipientId,
    actorId,
    type,
    title,
    message,
    actionUrl,
    metadata
}: CreateNotificationParams) {
    // Safety check: Don't notify yourself
    if (actorId && recipientId === actorId) return { success: false, error: "Cannot notify self" }

    try {
        const notifData = {
            recipient_id: recipientId,
            actor_id: actorId || null,
            type,
            title,
            message,
            action_url: actionUrl || null,
            metadata: metadata || {},
            is_read: false,
            created_at: new Date().toISOString()
        };

        const docRef = await adminDb.collection('notifications').add(notifData);

        // Attempt to send push notification
        try {
            await sendPushNotification(recipientId, title, message, actionUrl || '/', metadata)
        } catch (pushError) {
            console.error('Failed to send push notification:', pushError)
        }

        return { success: true, id: docRef.id }
    } catch (error: any) {
        console.error("[Notification] Failed to send:", error)
        return { success: false, error: error.message }
    }
}

/**
 * Marks a single notification (or all) as read.
 */
export async function markAsRead(userId: string, notificationId?: string) {
    try {
        if (notificationId) {
            await adminDb.collection('notifications').doc(notificationId).update({ is_read: true });
        } else {
            const unread = await adminDb.collection('notifications')
                .where('recipient_id', '==', userId)
                .where('is_read', '==', false)
                .get();

            const batch = adminDb.batch();
            unread.docs.forEach(doc => {
                batch.update(doc.ref, { is_read: true });
            });
            await batch.commit();
        }

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Deletes a single notification.
 */
export async function deleteNotification(notificationId: string) {
    try {
        await adminDb.collection('notifications').doc(notificationId).delete();
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Sends a 'Spark' (thinking of you) notification to the partner using Firestore.
 */
export async function sendSpark(userId: string) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const profile = userDoc.data();

        if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const couple = coupleDoc.data();

        if (!couple) return { success: false, error: 'Couple not found' }

        const partnerId = couple.user1_id === userId ? couple.user2_id : couple.user1_id
        if (!partnerId) return { success: false, error: 'Partner not found' }

        const sparkMessages = [
            "is thinking of you... ✨",
            "just sent you a spark! 💖",
            "is missing you right now. 🌙",
            "wants to let you know you're on their mind. 💫",
            "is sending you some love! 🔥"
        ]
        const randomMessage = sparkMessages[Math.floor(Math.random() * sparkMessages.length)]

        return await sendNotification({
            recipientId: partnerId,
            actorId: userId,
            type: 'spark',
            title: 'Spark Received! ✨',
            message: `${profile.display_name || 'Your partner'} ${randomMessage}`,
            actionUrl: '/dashboard'
        })
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}

/**
 * Sends a 'Heartbeat' notification to the partner using Firestore.
 */
export async function sendHeartbeat(userId: string) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const profile = userDoc.data();

        if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const couple = coupleDoc.data();

        if (!couple) return { success: false, error: 'Couple not found' }

        const partnerId = couple.user1_id === userId ? couple.user2_id : couple.user1_id
        if (!partnerId) return { success: false, error: 'Partner not found' }

        return await sendNotification({
            recipientId: partnerId,
            actorId: userId,
            type: 'heartbeat',
            title: 'Heartbeat Detected 💓',
            message: `${profile.display_name || 'Your partner'} just sent you their heartbeat.`,
            actionUrl: '/dashboard',
            metadata: { type: 'heartbeat' }
        })
    } catch (err: any) {
        return { success: false, error: err.message }
    }
}
