import { auth, db, storage, rtdb } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc, Timestamp, orderBy, limit, arrayUnion, updateDoc } from 'firebase/firestore';
import { ref, deleteObject, uploadBytes, uploadBytesResumable, getDownloadURL, uploadString } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as ImageCompressor } from 'react-native-compressor';
import { updateDoc as firestoreUpdateDoc } from 'firebase/firestore';

// useOrbitStore is imported dynamically inside functions to avoid circular dependency with store.ts

import { getTodayIST, isLikelyNetworkError } from './utils';
import { sendNotification } from './notifications';
import { enqueueMutation, isOffline } from './offline-queue';

const resolveCoupleId = (state: any): string | null =>
    state.couple?.id || state.profile?.couple_id || state.activeCoupleId || null;

export async function submitMood(mood: string, note?: string) {
    if (await isOffline()) {
        console.log('[Auth] Offline detected, enqueuing mood submission...');
        await enqueueMutation('mood.log' as any, { mood, note }); // Adding to queue
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    try {
        const moodData = {
            user_id: user.uid,
            couple_id: coupleId,
            emoji: mood,
            mood_text: note || null,
            mood_date: today,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        const moodId = `${user.uid}_${today}`;
        await setDoc(doc(db, 'couples', coupleId, 'moods', moodId), moodData, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'mood',
                title: 'New Mood Log',
                message: `${state.profile?.display_name || 'Your partner'} is feeling ${mood} ${note ? 'with a note' : ''}`,
                actionUrl: '/dashboard'
            });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('mood.log' as any, { mood, note });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function clearMood() {
    if (await isOffline()) {
        await enqueueMutation('mood.clear' as any, {});
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();

    try {
        // Find today's moods for this user and delete them
        const moodsRef = collection(db, 'couples', coupleId, 'moods');
        const q = query(moodsRef, where('user_id', '==', user.uid), where('mood_date', '==', today));
        const snap = await getDocs(q);

        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('mood.clear' as any, {});
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function logSymptoms(symptoms: string[], options?: { notifyPartner?: boolean; customPrefix?: string; note?: string }) {
    if (await isOffline()) {
        await enqueueMutation('cycle.log' as any, { symptoms, options });
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const logId = `${user.uid}_${today}`;
        const logRef = doc(db, 'couples', coupleId, 'cycle_logs', logId);

        await setDoc(logRef, {
            user_id: user.uid,
            log_date: today,
            symptoms,
            note: options?.note || '',
            updated_at: now
        }, { merge: true });

        if (options?.notifyPartner !== false && state.partnerProfile?.id) {
            const prefix = (options?.customPrefix || 'is having').trim();
            const displayName = state.profile?.display_name || 'Partner';

            let message = symptoms.length > 0
                ? `${displayName} ${prefix} - ${symptoms.join(', ')}.`
                : `${displayName} shared a feeling update: no symptoms right now.`;

            // 🚀 CARE SUGGESTIONS: Add actionable advice for the partner
            const lowSymptoms = symptoms.map(s => s.toLowerCase());
            let careSuggestion = '';
            if (lowSymptoms.includes('cramps')) careSuggestion = "Offer her a heat pack or a gentle massage.";
            else if (lowSymptoms.includes('fatigue')) careSuggestion = "Maybe handle dinner or extra chores tonight so she can rest?";
            else if (lowSymptoms.includes('back pain')) careSuggestion = "A warm bath or a lower back rub would be amazing right now.";
            else if (lowSymptoms.includes('headache')) careSuggestion = "Try to keep the room quiet and light low; offer some water.";
            else if (lowSymptoms.includes('low mood')) careSuggestion = "Just being there to listen and offer a hug goes a long way.";

            if (careSuggestion) {
                message += `\n\nCare Suggestion: ${careSuggestion}`;
            }

            if (options?.note) {
                message += ` Note: "${options.note}"`;
            }

            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'announcement',
                title: 'Feeling Update',
                message,
                actionUrl: '/dashboard',
                metadata: { source: 'cycle_symptoms_update', symptoms, careSuggestion }
            });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('cycle.log' as any, { symptoms, options });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function logSexDrive(level: string) {
    if (await isOffline()) {
        await enqueueMutation('cycle.libido' as any, { level });
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const logId = `${user.uid}_${today}`;
        const logRef = doc(db, 'couples', coupleId, 'cycle_logs', logId);

        await setDoc(logRef, {
            user_id: user.uid,
            log_date: today,
            sex_drive: level,
            updated_at: now
        }, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'intimacy',
                title: 'Libido Status Updated',
                message: `${state.profile?.display_name || 'Your partner'} updated libido to ${level.replace('_', ' ')}.`,
                actionUrl: '/dashboard',
                metadata: { source: 'libido_update', currentLevel: level }
            });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('cycle.libido' as any, { level });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function logPeriodStart(date: string) {
    if (await isOffline()) {
        await enqueueMutation('cycle.periodStart' as any, { date });
        return { success: true, queued: true };
    }
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const profile = state.profile;
        const cycleProfile = profile?.cycle_profile || {};
        const history = cycleProfile.period_history || [];
        const nextHistory = [...new Set([date, ...history])].slice(0, 24);

        const nextProfileCycle = {
            ...cycleProfile,
            last_period_start: date,
            period_history: nextHistory,
            updated_at: new Date().toISOString()
        };

        // 1) Update Profile (Batch)
        await setDoc(doc(db, 'couples', coupleId, 'cycle_profiles', user.uid), nextProfileCycle, { merge: true });
        await firestoreUpdateDoc(doc(db, 'users', user.uid), { cycle_profile: nextProfileCycle, updated_at: serverTimestamp() });

        // 2) Notify Partner
        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'announcement',
                title: 'Period Started',
                message: `${state.profile?.display_name || 'Partner'} started her period today (${date}).`,
                actionUrl: '/dashboard',
                metadata: { source: 'period_start', date }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logPeriodEnd(date: string) {
    if (await isOffline()) {
        await enqueueMutation('cycle.periodEnd' as any, { date });
        return { success: true, queued: true };
    }
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const profile = state.profile;
        const cycleProfile = profile?.cycle_profile || {};
        const nextProfileCycle = {
            ...cycleProfile,
            last_period_end: date,
            updated_at: new Date().toISOString()
        };

        await setDoc(doc(db, 'couples', coupleId, 'cycle_profiles', user.uid), nextProfileCycle, { merge: true });
        await firestoreUpdateDoc(doc(db, 'users', user.uid), { cycle_profile: nextProfileCycle, updated_at: serverTimestamp() });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'announcement',
                title: 'Period Ended',
                message: `${state.profile?.display_name || 'Partner'}'s period ended today (${date}).`,
                actionUrl: '/dashboard',
                metadata: { source: 'period_end', date }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
    time?: string;
}) {
    if (await isOffline()) {
        await enqueueMutation('intimacy.log', payload);
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = (await import('./store')).useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const isUser1 = state.couple?.user1_id === user.uid;
        const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category);
        const contentField = isUser1 ? "content_user1" : "content_user2";
        const dateField = isUser1 ? "date_user1" : "date_user2";
        const timeField = isUser1 ? "time_user1" : "time_user2";

        const updateData: any = {
            couple_id: coupleId,
            category: payload.category,
            [contentField]: payload.content,
            updated_at: new Date().toISOString()
        };

        if (payload.date) {
            updateData.milestone_date = payload.date;
            if (showDualDates) updateData[dateField] = payload.date;
        }
        if (payload.time) {
            updateData.milestone_time = payload.time;
            if (showDualDates) updateData[timeField] = payload.time;
        }

        const milestoneRef = doc(db, 'couples', coupleId, 'milestones', payload.category);
        await setDoc(milestoneRef, updateData, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'intimacy',
                title: 'Intimacy Memory Added',
                message: `${state.profile?.display_name || 'Your partner'} added a memory for an intimacy milestone.`,
                actionUrl: '/intimacy'
            });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('intimacy.log', payload);
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function addBucketItem(title: string, description: string = '', is_private: boolean = false) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };
    const normalizedTitle = (title || '').trim();
    if (!normalizedTitle) return { error: 'Title is required' };

    try {
        const itemData = {
            couple_id: coupleId,
            created_by: user.uid,
            title: normalizedTitle,
            description,
            is_completed: false,
            is_private: is_private,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'couples', coupleId, 'bucket_list'), itemData);

        if (state.partnerProfile?.id && !is_private) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'bucket_list',
                title: 'New Bucket List Item 📝',
                message: `${state.profile?.display_name || 'Your partner'} added "${normalizedTitle}" to your bucket list.`,
                actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(docRef.id)}`,
                metadata: { bucket_item_id: docRef.id },
            });
        }

        return { success: true, id: docRef.id };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            console.log('[Auth] Network error detected, enqueuing bucket item addition...');
            await enqueueMutation('bucket.add', { title: normalizedTitle, description, is_private });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        const itemRef = doc(db, 'couples', coupleId, 'bucket_list', id);

        await setDoc(itemRef, {
            is_completed: isCompleted,
            completed_at: isCompleted ? serverTimestamp() : null,
            updated_at: serverTimestamp()
        }, { merge: true });

        if (isCompleted && state.partnerProfile?.id) {
            const item = state.bucketList.find(i => i.id === id);
            if (item) {
                await sendNotification({
                    recipientId: state.partnerProfile.id,
                    actorId: user.uid,
                    type: 'bucket_list',
                    title: 'Bucket List Item Completed! 🎉',
                    message: `${state.profile?.display_name || 'Your partner'} marked "${item.title}" as completed!`,
                    actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(id)}`,
                    metadata: { bucket_item_id: id },
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            console.log('[Auth] Network error detected, enqueuing bucket item toggle...');
            await enqueueMutation('bucket.toggle', { id, isCompleted });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function deleteBucketItem(id: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        await setDoc(doc(db, 'couples', coupleId, 'bucket_list', id), {
            deleted: true,
            updated_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            console.log('[Auth] Network error detected, enqueuing bucket item deletion...');
            await enqueueMutation('bucket.delete', { id });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function updateLetterReadStatus(id: string, isRead: boolean, isVanish: boolean = false) {
    if (await isOffline()) {
        await enqueueMutation('letter.update' as any, { letterId: id, isRead, isVanish });
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        const itemRef = doc(db, 'couples', coupleId, 'letters', id);

        if (isVanish && isRead) {
            // VANISHING RULE: Delete after reading
            await deleteDoc(itemRef);
        } else {
            await setDoc(itemRef, {
                is_read: isRead,
                updated_at: serverTimestamp()
            }, { merge: true });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('letter.update' as any, { letterId: id, isRead, isVanish });
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function deleteMemory(memory: any) {
    if (await isOffline()) {
        await enqueueMutation('memory.update', { memoryId: memory.id, deleted: true });
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Tombstone in Firestore so offline peers and local delta sync can converge correctly.
        await setDoc(doc(db, 'couples', coupleId, 'memories', memory.id), {
            deleted: true,
            updated_at: serverTimestamp()
        }, { merge: true });

        // 2. Best-in-Class: Total Storage Cleanup
        const urls = [
            ...(memory.image_urls || []),
            ...(memory.image_url ? [memory.image_url] : [])
        ];
        
        // Remove duplicates if any
        const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

        for (const url of uniqueUrls) {
            if (!url || url.startsWith('http')) continue;

            const cleanPath = url.replace(/^\/+/, '').replace(/^memories\//i, '');
            const fullPath = `memories/${cleanPath}`;

            // Cleanup R2 (Primary Storage)
            if (R2_URL) {
                try {
                    const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/memories/${cleanPath}`;
                    const headers: Record<string, string> = {};
                    if (R2_SECRET) {
                        headers['Authorization'] = `Bearer ${R2_SECRET}`;
                    }
                    await fetch(r2DeleteUrl, {
                        method: 'DELETE',
                        headers
                    });
                } catch (e) {
                    console.error("[StorageCleanup] R2 delete failed:", e);
                }
            }

            // Cleanup Firebase Storage (Backup Storage)
            try {
                await deleteObject(ref(storage, fullPath));
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.error("[StorageCleanup] Firebase delete failed:", e);
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('memory.update', { memoryId: memory.id, deleted: true });
            return { success: true, queued: true };
        }
        console.error("deleteMemory error:", error);
        return { error: error.message };
    }
}

export async function submitPolaroid(imageUrl: string, caption?: string, explicitDate?: string) {
    const today = explicitDate || getTodayIST();
    if (await isOffline()) {
        await enqueueMutation('pin.create' as any, { imageUrl, caption, today });
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        const polaroidData = {
            user_id: user.uid,
            couple_id: coupleId,
            image_url: imageUrl,
            caption: caption || 'A moment shared',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            polaroid_date: today,
            client_timestamp: Date.now() // Safety fallback
        };

        // We use a fixed ID per user per day to ensure only ONE polaroid exists daily
        const polaroidId = `${user.uid}_${today}`;
        const polaroidRef = doc(db, 'couples', coupleId, 'polaroids', polaroidId);

        await setDoc(polaroidRef, polaroidData);

        // Enforce max 2 polaroids in Firestore (latest two only) and remove >3 day old
        try {
            const polaroidsRef = collection(db, 'couples', coupleId, 'polaroids');
            const snap = await getDocs(query(polaroidsRef, orderBy('created_at', 'desc'), limit(6)));
            const toDelete = snap.docs.slice(2);
            await Promise.all(toDelete.map(d => deleteDoc(d.ref)));

            const cutoff = Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);
            const expiredSnap = await getDocs(query(polaroidsRef, where('created_at', '<', cutoff)));
            await Promise.all(expiredSnap.docs.map(d => deleteDoc(d.ref)));
        } catch (cleanupErr) {
            console.warn("[Polaroid] Cleanup failed:", cleanupErr);
        }

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'moment',
                title: 'New Polaroid! 📸',
                message: `${state.profile?.display_name || 'Your partner'} just shared a daily Polaroid.`,
                actionUrl: '/dashboard'
            });
        }

        return { success: true };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('pin.create' as any, { imageUrl, caption, today });
            return { success: true, queued: true };
        }
        console.error("submitPolaroid error:", error);
        return { error: error.message };
    }
}

export async function addMemory(memory: any) {
    if (await isOffline()) {
        await enqueueMutation('memory.create', memory);
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        const dataToSync = {
            ...memory,
            couple_id: coupleId,
            sender_id: user.uid,
            sender_name: state.profile?.display_name || null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };
        delete (dataToSync as any).id;

        const docRef = await addDoc(collection(db, 'couples', coupleId, 'memories'), dataToSync);

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'memory',
                title: 'New Memory Added! ✨',
                message: `${state.profile?.display_name || 'Your partner'} shared a new memory: "${memory.title || 'Untitled'}".`,
                actionUrl: `/dashboard?memoryId=${docRef.id}`,
                metadata: { memory_id: docRef.id }
            });
        }

        return { success: true, id: docRef.id };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('memory.create', memory);
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function sendLetter(letter: any) {
    if (await isOffline()) {
        await enqueueMutation('letter.send', letter);
        return { success: true, queued: true };
    }

    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        const dataToSync = {
            ...letter,
            sender_id: user.uid,
            sender_name: state.profile?.display_name || null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };
        delete (dataToSync as any).id;

        const docRef = await addDoc(collection(db, 'couples', coupleId, 'letters'), dataToSync);

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'letter',
                title: 'You got a letter! 💌',
                message: `${state.profile?.display_name || 'Your partner'} sent you a letter: "${letter.title || 'Untitled'}".`,
                actionUrl: `/dashboard?letterId=${docRef.id}`,
                metadata: { letter_id: docRef.id }
            });
        }

        return { success: true, id: docRef.id };
    } catch (error: any) {
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('letter.send', letter);
            return { success: true, queued: true };
        }
        return { error: error.message };
    }
}

export async function uploadWallpaper(uri: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Process Image
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 2200 } }],
            { compress: 0.82, format: ImageManipulator.SaveFormat.WEBP }
        );

        const timestamp = Date.now();
        const fileName = `${user.uid}_${timestamp}.webp`;
        const storagePath = `wallpapers/${fileName}`;

        // Utility: Convert URI to Blob
        let blob: any = null;
        try {
            blob = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = function () { resolve(xhr.response); };
                xhr.onerror = function (e) { reject(new TypeError('Network request failed')); };
                xhr.responseType = 'blob';
                xhr.open('GET', manipulated.uri, true);
                xhr.send(null);
            });
        } catch (xhrError) {
            console.warn("XHR Blob failed, trying fetch fallback");
            const response = await fetch(manipulated.uri);
            blob = await response.blob();
        }

        // 2. Upload to R2 (Primary)
        if (R2_URL) {
            try {
                const r2TargetUrl = `${R2_URL.replace(/\/$/, '')}/wallpapers/${fileName}`;
                const headers: Record<string, string> = {
                    'Content-Type': 'image/webp'
                };
                if (R2_SECRET) {
                    headers['Authorization'] = `Bearer ${R2_SECRET}`;
                }
                await fetch(r2TargetUrl, {
                    method: 'PUT',
                    headers,
                    body: blob
                });
            } catch (r2Err) {
                console.warn("[Wallpaper] R2 failed, falling back:", r2Err);
            }
        }

        // 3. Upload to Firebase (Backup/Meta) — best-effort only for Android
        const storageRef = ref(storage, storagePath);
        try {
            await uploadBytes(storageRef, blob, { contentType: 'image/webp' });
        } catch (fbErr: any) {
            // If Firebase Storage is misconfigured, don't block or show a red error screen.
            // R2 already has the primary copy, so we quietly log a DEV-only warning.
            if (__DEV__) {
                console.warn("Firebase uploadBytes failed (wallpaper backup only):", fbErr?.code || fbErr?.message || fbErr);
            }
        } finally {
            if (blob && typeof blob.close === 'function') {
                blob.close();
            }
        }

        // 4. Update Profile in Firestore (source of truth)
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            custom_wallpaper_url: storagePath,
            wallpaper_mode: 'custom',
            updated_at: serverTimestamp()
        });

        // 5. Optimistically update local store so DynamicBackground switches immediately
        try {
            const current = useOrbitStore.getState().profile;
            useOrbitStore.setState({
                profile: {
                    ...(current || {}),
                    custom_wallpaper_url: storagePath,
                },
            });
        } catch { /* non-critical for UI */ }

        return { success: true, url: storagePath };
    } catch (error: any) {
        console.error("uploadWallpaper error:", error);
        return { error: error.code || error.message || "Unknown Upload Failure" };
    }
}

export async function deleteWallpaper() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const currentWallpaper = state.profile?.custom_wallpaper_url;

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Update Profile first (Optimistic for user)
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            custom_wallpaper_url: null,
            wallpaper_mode: 'stars'
        });

        // 2. Cleanup Storage
        if (currentWallpaper) {
            const cleanPath = currentWallpaper.replace(/^\/+/, '').replace(/^wallpapers\//i, '');
            const fullPath = `wallpapers/${cleanPath}`;

            // R2 Cleanup
            if (R2_URL) {
                try {
                    const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/wallpapers/${cleanPath}`;
                    const headers: Record<string, string> = {};
                    if (R2_SECRET) {
                        headers['Authorization'] = `Bearer ${R2_SECRET}`;
                    }
                    await fetch(r2DeleteUrl, {
                        method: 'DELETE',
                        headers
                    });
                } catch (e) {
                    console.error("[WallpaperCleanup] R2 delete failed:", e);
                }
            }

            // Firebase Cleanup
            try {
                await deleteObject(ref(storage, fullPath));
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.error("[WallpaperCleanup] Firebase delete failed:", e);
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("deleteWallpaper error:", error);
        return { error: error.message };
    }
}

export async function savePolaroidToMemories(polaroid: any) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    try {
        // PERMANENT MEMORY RULE: Check if already archived
        const alreadySaved = (state.memories || []).some(m => (m.image_url === polaroid.image_url || m.source_polaroid_id === polaroid.id) && m.source === 'polaroid');
        if (alreadySaved) {
            return { error: 'ALREADY_SAVED', message: 'This polaroid is already in your permanent memories.' };
        }

        const memoryData = {
            couple_id: coupleId,
            user_id: user.uid,
            title: 'Daily Polaroid',
            content: polaroid.caption || 'A moment shared',
            image_url: polaroid.image_url,
            type: 'image',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            is_favorite: false,
            source: 'polaroid',
            source_polaroid_id: polaroid.id
        };

        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(db, 'couples', coupleId, 'memories'), memoryData);

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'memory',
                title: 'Polaroid Archived! 🎞️',
                message: `${state.profile?.display_name || 'Your partner'} saved a daily Polaroid to your shared memories gallery.`,
                actionUrl: '/memories'
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("savePolaroidToMemories error:", error);
        return { error: error.message };
    }
}

export async function addComment(targetId: string, type: 'memory' | 'polaroid', text: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId) return { error: 'No couple found' };

    const collectionName = type === 'memory' ? 'memories' : 'polaroids';
    const docRef = doc(db, 'couples', coupleId, collectionName, targetId);

    const newComment = {
        id: `comment_${Date.now()}`,
        user_id: user.uid,
        user_name: state.profile?.display_name || 'Partner',
        user_avatar_url: state.profile?.avatar_url || null,
        text,
        created_at: Date.now()
    };

    try {
        await updateDoc(docRef, {
            comments: arrayUnion(newComment),
            updated_at: serverTimestamp()
        });
        return { success: true };
    } catch (error: any) {
        console.error("addComment error:", error);
        return { error: error.message };
    }
}

export async function deletePolaroid(polaroid: any) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = resolveCoupleId(state);
    if (!coupleId || typeof coupleId !== 'string') return { error: 'No couple found' };

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        let polaroidId: string;
        let polaroidObj: any = null;

        if (typeof polaroid === 'string') {
            polaroidId = polaroid;
        } else if (polaroid && typeof polaroid.id === 'string') {
            polaroidId = polaroid.id;
            polaroidObj = polaroid;
        } else {
            console.error("[Auth] deletePolaroid: Invalid polaroid input", polaroid);
            return { error: 'Invalid polaroid input' };
        }

        const docRef = doc(db, 'couples', coupleId, 'polaroids', polaroidId);
        await deleteDoc(docRef);

        // Cleanup R2 (Only if we have the full object with image_url)
        if (polaroidObj?.image_url && !polaroidObj.image_url.startsWith('http')) {
            const cleanPath = polaroidObj.image_url.replace(/^\/+/, '').replace(/^polaroids\//i, '');
            const fullPath = `polaroids/${cleanPath}`;

            if (R2_URL) {
                try {
                    const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/polaroids/${cleanPath}`;
                    const headers: Record<string, string> = {};
                    if (R2_SECRET) {
                        headers['Authorization'] = `Bearer ${R2_SECRET}`;
                    }
                    await fetch(r2DeleteUrl, { method: 'DELETE', headers });
                } catch (e) {
                    console.error("[PolaroidCleanup] R2 delete failed:", e);
                }
            }

            try {
                await deleteObject(ref(storage, fullPath));
            } catch (e) { /* non-critical */ }
        }

        return { success: true };
    } catch (error: any) {
        console.error("deletePolaroid error:", error);
        return { error: error.message };
    }
}


export async function uploadAvatar(uri: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Process Image
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 800 } }],
            { compress: 0.75, format: ImageManipulator.SaveFormat.WEBP }
        );

        const timestamp = Date.now();
        const fileName = `${user.uid}_${timestamp}.webp`;
        const storagePath = `avatars/${fileName}`;

        // SAFEST BLOB CREATION FOR REACT NATIVE:
        const response = await fetch(manipulated.uri);
        const blob = await response.blob();

        // 2. Upload to R2 (Primary)
        if (R2_URL) {
            try {
                const r2TargetUrl = `${R2_URL.replace(/\/$/, '')}/avatars/${fileName}`;
                const headers: Record<string, string> = {
                    'Content-Type': 'image/webp'
                };
                if (R2_SECRET) {
                    headers['Authorization'] = `Bearer ${R2_SECRET}`;
                }
                await fetch(r2TargetUrl, {
                    method: 'PUT',
                    headers,
                    body: blob
                });
            } catch (r2Err) {
                console.warn("R2 Upload failed, continuing with Firebase:", r2Err);
            }
        }

        // 3. Upload to Firebase (backup/meta) — best-effort only
        const storageRef = ref(storage, storagePath);
        try {
            await uploadBytes(storageRef, blob, { contentType: 'image/webp' });
        } catch (firstError: any) {
            // Do not surface a red error screen if backup storage is misconfigured.
            // R2 already has the primary copy; log as a DEV-only warning.
            if (__DEV__) {
                console.warn("Firebase avatar backup failed:", firstError?.code || firstError?.message || firstError);
            }
        }

        // 4. Update Profile in Firestore
        const timestampedPath = `${storagePath}?t=${Date.now()}`;
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            avatar_url: timestampedPath,
            updated_at: serverTimestamp()
        });

        // 5. Optimistically update local store so avatar updates instantly
        try {
            const current = useOrbitStore.getState().profile;
            useOrbitStore.setState({
                profile: {
                    ...(current || {}),
                    avatar_url: timestampedPath,
                },
            });
        } catch { /* non-critical */ }

        // 6. Cleanup OLD avatar
        const oldAvatar = state.profile?.avatar_url;
        if (oldAvatar && oldAvatar.startsWith('avatars/') && oldAvatar !== storagePath) {
            (async () => {
                try {
                    const cleanOldPath = oldAvatar.replace(/^avatars\//, '');
                    await deleteObject(ref(storage, oldAvatar));
                    if (R2_URL && R2_SECRET) {
                        const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/avatars/${cleanOldPath}`;
                        await fetch(r2DeleteUrl, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${R2_SECRET}` }
                        });
                    }
                } catch (cleanupErr) { /* non-critical */ }
            })();
        }

        return { success: true, url: storagePath };
    } catch (error: any) {
        console.error("uploadAvatar error:", error);
        return { error: error.code || error.message || "Unknown Upload Error" };
    }
}

/**
 * Sync deletion with Cloudflare R2 via worker.
 */
export async function deleteFromR2(path: string) {
    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;
    if (!R2_URL || !path) return;

    try {
        const cleanPath = path.replace(/^\/+/, '');
        const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/${cleanPath}`;
        const headers: Record<string, string> = {};
        if (R2_SECRET) {
            headers['Authorization'] = `Bearer ${R2_SECRET}`;
        }
        await fetch(r2DeleteUrl, {
            method: 'DELETE',
            headers
        });
    } catch (e) {
        console.warn("[R2] Delete failed:", e);
    }
}


