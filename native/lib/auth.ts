import { auth, db } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { useOrbitStore } from './store';
import { getTodayIST } from './utils';
import { sendNotification } from './notifications';

export async function submitMood(mood: string, note?: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();

    try {
        const moodData = {
            user_id: user.uid,
            couple_id: coupleId,
            emoji: mood,
            mood_text: note || null,
            mood_date: today,
            created_at: serverTimestamp()
        };

        await addDoc(collection(db, 'couples', coupleId, 'moods'), moodData);

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
        return { error: error.message };
    }
}

export async function clearMood() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
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
        return { error: error.message };
    }
}

export async function logSymptoms(symptoms: string[], options?: { notifyPartner?: boolean; customPrefix?: string; note?: string }) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
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
            let message = symptoms.length > 0
                ? `${state.profile?.display_name || 'Partner'} ${prefix} - ${symptoms.join(', ')}.`
                : `${state.profile?.display_name || 'Partner'} shared a feeling update: no symptoms right now.`;

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
                metadata: { source: 'cycle_symptoms_update', symptoms }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logSexDrive(level: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
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
        return { error: error.message };
    }
}

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
    time?: string;
}) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = (await import('./store')).useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
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
        return { error: error.message };
    }
}

export async function addBucketItem(title: string, description: string = '', is_private: boolean = false) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        const itemData = {
            couple_id: coupleId,
            created_by: user.uid,
            title,
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
                message: `${state.profile?.display_name || 'Your partner'} added "${title}" to your bucket list.`,
                actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(docRef.id)}`,
                metadata: { bucket_item_id: docRef.id },
            });
        }

        return { success: true, id: docRef.id };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
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
        return { error: error.message };
    }
}

export async function deleteBucketItem(id: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        await deleteDoc(doc(db, 'couples', coupleId, 'bucket_list', id));
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}
