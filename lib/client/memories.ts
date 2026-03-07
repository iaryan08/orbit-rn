import { db, auth } from '@/lib/firebase/client'
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, query, where, getDocs } from 'firebase/firestore'
import { sendNotification } from '@/lib/client/notifications'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'
import { useOrbitStore } from '@/lib/store/global-store'

export async function createMemory(payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    if (isOffline()) {
        await enqueueMutation('memory.create', payload)
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
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
            created_at: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'couples', profile.couple_id, 'memories'), memoryData);
        const memory = { id: docRef.id, ...memoryData };

        // Handle Notifications
        const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
        const coupleData = coupleDoc.data();
        if (coupleData) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'memory',
                    title: 'New Memory Shared',
                    message: `${profile.display_name || 'Partner'} added a new memory: "${payload.title}"`,
                    actionUrl: `/memories?open=${encodeURIComponent(docRef.id)}`,
                    metadata: { memory_id: docRef.id }
                });
            }
        }

        return { success: true, data: memory }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('memory.create', payload)
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to create memory' }
    }
}

export async function updateMemory(memoryId: string, payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    if (isOffline()) {
        await enqueueMutation('memory.update', { memoryId, ...payload })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const memoryRef = doc(db, 'couples', profile.couple_id, 'memories', memoryId);
        await updateDoc(memoryRef, {
            title: payload.title,
            description: payload.description,
            image_urls: payload.image_urls,
            location: payload.location,
            memory_date: payload.memory_date,
            updated_at: serverTimestamp()
        });

        // Notifications
        const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
        const coupleData = coupleDoc.data();
        if (coupleData) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'memory',
                    title: 'Memory Updated',
                    message: `${profile.display_name || 'Partner'} updated the memory: "${payload.title}"`,
                    actionUrl: `/memories?open=${encodeURIComponent(memoryId)}`,
                    metadata: { memory_id: memoryId }
                });
            }
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('memory.update', { memoryId, ...payload })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to update memory' }
    }
}

export async function deleteMemory(memoryId: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const memoryRef = doc(db, 'couples', profile.couple_id, 'memories', memoryId);
        const memorySnap = await getDoc(memoryRef);
        const memory = memorySnap.data();

        if (!memory || memory.user_id !== user.uid) return { error: "Memory not found or unauthorized" }

        // 1. Delete Firestore record
        await deleteDoc(memoryRef);

        // 2. Cleanup storage assets
        const { extractFilePathFromStorageUrl, deleteFromR2 } = await import("@/lib/storage")

        if (memory.image_urls && Array.isArray(memory.image_urls)) {
            for (const url of memory.image_urls) {
                const path = extractFilePathFromStorageUrl(url, 'memories')
                if (path) {
                    try {
                        await deleteFromR2('memories', path)
                    } catch (err) {
                        console.error('Failed to cleanup memory asset:', path, err)
                    }
                }
            }
        }

        return { success: true }
    } catch (e: any) {
        return { error: e?.message || 'Failed to delete memory' }
    }
}
