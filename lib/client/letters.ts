import { db, auth } from '@/lib/firebase/client'
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, query, where, getDocs } from 'firebase/firestore'
import { sendNotification } from '@/lib/client/notifications'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'
import { Capacitor } from '@capacitor/core'
import { LocalDB } from '@/lib/client/local-db'
import { rtdb } from '@/lib/firebase/client'
import { ref, set } from 'firebase/database'

export async function openLetter(letterId: string) {
    if (isOffline()) {
        await enqueueMutation('letter.open', { letterId })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const letterRef = doc(db, 'couples', profile.couple_id, 'letters', letterId);
        const letterSnap = await getDoc(letterRef);
        const letter = letterSnap.data();

        if (!letter || letter.receiver_id !== user.uid) return { error: "Letter not found" }

        const now = new Date().toISOString()

        if (letter.unlock_type === 'one_time') {
            await deleteDoc(letterRef);

            try {
                if (Capacitor.isNativePlatform()) {
                    await LocalDB.delete('love_letters', letterId, profile.couple_id)
                }
            } catch (sqlErr) {
                console.warn('[openLetter] SQLite delete failed:', sqlErr)
            }

            await sendNotification({
                recipientId: letter.sender_id,
                actorId: user.uid,
                type: 'letter',
                title: 'Whisper Vanished',
                message: 'Your secret whisper was viewed.',
                actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
                metadata: { letter_id: letterId }
            })

            return { success: true, read_at: now, isOneTime: true, deleted: true, content: letter.content }
        }

        await updateDoc(letterRef, {
            is_read: true,
            read_at: now,
            updated_at: serverTimestamp()
        });

        await sendNotification({
            recipientId: letter.sender_id,
            actorId: user.uid,
            type: 'letter',
            title: 'Letter Opened',
            message: 'Your partner just opened your love letter.',
            actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
            metadata: { letter_id: letterId }
        })

        return { success: true, read_at: now, isOneTime: false, content: letter.content }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('letter.open', { letterId })
            return { success: true, queued: true }
        }
        return { error: e.message || "Failed to open letter" }
    }
}

export async function closeLetter(letterId: string) {
    if (isOffline()) {
        await enqueueMutation('letter.close', { letterId })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const letterRef = doc(db, 'couples', profile.couple_id, 'letters', letterId);
        const letterSnap = await getDoc(letterRef);
        const letter = letterSnap.data();

        if (!letter) return { success: true, deleted: true }

        if (letter.unlock_type === 'one_time' && letter.receiver_id === user.uid) {
            await deleteDoc(letterRef);

            try {
                if (Capacitor.isNativePlatform()) {
                    await LocalDB.delete('love_letters', letterId, profile.couple_id)
                }
            } catch (sqlErr) {
                console.warn('[closeLetter] SQLite delete failed:', sqlErr)
            }

            // Broadcast via RTDB for instant removal
            try {
                const vanishedRef = ref(rtdb, `broadcasts/${profile.couple_id}/letters/vanished`);
                await set(vanishedRef, { letter_id: letterId, timestamp: Date.now() });
            } catch { }

            await sendNotification({
                recipientId: letter.sender_id,
                actorId: user.uid,
                type: 'letter',
                title: 'Whisper Vanished',
                message: 'Your secret whisper was read and then closed.',
                actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
                metadata: { letter_id: letterId }
            })

            return { success: true, deleted: true }
        }

        return { success: true, deleted: false }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('letter.close', { letterId })
            return { success: true, queued: true }
        }
        return { error: e?.message || "Failed to close letter" }
    }
}

export async function sendLetter(payload: {
    title: string;
    content: string;
    unlock_date: string | null;
    isOneTime?: boolean;
    is_encrypted?: boolean;
    encrypted_content?: string;
    iv?: string;
    id?: string;
}) {
    if (isOffline()) {
        await enqueueMutation('letter.send', payload)
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
        const coupleData = coupleDoc.data();
        if (!coupleData) return { error: "Couple data error" }

        const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
        if (!partnerId) return { error: "Partner not found" }

        let unlockType = 'immediate';
        if (payload.isOneTime) unlockType = 'one_time';
        else if (payload.unlock_date) unlockType = 'custom';

        const letterData = {
            couple_id: profile.couple_id,
            sender_id: user.uid,
            receiver_id: partnerId,
            title: payload.title,
            content: payload.content,
            unlock_date: payload.unlock_date || null,
            unlock_type: unlockType,
            is_encrypted: payload.is_encrypted || false,
            encrypted_content: payload.encrypted_content || null,
            iv: payload.iv || null,
            created_at: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'couples', profile.couple_id, 'letters'), letterData);
        const letter = { id: docRef.id, ...letterData };

        await sendNotification({
            recipientId: partnerId,
            actorId: user.uid,
            type: 'letter',
            title: 'New Love Letter',
            message: `${profile.display_name || 'Your partner'} sent you a love letter.`,
            actionUrl: `/letters?open=${encodeURIComponent(docRef.id)}`,
            metadata: { letter_id: docRef.id }
        })

        return { success: true, data: letter }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('letter.send', payload)
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to send letter' }
    }
}

export async function updateLetter(letterId: string, payload: {
    title: string;
    content: string;
    unlock_date: string | null;
    is_encrypted?: boolean;
    encrypted_content?: string;
    iv?: string;
}) {
    if (isOffline()) {
        await enqueueMutation('letter.update', { letterId, ...payload })
        return { success: true, queued: true }
    }

    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const letterRef = doc(db, 'couples', profile.couple_id, 'letters', letterId);
        await updateDoc(letterRef, {
            title: payload.title,
            content: payload.content,
            unlock_date: payload.unlock_date || null,
            unlock_type: payload.unlock_date ? 'custom' : 'immediate',
            is_encrypted: payload.is_encrypted || false,
            encrypted_content: payload.encrypted_content || null,
            iv: payload.iv || null,
            updated_at: serverTimestamp()
        });

        const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
        const coupleData = coupleDoc.data();
        if (coupleData) {
            const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'letter',
                    title: 'Letter Updated',
                    message: `${profile.display_name || 'Your partner'} updated a letter.`,
                    actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
                    metadata: { letter_id: letterId }
                });
            }
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('letter.update', { letterId, ...payload })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to update letter' }
    }
}
