import { serverTimestamp, collection, addDoc, doc, getDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';

const partnerLabelCache = new Map<string, string>();

const normalizeActorLabel = async ({
    recipientId,
    actorId,
    actorName,
}: {
    recipientId?: string;
    actorId?: string;
    actorName?: string;
}) => {
    const cacheKey = `${recipientId || ''}:${actorId || ''}:${actorName || ''}`;
    const cached = partnerLabelCache.get(cacheKey);
    if (cached) return cached;

    let resolvedName = (actorName || '').trim();

    try {
        if (recipientId) {
            const recipientSnap = await getDoc(doc(db, 'users', recipientId));
            const recipientData: any = recipientSnap.data();
            if (recipientData?.partner_nickname && typeof recipientData.partner_nickname === 'string') {
                resolvedName = recipientData.partner_nickname.trim() || resolvedName;
            }
        }
    } catch { }

    try {
        if (!resolvedName && actorId) {
            const actorSnap = await getDoc(doc(db, 'users', actorId));
            const actorData: any = actorSnap.data();
            const fromProfile = actorData?.display_name || actorData?.name || '';
            resolvedName = typeof fromProfile === 'string' ? fromProfile.trim() : '';
        }
    } catch { }

    const finalLabel = resolvedName || 'Someone';
    partnerLabelCache.set(cacheKey, finalLabel);
    return finalLabel;
};

const replacePartnerPhrase = (text: string | undefined, actorLabel: string) => {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/\byour partner\b/gi, actorLabel)
        .replace(/\bpartner\b/gi, actorLabel);
};

const sanitizeCopy = (text: string | undefined) => {
    if (!text) return '';
    return text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter((line, idx, arr) => {
            // Remove bare symbol-only middle lines that make cards look broken.
            const symbolOnly = line.length <= 4 && !/[A-Za-z0-9]/.test(line);
            if (!symbolOnly) return true;
            return arr.length <= 1 || idx === 0;
        })
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

const buildDefaultCopy = (type: string | undefined, actorLabel: string) => {
    switch (type) {
        case 'heartbeat':
            return {
                title: `${actorLabel} sent a Heartbeat`,
                message: `${actorLabel}'s heartbeat just reached you.`,
            };
        case 'spark':
            return {
                title: `${actorLabel} sent a Spark`,
                message: `${actorLabel} is thinking about you right now.`,
            };
        case 'letter':
            return {
                title: `${actorLabel} sent a Letter`,
                message: `A new letter from ${actorLabel} is waiting for you.`,
            };
        case 'memory':
        case 'moment':
            return {
                title: `${actorLabel} shared a Moment`,
                message: `${actorLabel} added a new memory to your shared space.`,
            };
        case 'mood':
            return {
                title: `${actorLabel} shared a Mood`,
                message: `${actorLabel} updated their mood.`,
            };
        default:
            return {
                title: `${actorLabel} sent an update`,
                message: `You have a new update from ${actorLabel}.`,
            };
    }
};

export async function sendNotification({
    recipientId,
    actorId,
    actorName,
    type,
    title,
    message,
    actionUrl,
    metadata,
    skipPush = false
}: any) {
    if (actorId && recipientId === actorId) return { success: false, error: "Cannot notify self" };

    try {
        const actorLabel = await normalizeActorLabel({ recipientId, actorId, actorName });
        const defaults = buildDefaultCopy(type, actorLabel);
        const normalizedTitle = sanitizeCopy(replacePartnerPhrase(title, actorLabel)) || defaults.title;
        const normalizedMessage = sanitizeCopy(replacePartnerPhrase(message, actorLabel)) || defaults.message;

        const notifRef = collection(db, 'users', recipientId, 'notifications');
        await addDoc(notifRef, {
            recipient_id: recipientId,
            actor_id: actorId || null,
            type,
            title: normalizedTitle,
            message: normalizedMessage,
            action_url: actionUrl || null,
            metadata: metadata || {},
            is_read: false,
            created_at: serverTimestamp()
        });

        // Simplified push trigger for native (no fetch to /api/trigger-push for now, or use full URL)
        // In a real app, this would hit the backend API

        return { success: true };
    } catch (error: any) {
        console.error("[Notification] Failed to send:", error);
        return { success: false, error: error.message };
    }
}

export async function markAsRead(userId: string, notificationId: string) {
    if (!userId || !notificationId) return { success: false };
    try {
        const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
        const notifRef = doc(db, 'users', userId, 'notifications', notificationId);
        await updateDoc(notifRef, {
            is_read: true,
            updated_at: serverTimestamp() || new Date().toISOString()
        });
        return { success: true };
    } catch (error: any) {
        console.error("[Notification] Failed to mark as read:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteNotification(userId: string, notificationId: string) {
    if (!userId || !notificationId) return { success: false };
    try {
        const notifRef = doc(db, 'users', userId, 'notifications', notificationId);
        await deleteDoc(notifRef);
        return { success: true };
    } catch (error: any) {
        console.error("[Notification] Failed to delete:", error);
        return { success: false, error: error.message };
    }
}

export async function clearAllNotifications(userId: string) {
    if (!userId) return { success: false };
    try {
        const notifRef = collection(db, 'users', userId, 'notifications');
        const snap = await getDocs(notifRef);
        if (!snap.empty) {
            await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        }
        return { success: true, deleted: snap.size };
    } catch (error: any) {
        console.error("[Notification] Failed to clear all:", error);
        return { success: false, error: error.message };
    }
}
