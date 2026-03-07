'use server'

import { adminDb } from '@/lib/firebase/admin'
import { sendNotification } from '@/lib/actions/notifications'
import { revalidatePath } from 'next/cache'
import { FieldValue } from 'firebase-admin/firestore'
import { requireUser } from '@/lib/firebase/auth-server'

export async function createMemory(payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const memoryData = {
            couple_id: profile.couple_id,
            user_id: user.uid,
            title: payload.title,
            description: payload.description,
            image_urls: payload.image_urls,
            location: payload.location,
            memory_date: payload.memory_date,
            created_at: FieldValue.serverTimestamp()
        };

        const docRef = await adminDb.collection('couples').doc(profile.couple_id).collection('memories').add(memoryData);

        // Notify Partner
        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const coupleData = coupleDoc.data();
        if (coupleData) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'memory',
                    title: 'New Memory Shared',
                    message: `${profile.display_name || 'Your partner'} added a new memory: "${payload.title}"`,
                    actionUrl: `/memories?open=${encodeURIComponent(docRef.id)}`,
                    metadata: { memory_id: docRef.id }
                });
            }
        }

        revalidatePath('/memories')
        revalidatePath('/dashboard')
        return { success: true, id: docRef.id }
    } catch (err: any) {
        console.error('[createMemory] Error:', err);
        return { error: err.message || 'Failed to create memory' }
    }
}

export async function updateMemory(memoryId: string, payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const memoryRef = adminDb.collection('couples').doc(profile.couple_id).collection('memories').doc(memoryId);
        const memorySnap = await memoryRef.get();

        if (!memorySnap.exists) return { error: "Memory not found" };
        if (memorySnap.data()?.user_id !== user.uid) return { error: "Unauthorized to edit this memory" };

        await memoryRef.update({
            title: payload.title,
            description: payload.description,
            image_urls: payload.image_urls,
            location: payload.location,
            memory_date: payload.memory_date,
            updated_at: FieldValue.serverTimestamp()
        });

        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const coupleData = coupleDoc.data();
        if (coupleData) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'memory',
                    title: 'Memory Updated',
                    message: `${profile.display_name || 'Your partner'} updated the memory: "${payload.title}"`,
                    actionUrl: `/memories?open=${encodeURIComponent(memoryId)}`,
                    metadata: { memory_id: memoryId }
                });
            }
        }

        revalidatePath('/memories')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (err: any) {
        console.error('[updateMemory] Error:', err);
        return { error: err.message || 'Failed to update memory' }
    }
}
import { deleteFromR2, extractFilePathFromStorageUrl } from '@/lib/storage'

export async function deleteMemory(memoryId: string) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const memoryRef = adminDb.collection('couples').doc(profile.couple_id).collection('memories').doc(memoryId);
        const snap = await memoryRef.get();
        if (!snap.exists) return { error: "Memory not found" };

        const data = snap.data();
        if (data?.user_id !== user.uid) return { error: "Access denied" };

        // Cleanup R2 images
        if (Array.isArray(data?.image_urls)) {
            for (const url of data.image_urls) {
                const path = extractFilePathFromStorageUrl(url, 'memories');
                if (path) await deleteFromR2('memories', path);
            }
        }

        await memoryRef.delete();
        revalidatePath('/memories')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (err: any) {
        console.error('[deleteMemory] Error:', err);
        return { error: err.message || 'Failed to delete memory' }
    }
}
