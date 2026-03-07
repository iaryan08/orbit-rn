'use server'

import { adminDb } from '@/lib/firebase/admin'
import { sendNotification } from '@/lib/actions/notifications'
import { revalidatePath } from 'next/cache'
import { FieldValue } from 'firebase-admin/firestore'
import { requireUser } from '@/lib/firebase/auth-server'

export async function openLetter(letterId: string) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const now = new Date().toISOString()
        const letterRef = adminDb.collection('couples').doc(profile.couple_id).collection('letters').doc(letterId);
        const letterSnap = await letterRef.get();

        if (!letterSnap.exists) return { error: "Letter not found" }
        const letter = letterSnap.data();

        if (letter?.receiver_id !== user.uid) return { error: "Unauthorized" }

        if (letter.unlock_type === 'one_time') {
            await letterRef.delete();
        } else {
            await letterRef.update({
                is_read: true,
                read_at: now,
                updated_at: FieldValue.serverTimestamp()
            });
        }

        // 2. Notify Sender
        await sendNotification({
            recipientId: letter.sender_id,
            actorId: user.uid,
            type: 'letter',
            title: 'Letter Opened',
            message: letter.unlock_type === 'one_time'
                ? 'Your secret whisper was viewed and has vanished.'
                : 'Your partner just opened your love letter.',
            actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
            metadata: { letter_id: letterId }
        })

        revalidatePath('/letters')
        return { success: true, read_at: now, isOneTime: letter.unlock_type === 'one_time' }
    } catch (e: any) {
        console.error("Error opening letter:", e)
        return { error: e.message || "Failed to open letter" }
    }
}

export async function sendLetter(payload: {
    title: string;
    content: string;
    unlock_date: string | null;
    isOneTime?: boolean;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
        const coupleData = coupleDoc.data();
        if (!coupleData) return { error: "Couple data error" }

        const partnerId = coupleData.user1_id === user.uid ? coupleData.user2_id : coupleData.user1_id
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
            created_at: FieldValue.serverTimestamp()
        };

        const docRef = await adminDb.collection('couples').doc(profile.couple_id).collection('letters').add(letterData);

        // Notify Partner
        await sendNotification({
            recipientId: partnerId,
            actorId: user.uid,
            type: 'letter',
            title: 'New Love Letter',
            message: `${profile.display_name || 'Your partner'} sent you a love letter.`,
            actionUrl: `/letters?open=${encodeURIComponent(docRef.id)}`,
            metadata: { letter_id: docRef.id }
        })

        revalidatePath('/letters')
        return { success: true, id: docRef.id }
    } catch (err: any) {
        console.error('[sendLetter] Error:', err);
        return { error: err.message || 'Failed to send letter' }
    }
}

export async function updateLetter(letterId: string, payload: {
    title: string;
    content: string;
    unlock_date: string | null;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" }

    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profile = userDoc.data();
        if (!profile?.couple_id) return { error: "No couple found" }

        const letterRef = adminDb.collection('couples').doc(profile.couple_id).collection('letters').doc(letterId);
        const letterSnap = await letterRef.get();

        if (!letterSnap.exists) return { error: "Letter not found" };
        if (letterSnap.data()?.sender_id !== user.uid) return { error: "Unauthorized" };

        await letterRef.update({
            title: payload.title,
            content: payload.content,
            unlock_date: payload.unlock_date || null,
            unlock_type: payload.unlock_date ? 'custom' : 'immediate',
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
                    type: 'letter',
                    title: 'Letter Updated',
                    message: `${profile.display_name || 'Your partner'} updated a letter.`,
                    actionUrl: `/letters?open=${encodeURIComponent(letterId)}`,
                    metadata: { letter_id: letterId }
                });
            }
        }

        revalidatePath('/letters')
        return { success: true }
    } catch (err: any) {
        console.error('[updateLetter] Error:', err);
        return { error: err.message || 'Failed to update letter' }
    }
}
