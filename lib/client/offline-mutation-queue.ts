import { db, auth } from '@/lib/firebase/client'
import {
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    getDoc,
    serverTimestamp,
    increment,
    FieldValue
} from 'firebase/firestore'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'

const QUEUE_KEY = 'mutations:queue:v1'
const MAX_QUEUE_ITEMS = 500

export type OfflineMutationKind =
    | 'memory.create'
    | 'memory.update'
    | 'pin.create'
    | 'pin.delete'
    | 'letter.send'
    | 'letter.update'
    | 'letter.open'
    | 'letter.close'
    | 'bucket.add'
    | 'bucket.toggle'
    | 'bucket.delete'
    | 'intimacy.log'
    | 'notification.send'
    | 'notification.markRead'
    | 'notification.delete'
    | 'notification.deleteAll'

export interface OfflineMutation {
    id: string
    kind: OfflineMutationKind
    payload: any
    createdAt: string
    attempts: number
    lastError?: string
}

function uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function readQueue(): OfflineMutation[] {
    const q = readOfflineCache<OfflineMutation[]>(QUEUE_KEY)
    return Array.isArray(q) ? q : []
}

function writeQueue(items: OfflineMutation[]) {
    writeOfflineCache(QUEUE_KEY, items.slice(-MAX_QUEUE_ITEMS))
}

export function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isLikelyNetworkError(error: any) {
    const message = String(error?.message || error || '').toLowerCase()
    return (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network request failed') ||
        message.includes('load failed') ||
        message.includes('timeout') ||
        message.includes('fetch')
    )
}

export async function enqueueMutation(kind: OfflineMutationKind, payload: any) {
    const queue = readQueue()
    queue.push({
        id: uid(),
        kind,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
    })
    writeQueue(queue)
    return { queued: true }
}

export function getPendingMutationCount() {
    return readQueue().length
}

async function getProfileAndCoupleInfo(userId: string) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const profile = userSnap.data();

    if (!profile?.couple_id) return { profile, couple: null, partnerId: null }

    const coupleSnap = await getDoc(doc(db, 'couples', profile.couple_id));
    const couple = coupleSnap.data();

    const partnerId = couple ? (couple.user1_id === userId ? couple.user2_id : couple.user1_id) : null
    return { profile, couple, partnerId }
}

async function applyMutation(m: OfflineMutation, userId: string) {
    switch (m.kind) {
        case 'memory.create': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await addDoc(collection(db, 'couples', profile.couple_id, 'memories'), {
                couple_id: profile.couple_id,
                user_id: userId,
                title: payload.title,
                description: payload.description,
                image_urls: payload.image_urls || [],
                location: payload.location ?? null,
                memory_date: payload.memory_date,
                created_at: serverTimestamp()
            });
            return
        }
        case 'memory.update': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await updateDoc(doc(db, 'couples', profile.couple_id, 'memories', payload.memoryId), {
                title: payload.title,
                description: payload.description,
                image_urls: payload.image_urls || [],
                location: payload.location ?? null,
                memory_date: payload.memory_date,
                updated_at: serverTimestamp()
            });
            return
        }
        case 'pin.create': {
            const payload = m.payload || {}
            await setDoc(doc(db, 'content_pins', `${payload.coupleId}_${payload.itemType}_${payload.itemId}`), {
                couple_id: payload.coupleId,
                item_type: payload.itemType,
                item_id: payload.itemId,
                pinned_by: userId,
                share_with_partner: payload.shareWithPartner !== false,
                pinned_at: payload.pinnedAt || serverTimestamp(),
                expires_at: payload.expiresAt ?? null,
            }, { merge: true });
            return
        }
        case 'pin.delete': {
            const payload = m.payload || {}
            await deleteDoc(doc(db, 'content_pins', `${payload.coupleId}_${payload.itemType}_${payload.itemId}`));
            return
        }
        case 'letter.send': {
            const { profile, partnerId } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id || !partnerId) throw new Error('No couple found')
            const payload = m.payload || {}
            let unlockType = 'immediate'
            if (payload.isOneTime) unlockType = 'one_time'
            else if (payload.unlock_date) unlockType = 'custom'

            await addDoc(collection(db, 'couples', profile.couple_id, 'letters'), {
                couple_id: profile.couple_id,
                sender_id: userId,
                receiver_id: partnerId,
                title: payload.title,
                content: payload.content,
                unlock_date: payload.unlock_date || null,
                unlock_type: unlockType,
                is_read: false,
                created_at: serverTimestamp()
            });
            return
        }
        case 'letter.update': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await updateDoc(doc(db, 'couples', profile.couple_id, 'letters', payload.letterId), {
                title: payload.title,
                content: payload.content,
                unlock_date: payload.unlock_date || null,
                unlock_type: payload.unlock_date ? 'custom' : 'immediate',
                updated_at: serverTimestamp()
            });
            return
        }
        case 'letter.open': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            const letterRef = doc(db, 'couples', profile.couple_id, 'letters', payload.letterId);
            const letterSnap = await getDoc(letterRef);
            if (!letterSnap.exists()) return;
            const letter = letterSnap.data();

            if (letter.unlock_type === 'one_time') {
                await deleteDoc(letterRef);
                return
            }
            await updateDoc(letterRef, { is_read: true, read_at: serverTimestamp() });
            return
        }
        case 'letter.close': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            const letterRef = doc(db, 'couples', profile.couple_id, 'letters', payload.letterId);
            const letterSnap = await getDoc(letterRef);
            if (!letterSnap.exists()) return;
            const letter = letterSnap.data();

            if (letter.unlock_type === 'one_time' && letter.receiver_id === userId) {
                await deleteDoc(letterRef);
            }
            return
        }
        case 'bucket.add': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await addDoc(collection(db, 'couples', profile.couple_id, 'bucket_list'), {
                couple_id: profile.couple_id,
                created_by: userId,
                title: payload.title,
                description: payload.description || '',
                is_completed: false,
                created_at: serverTimestamp()
            });
            return
        }
        case 'bucket.toggle': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await updateDoc(doc(db, 'couples', profile.couple_id, 'bucket_list', payload.id), {
                is_completed: !!payload.isCompleted,
                completed_at: payload.isCompleted ? serverTimestamp() : null,
                updated_at: serverTimestamp(),
            });
            return
        }
        case 'bucket.delete': {
            const { profile } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            await deleteDoc(doc(db, 'couples', profile.couple_id, 'bucket_list', payload.id));
            return
        }
        case 'intimacy.log': {
            const payload = m.payload || {}
            const { profile, couple } = await getProfileAndCoupleInfo(userId)
            if (!profile?.couple_id || !couple) throw new Error('No couple found')
            const isUser1 = couple.user1_id === userId
            const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category)
            const contentField = isUser1 ? 'content_user1' : 'content_user2'
            const dateField = isUser1 ? 'date_user1' : 'date_user2'

            const updateData: any = {
                couple_id: profile.couple_id,
                category: payload.category,
                [contentField]: payload.content,
                updated_at: serverTimestamp(),
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
            }
            await setDoc(doc(db, 'couples', profile.couple_id, 'milestones', payload.category), updateData, { merge: true });
            return
        }
        case 'notification.send': {
            const payload = m.payload || {}
            await addDoc(collection(db, 'notifications'), {
                recipient_id: payload.recipientId,
                actor_id: payload.actorId || null,
                type: payload.type,
                title: payload.title,
                message: payload.message,
                action_url: payload.actionUrl,
                metadata: payload.metadata || {},
                is_read: false,
                created_at: serverTimestamp()
            });
            return
        }
        case 'notification.markRead': {
            const payload = m.payload || {}
            if (payload.notificationId) {
                await updateDoc(doc(db, 'notifications', payload.notificationId), { is_read: true });
            } else {
                // Batch update in Firebase client is more complex, usually we let the server handle full-read or just update docs one by one if few.
                // For simplicity, we skip multi-update here as it's hard to do without a query in applyMutation.
            }
            return
        }
        case 'notification.delete': {
            const payload = m.payload || {}
            await deleteDoc(doc(db, 'notifications', payload.notificationId));
            return
        }
        case 'notification.deleteAll': {
            // Similar to markRead, multi-delete is costly on client.
            return
        }
    }
}

export async function flushMutationQueue() {
    if (isOffline()) return { processed: 0, failed: 0, skipped: true }
    const queue = readQueue()
    if (queue.length === 0) return { processed: 0, failed: 0, skipped: false }

    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId) return { processed: 0, failed: queue.length, skipped: true }

    const remaining: OfflineMutation[] = []
    let processed = 0
    let failed = 0

    for (const item of queue) {
        try {
            await applyMutation(item, userId)
            processed += 1
        } catch (error: any) {
            failed += 1
            remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: String(error?.message || error || 'Unknown error'),
            })
        }
    }

    writeQueue(remaining)
    return { processed, failed, skipped: false }
}
