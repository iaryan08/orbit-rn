import { db_local } from './db/db';
import { offlineMutations } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { auth, db } from './firebase';
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
} from 'firebase/firestore';
import NetInfo from './netinfo-safe';
import { isLikelyNetworkError } from './utils';

const MAX_QUEUE_ITEMS = 500;

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
    | 'notification.deleteAll';

export interface OfflineMutation {
    id: string;
    kind: OfflineMutationKind;
    payload: any;
    createdAt: number;
    attempts: number;
    lastError?: string;
}

function uid() {
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function isOffline() {
    const state = await NetInfo.fetch();
    return !state.isConnected;
}

export async function enqueueMutation(kind: OfflineMutationKind, payload: any) {
    const id = uid();
    const createdAt = Date.now();

    try {
        await db_local.insert(offlineMutations).values({
            id,
            kind,
            payload: JSON.stringify(payload),
            created_at: createdAt,
            attempts: 0,
        });
        
        // Best-effort: prune old items if queue grows too large
        const countResult = await db_local.select({ count: sql<number>`count(*)` }).from(offlineMutations).get();
        if (countResult && countResult.count > MAX_QUEUE_ITEMS) {
            const oldestItems = await db_local.select({ id: offlineMutations.id })
                .from(offlineMutations)
                .orderBy(offlineMutations.created_at)
                .limit(countResult.count - MAX_QUEUE_ITEMS)
                .all();
            
            for (const item of oldestItems) {
                await db_local.delete(offlineMutations).where(eq(offlineMutations.id, item.id));
            }
        }
    } catch (e) {
        console.error('[OfflineQueue] Failed to enqueue mutation:', e);
    }
}

async function getProfileAndCoupleInfo(userId: string) {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const profile = userSnap.data();

    if (!profile?.couple_id) return { profile, couple: null, partnerId: null };

    const coupleSnap = await getDoc(doc(db, 'couples', profile.couple_id));
    const couple = coupleSnap.data();

    const partnerId = couple ? (couple.user1_id === userId ? couple.user2_id : couple.user1_id) : null;
    return { profile, couple, partnerId };
}

async function applyMutation(m: OfflineMutation, userId: string) {
    const payload = m.payload || {};
    
    switch (m.kind) {
        case 'memory.create': {
            const { profile } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id) throw new Error('No couple found');
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
            break;
        }
        case 'memory.update': {
            const { profile } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id) throw new Error('No couple found');
            await updateDoc(doc(db, 'couples', profile.couple_id, 'memories', payload.memoryId), {
                title: payload.title,
                description: payload.description,
                image_urls: payload.image_urls || [],
                location: payload.location ?? null,
                memory_date: payload.memory_date,
                updated_at: serverTimestamp()
            });
            break;
        }
        case 'bucket.add': {
            const { profile } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id) throw new Error('No couple found');
            await addDoc(collection(db, 'couples', profile.couple_id, 'bucket_list'), {
                couple_id: profile.couple_id,
                created_by: userId,
                title: payload.title,
                description: payload.description || '',
                is_completed: false,
                is_private: !!payload.is_private,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
            break;
        }
        case 'bucket.toggle': {
            const { profile } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id) throw new Error('No couple found');
            await updateDoc(doc(db, 'couples', profile.couple_id, 'bucket_list', payload.id), {
                is_completed: !!payload.isCompleted,
                completed_at: payload.isCompleted ? serverTimestamp() : null,
                updated_at: serverTimestamp(),
            });
            break;
        }
        case 'bucket.delete': {
            const { profile } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id) throw new Error('No couple found');
            await updateDoc(doc(db, 'couples', profile.couple_id, 'bucket_list', payload.id), {
                deleted: true,
                updated_at: serverTimestamp()
            });
            break;
        }
        case 'intimacy.log': {
            const { profile, couple } = await getProfileAndCoupleInfo(userId);
            if (!profile?.couple_id || !couple) throw new Error('No couple found');
            const isUser1 = couple.user1_id === userId;
            const contentField = isUser1 ? 'content_user1' : 'content_user2';
            
            const updateData: any = {
                couple_id: profile.couple_id,
                category: payload.category,
                [contentField]: payload.content,
                updated_at: serverTimestamp(),
            };
            if (payload.date) updateData.milestone_date = payload.date;
            if (payload.time) updateData.milestone_time = payload.time;
            
            await setDoc(doc(db, 'couples', profile.couple_id, 'milestones', payload.category), updateData, { merge: true });
            break;
        }
        case 'notification.send': {
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
            break;
        }
        // Add more handlers as needed to match root lib/client/offline-mutation-queue.ts
    }
}

export async function flushMutationQueue() {
    if (await isOffline()) return { processed: 0, failed: 0, skipped: true };

    const user = auth.currentUser;
    const userId = user?.uid;
    if (!userId) return { processed: 0, failed: 0, skipped: true };

    const queue = await db_local.select().from(offlineMutations).orderBy(offlineMutations.created_at).all();
    if (queue.length === 0) return { processed: 0, failed: 0, skipped: false };

    let processed = 0;
    let failed = 0;

    for (const item of queue) {
        try {
            const mutation: OfflineMutation = {
                id: item.id,
                kind: item.kind as OfflineMutationKind,
                payload: JSON.parse(item.payload),
                createdAt: item.created_at,
                attempts: item.attempts || 0,
                lastError: item.last_error || undefined,
            };

            await applyMutation(mutation, userId);
            await db_local.delete(offlineMutations).where(eq(offlineMutations.id, item.id));
            processed += 1;
        } catch (error: any) {
            failed += 1;
            await db_local.update(offlineMutations)
                .set({
                    attempts: (item.attempts || 0) + 1,
                    last_error: String(error?.message || error || 'Unknown error'),
                })
                .where(eq(offlineMutations.id, item.id));
        }
    }

    return { processed, failed, skipped: false };
}
