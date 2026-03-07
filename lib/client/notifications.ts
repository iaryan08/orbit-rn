import { db, auth } from '@/lib/firebase/client'
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, setDoc, getCountFromServer, deleteField, getDoc } from 'firebase/firestore'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'

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
    actorId?: string
    type: NotificationType
    title: string
    message: string
    actionUrl?: string
    metadata?: any
    skipPush?: boolean
}

interface ReactivateCanvasNotificationParams {
    recipientId: string
    sessionId: string
    actionUrl?: string
}

const notificationsKey = (userId: string) => `notifications:list:${userId}`
const unreadCountKey = (userId: string) => `notifications:unread:${userId}`

export async function sendNotification({
    recipientId,
    actorId,
    type,
    title,
    message,
    actionUrl,
    metadata,
    skipPush = false
}: CreateNotificationParams) {
    if (isOffline()) {
        await enqueueMutation('notification.send', {
            recipientId,
            actorId,
            type,
            title,
            message,
            actionUrl,
            metadata,
            skipPush,
        })
        return { success: true, queued: true }
    }

    if (actorId && recipientId === actorId) return { success: false, error: "Cannot notify self" }

    try {
        const notifRef = collection(db, 'users', recipientId, 'notifications')
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
        })

        if (!skipPush) {
            void fetch('/api/trigger-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId,
                    title,
                    message,
                    url: actionUrl || '/',
                    metadata: metadata || {}
                })
            }).catch(err => console.error('Push trigger failed:', err));
        }

        return { success: true }
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('notification.send', {
                recipientId,
                actorId,
                type,
                title,
                message,
                actionUrl,
                metadata,
                skipPush,
            })
            return { success: true, queued: true }
        }
        console.error("[Notification] Failed to send:", error)
        return { success: false, error: error.message }
    }
}

export async function reactivateCanvasNotification({
    recipientId,
    sessionId,
    actionUrl = '/dashboard'
}: ReactivateCanvasNotificationParams) {
    try {
        const response = await fetch('/api/notifications/reactivate-canvas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipientId,
                sessionId,
                actionUrl
            })
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
            return {
                success: false,
                status: response.status,
                error: payload?.error || 'Failed to reactivate canvas notification'
            }
        }

        return {
            success: true,
            notificationId: payload?.notificationId as string | undefined
        }
    } catch (error: any) {
        return { success: false, error: error?.message || 'Unknown error' }
    }
}

export async function getNotifications(limitCount: number = 20) {
    const user = auth.currentUser
    if (!user) return []

    const key = notificationsKey(user.uid)
    try {
        const notifRef = collection(db, 'users', user.uid, 'notifications')
        const q = query(notifRef, orderBy('created_at', 'desc'), limit(limitCount))
        const snap = await getDocs(q)
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]

        // Normalize created_at for frontend
        const normalized = data.map(n => ({
            ...n,
            created_at: n.created_at?.toDate ? n.created_at.toDate().toISOString() : (n.created_at || new Date().toISOString())
        }))

        writeOfflineCache(key, normalized)
        return normalized
    } catch (e) {
        return readOfflineCache<any[]>(key) || []
    }
}

export async function getUnreadCount() {
    const user = auth.currentUser
    if (!user) return 0

    const key = unreadCountKey(user.uid)
    try {
        const notifRef = collection(db, 'users', user.uid, 'notifications')
        const q = query(notifRef, where('is_read', '==', false))
        const snap = await getCountFromServer(q)
        const count = snap.data().count
        writeOfflineCache(key, count)
        return count
    } catch (e) {
        return readOfflineCache<number>(key) || 0
    }
}

export async function markAsRead(notificationId?: string) {
    if (isOffline()) {
        await enqueueMutation('notification.markRead', { notificationId })
        return { success: true, queued: true }
    }

    const user = auth.currentUser
    if (!user) return { error: 'Unauthorized' }

    try {
        if (notificationId) {
            const notifRef = doc(db, 'users', user.uid, 'notifications', notificationId)
            await updateDoc(notifRef, { is_read: true })
        } else {
            const notifRef = collection(db, 'users', user.uid, 'notifications')
            const q = query(notifRef, where('is_read', '==', false))
            const snap = await getDocs(q)
            const batches = []
            for (const d of snap.docs) {
                batches.push(updateDoc(d.ref, { is_read: true }))
            }
            if (batches.length > 0) await Promise.all(batches)
        }
        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('notification.markRead', { notificationId })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to mark notifications as read' }
    }
}

export async function deleteNotification(notificationId: string) {
    if (isOffline()) {
        await enqueueMutation('notification.delete', { notificationId })
        return { success: true, queued: true }
    }

    const user = auth.currentUser
    if (!user) return { error: 'Unauthorized' }

    try {
        const notifRef = doc(db, 'users', user.uid, 'notifications', notificationId)
        await deleteDoc(notifRef)
        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('notification.delete', { notificationId })
            return { success: true, queued: true }
        }
        return { success: false, error: e?.message || 'Failed to delete notification' }
    }
}

export async function deleteAllNotifications() {
    if (isOffline()) {
        await enqueueMutation('notification.deleteAll', {})
        return { success: true, queued: true }
    }

    const user = auth.currentUser
    if (!user) return { error: 'Unauthorized' }

    try {
        const notifRef = collection(db, 'users', user.uid, 'notifications')
        const snap = await getDocs(notifRef)
        const batches = []
        for (const d of snap.docs) {
            batches.push(deleteDoc(d.ref))
        }
        if (batches.length > 0) await Promise.all(batches)
        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('notification.deleteAll', {})
            return { success: true, queued: true }
        }
        return { success: false, error: e?.message || 'Failed to delete notifications' }
    }
}

export async function sendSpark(opts?: { partnerId?: string; actorId?: string; displayName?: string }) {
    // Fast path: use pre-resolved IDs from the global store (passed in by the caller)
    if (opts?.partnerId && opts?.actorId) {
        return await sendNotification({
            recipientId: opts.partnerId,
            actorId: opts.actorId,
            type: 'spark',
            title: `${opts.displayName || 'Partner'} sent a Spark ✨`,
            message: 'Your partner is thinking about you right now.',
            actionUrl: '/dashboard'
        })
    }

    // Fallback: resolve from DB
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'Unauthorized' }

    const profileRef = doc(db, 'users', user.uid);
    const profileSnap = await getDoc(profileRef);
    const profile = profileSnap.data();

    if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

    const coupleRef = doc(db, 'couples', profile.couple_id);
    const coupleSnap = await getDoc(coupleRef);
    const couple = coupleSnap.data();

    if (!couple) return { success: false, error: 'Couple not found' }

    const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id
    if (!partnerId) return { success: false, error: 'Partner not found' }

    return await sendNotification({
        recipientId: partnerId,
        actorId: user.uid,
        type: 'spark',
        title: `${profile.display_name || 'Partner'} sent a Spark ✨`,
        message: 'Your partner is thinking about you right now.',
        actionUrl: '/dashboard'
    })
}

export async function sendHeartbeat(opts?: { partnerId?: string; actorId?: string; displayName?: string }) {
    // Fast path: use pre-resolved IDs from the global store
    if (opts?.partnerId && opts?.actorId) {
        return await sendNotification({
            recipientId: opts.partnerId,
            actorId: opts.actorId,
            type: 'heartbeat',
            title: `${opts.displayName || 'Partner'} sent a Heartbeat 💓`,
            message: 'Your partner shared their heartbeat with you.',
            actionUrl: '/dashboard',
            metadata: { type: 'heartbeat' }
        })
    }

    // Fallback: resolve from DB
    const user = auth.currentUser;
    if (!user) return { success: false, error: 'Unauthorized' }

    const profileRef = doc(db, 'users', user.uid);
    const profileSnap = await getDoc(profileRef);
    const profile = profileSnap.data();

    if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

    const coupleRef = doc(db, 'couples', profile.couple_id);
    const coupleSnap = await getDoc(coupleRef);
    const couple = coupleSnap.data();

    if (!couple) return { success: false, error: 'Couple not found' }

    const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id
    if (!partnerId) return { success: false, error: 'Partner not found' }

    return await sendNotification({
        recipientId: partnerId,
        actorId: user.uid,
        type: 'heartbeat',
        title: `${profile.display_name || 'Partner'} sent a Heartbeat 💓`,
        message: 'Your partner shared their heartbeat with you.',
        actionUrl: '/dashboard',
        metadata: { type: 'heartbeat' }
    })
}

