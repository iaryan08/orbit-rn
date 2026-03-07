'use server'

import { adminDb } from '@/lib/firebase/admin'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/actions/notifications'
import { FieldValue } from 'firebase-admin/firestore'
import { requireUser } from '@/lib/firebase/auth-server'

export async function getBucketList() {
    const user = await requireUser();
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { items: [] }

        const itemsSnap = await adminDb.collection('couples').doc(coupleId).collection('bucket_list')
            .orderBy('created_at', 'desc')
            .get();

        const items = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { items }
    } catch (err: any) {
        console.error('Error fetching bucket list:', err)
        return { error: err.message }
    }
}

export async function addBucketItem(title: string, description: string = '', is_private: boolean = false) {
    const user = await requireUser();
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: 'No couple found' }

        const itemData = {
            couple_id: profile.couple_id,
            created_by: user.uid,
            title,
            description,
            is_completed: false,
            is_private: is_private,
            created_at: FieldValue.serverTimestamp()
        };

        const docRef = await adminDb.collection('couples').doc(profile.couple_id).collection('bucket_list').add(itemData);

        // Notify Partner
        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const coupleData = coupleDoc.data();
        if (coupleData && !is_private) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'bucket_list',
                    title: 'New Bucket List Item',
                    message: `${profile.display_name || 'Your partner'} added "${title}" to your bucket list.`,
                    actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(docRef.id)}`,
                    metadata: { bucket_item_id: docRef.id },
                })
            }
        }

        revalidatePath('/dashboard', 'layout')
        return { success: true, id: docRef.id }
    } catch (err: any) {
        return { error: err.message }
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    const user = await requireUser();
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: 'No couple found' }

        const itemRef = adminDb.collection('couples').doc(profile.couple_id).collection('bucket_list').doc(id);
        const itemSnap = await itemRef.get();
        if (!itemSnap.exists) return { error: 'Item not found' };

        await itemRef.update({
            is_completed: isCompleted,
            completed_at: isCompleted ? FieldValue.serverTimestamp() : null,
            updated_at: FieldValue.serverTimestamp()
        });

        // Notify Partner if completed
        if (isCompleted) {
            const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
            const coupleData = coupleDoc.data();
            if (coupleData) {
                const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id
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

        revalidatePath('/dashboard', 'layout')
        return { success: true }
    } catch (err: any) {
        return { error: err.message }
    }
}

export async function deleteBucketItem(id: string) {
    const user = await requireUser();
    if (!user) return { error: 'Not authenticated' }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { error: 'No couple found' }

        await adminDb.collection('couples').doc(coupleId).collection('bucket_list').doc(id).delete();

        revalidatePath('/dashboard', 'layout')
        return { success: true }
    } catch (err: any) {
        return { error: err.message }
    }
}
