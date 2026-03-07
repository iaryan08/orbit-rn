'use server'

import { adminDb } from '@/lib/firebase/admin'
import { revalidatePath, revalidateTag } from 'next/cache'
import { MoodType } from '@/lib/constants'
import { getTodayIST } from '@/lib/utils'
import { sendNotification } from '@/lib/actions/notifications'
import { requireUser } from '@/lib/firebase/auth-server'
import { FieldValue } from 'firebase-admin/firestore'

export async function submitMood(mood: MoodType, note?: string) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  try {
    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const profile = userDoc.data();
    if (!profile?.couple_id) return { error: 'You need to be paired with a partner first' }

    const todayStr = getTodayIST()

    const moodData = {
      user_id: user.uid,
      couple_id: profile.couple_id,
      emoji: mood,
      mood_text: note || null,
      mood_date: todayStr,
      created_at: FieldValue.serverTimestamp()
    };

    await adminDb.collection('couples').doc(profile.couple_id).collection('moods').add(moodData);

    // Surgical Cache Invalidation
    revalidateTag(`dashboard-${user.uid}`, 'default')

    const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
    const couple = coupleDoc.data();

    if (couple) {
      const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id
      if (partnerId) {
        revalidateTag(`dashboard-${partnerId}`, 'default')
        await sendNotification({
          recipientId: partnerId,
          actorId: user.uid,
          type: 'mood',
          title: 'New Mood Log',
          message: `${profile.display_name || 'Your partner'} is feeling ${mood} ${note ? 'with a note' : ''}`,
          actionUrl: '/dashboard'
        })
      }
    }

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to submit mood' }
  }
}

export async function getTodayMoods() {
  const user = await requireUser();
  if (!user) return null

  try {
    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const coupleId = userDoc.data()?.couple_id;
    if (!coupleId) return null

    // Fetch from last 24h or filter by mood_date
    const todayStr = getTodayIST()
    const moodsSnap = await adminDb.collection('couples').doc(coupleId).collection('moods')
      .where('mood_date', '==', todayStr)
      .orderBy('created_at', 'desc')
      .get();

    // In Firestore version, we'll need to hydrate profiles manually or assume client handles it
    // For server actions returning data to Sever Components:
    const moods = await Promise.all(moodsSnap.docs.map(async doc => {
      const data = doc.data();
      const pDoc = await adminDb.collection('users').doc(data.user_id).get();
      const p = pDoc.data();
      return {
        id: doc.id,
        ...data,
        mood: data.emoji,
        note: data.mood_text,
        profiles: {
          display_name: p?.display_name,
          avatar_url: p?.avatar_url
        }
      };
    }));

    return moods
  } catch (err) {
    console.error('[getTodayMoods] Error:', err);
    return null;
  }
}

export async function getMoodHistory(days: number = 7) {
  const user = await requireUser();
  if (!user) return null

  try {
    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const coupleId = userDoc.data()?.couple_id;
    if (!coupleId) return null

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const moodsSnap = await adminDb.collection('couples').doc(coupleId).collection('moods')
      .where('created_at', '>=', startDate)
      .orderBy('created_at', 'desc')
      .get();

    const moods = await Promise.all(moodsSnap.docs.map(async doc => {
      const data = doc.data();
      const pDoc = await adminDb.collection('users').doc(data.user_id).get();
      const p = pDoc.data();
      return {
        id: doc.id,
        ...data,
        mood: data.emoji,
        note: data.mood_text,
        profiles: {
          display_name: p?.display_name,
          avatar_url: p?.avatar_url
        }
      };
    }));

    return moods
  } catch (err) {
    console.error('[getMoodHistory] Error:', err);
    return null;
  }
}
