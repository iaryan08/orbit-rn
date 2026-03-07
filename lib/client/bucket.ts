import { db, auth } from '@/lib/firebase/client'
import { collection, getDocs, query, where, orderBy, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { sendNotification } from '@/lib/client/notifications'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'
import { Capacitor } from '@capacitor/core'
import { LocalDB } from '@/lib/client/local-db'

export async function getBucketList() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { items: [] }

        const cacheKey = `bucket:${coupleId}`

        // SQLite Fast-Load
        if (Capacitor.isNativePlatform()) {
            try {
                const localItems = await LocalDB.query<any>('bucket_list', coupleId);
                if (localItems && localItems.length > 0) {
                    return { items: localItems }
                }
            } catch (e) {
                console.warn('[BucketList] SQLite load failed', e)
            }
        }

        const q = query(collection(db, 'couples', coupleId, 'bucket_list'), orderBy('created_at', 'desc'));
        const snap = await getDocs(q);
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        writeOfflineCache(cacheKey, items)

        if (Capacitor.isNativePlatform()) {
            items.forEach((item: any) => {
                void LocalDB.upsertFromSync('bucket_list', { ...item, pending_sync: 0 });
            });
        }

        return { items }
    } catch (error: any) {
        console.error('Error fetching bucket list:', error)
        return { error: error?.message || 'Failed to fetch bucket list' }
    }
}

export async function addBucketItem(title: string, description: string = '', isPrivate: boolean = false) {
    if (isOffline()) {
        await enqueueMutation('bucket.add', { title, description, is_private: isPrivate })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: 'No couple found' }

        const itemData = {
            couple_id: profile.couple_id,
            created_by: user.uid,
            title,
            description,
            is_completed: false,
            is_private: isPrivate,
            created_at: serverTimestamp()
        };

        const docRef = await doc(collection(db, 'couples', profile.couple_id, 'bucket_list'));
        await setDoc(docRef, itemData);

        // Notify Partner
        const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
        const couple = coupleDoc.data();
        if (couple && !isPrivate) {
            const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'bucket_list',
                    title: 'New Bucket List Item',
                    message: `${profile.display_name || 'Your partner'} added "${title}" to your bucket list.`,
                    actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(docRef.id)}`,
                    metadata: { bucket_item_id: docRef.id }
                })
            }
        }

        if (Capacitor.isNativePlatform()) {
            void LocalDB.insert('bucket_list', {
                id: docRef.id,
                couple_id: profile.couple_id,
                created_by: user.uid,
                title,
                description,
                is_completed: false,
                is_private: isPrivate,
                created_at: new Date().toISOString()
            } as any);
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.add', { title, description, is_private: isPrivate })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to add bucket item' }
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    if (isOffline()) {
        await enqueueMutation('bucket.toggle', { id, isCompleted })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: 'No couple found' }

        const itemRef = doc(db, 'couples', profile.couple_id, 'bucket_list', id);
        const itemSnap = await getDoc(itemRef);
        if (!itemSnap.exists()) return { error: 'Item not found' };

        await updateDoc(itemRef, {
            is_completed: isCompleted,
            completed_at: isCompleted ? serverTimestamp() : null,
            updated_at: serverTimestamp()
        });

        if (isCompleted) {
            const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
            const couple = coupleDoc.data();
            if (couple) {
                const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id
                const itemData = itemSnap.data();
                if (partnerId && itemData) {
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.uid,
                        type: 'bucket_list',
                        title: 'Bucket List Item Completed! 🎉',
                        message: `${profile.display_name || 'Your partner'} marked "${itemData.title}" as completed!`,
                        actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(id)}`,
                        metadata: { bucket_item_id: id },
                    })
                }
            }
        }

        if (Capacitor.isNativePlatform()) {
            void LocalDB.update('bucket_list', id, profile.couple_id, {
                is_completed: isCompleted,
                completed_at: isCompleted ? new Date().toISOString() : null,
            } as any);
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.toggle', { id, isCompleted })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to toggle bucket item' }
    }
}

export async function deleteBucketItem(id: string) {
    if (isOffline()) {
        await enqueueMutation('bucket.delete', { id })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { error: 'No couple found' }

        await deleteDoc(doc(db, 'couples', coupleId, 'bucket_list', id));

        if (Capacitor.isNativePlatform()) {
            void LocalDB.delete('bucket_list', id, coupleId)
        }
        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.delete', { id })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to delete bucket item' }
    }
}
