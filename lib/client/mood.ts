import { db, auth, rtdb } from '@/lib/firebase/client';
import { doc, getDoc, addDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';
import { ref, set, serverTimestamp as rtdbTimestamp } from 'firebase/database';
import { MoodType } from '@/lib/constants';
import { getTodayIST } from '@/lib/utils';
import { sendNotification } from '@/lib/client/notifications';
import { LocalDB } from './local-db';
import { Capacitor } from '@capacitor/core';
import { writeOfflineCache, readOfflineCache } from './offline-cache';

export async function submitMood(mood: MoodType, note?: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const storeState = (await import('@/lib/store/global-store')).useOrbitStore.getState();
    const profile = storeState.profile;
    const couple = storeState.couple;

    let coupleId = profile?.couple_id;
    let displayName = profile?.display_name || '';
    let partnerId = couple ? (couple.user1_id === user.uid ? couple.user2_id : couple.user1_id) : '';

    if (!coupleId) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();
        coupleId = userData?.couple_id;
        displayName = userData?.display_name || '';
        if (!coupleId) return { error: 'You need to be paired with a partner first' };

        const coupleDoc = await getDoc(doc(db, "couples", coupleId));
        const coupleData = coupleDoc.data();
        partnerId = coupleData?.user1_id === user.uid ? coupleData?.user2_id : coupleData?.user1_id;
    }

    const todayStr = getTodayIST();

    try {
        const moodData = {
            user_id: user.uid,
            couple_id: coupleId,
            emoji: mood,
            mood_text: note || null,
            mood_date: todayStr,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'couples', coupleId, 'moods'), moodData);

        // Immediate LocalDB sync for native
        if (Capacitor.isNativePlatform()) {
            try {
                await LocalDB.upsertFromSync('moods', {
                    id: docRef.id,
                    ...moodData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    pending_sync: 0
                });
            } catch (sqlErr) {
                console.warn('[submitMood] SQLite immediate sync failed:', sqlErr);
            }
        }

        // Live broadcast via RTDB (Ephemera)
        if (partnerId) {
            const broadcastRef = ref(rtdb, `broadcasts/${coupleId}`);
            await set(broadcastRef, {
                event: 'mood_updated',
                payload: { user_id: user.uid, mood, note, id: docRef.id },
                senderId: user.uid,
                timestamp: rtdbTimestamp()
            });

            await sendNotification({
                recipientId: partnerId,
                actorId: user.uid,
                type: 'mood',
                title: 'New Mood Log',
                message: `${displayName || 'Your partner'} is feeling ${mood} ${note ? 'with a note' : ''}`,
                actionUrl: '/dashboard'
            });
        }

        return { success: true, id: docRef.id };
    } catch (e: any) {
        console.error('[submitMood] Firestore error:', e);
        return { error: e.message };
    }
}

export async function getTodayMoods() {
    const user = auth.currentUser;
    if (!user) return null;

    const storeState = (await import('@/lib/store/global-store')).useOrbitStore.getState();
    const coupleId = storeState.profile?.couple_id;
    if (!coupleId) return null;

    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const q = query(
            collection(db, 'couples', coupleId, 'moods'),
            where('created_at', '>=', Timestamp.fromDate(todayStart)),
            orderBy('created_at', 'desc')
        );

        const snap = await getDocs(q);
        return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            mood: (d.data() as any).emoji,
            note: (d.data() as any).mood_text
        }));
    } catch (e) {
        console.error('[getTodayMoods] Firestore error:', e);
        return null;
    }
}

export async function getMoodHistory(days: number = 7) {
    const user = auth.currentUser;
    if (!user) return null;

    const storeState = (await import('@/lib/store/global-store')).useOrbitStore.getState();
    const coupleId = storeState.profile?.couple_id;
    if (!coupleId) return null;

    try {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const q = query(
            collection(db, 'couples', coupleId, 'moods'),
            where('created_at', '>=', Timestamp.fromDate(startDate)),
            orderBy('created_at', 'desc'),
            limit(100)
        );

        const snap = await getDocs(q);
        return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            mood: (d.data() as any).emoji,
            note: (d.data() as any).mood_text
        }));
    } catch (e) {
        console.error('[getMoodHistory] Firestore error:', e);
        return null;
    }
}
