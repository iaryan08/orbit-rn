'use server'

import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { sendNotification } from '@/lib/actions/notifications'
import { getTodayIST } from '@/lib/utils'
import { requireUser } from '@/lib/firebase/auth-server'
import { FieldValue } from 'firebase-admin/firestore'

// --- AUTH ACTIONS ---

export async function signUp(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const displayName = formData.get('displayName') as string
  const gender = formData.get('gender') as string

  try {
    const user = await adminAuth.createUser({
      email,
      password,
      displayName,
    });

    await adminDb.collection('users').doc(user.uid).set({
      display_name: displayName,
      gender,
      email,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    revalidatePath('/', 'layout')
    redirect('/auth/sign-up-success')
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function signIn(prevState: any, formData: FormData) {
  // Client-side handles Firebase signInWithPassword
  // This action is mostly legacy if the client uses the SDK directly.
  return { error: "Please use the client-side Firebase login." }
}

export async function signOut() {
  redirect('/')
}

export async function getUser() {
  const user = await requireUser();
  return user ? { id: user.uid, email: user.email } : null;
}

export async function getProfile() {
  const user = await requireUser();
  if (!user) return null

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  if (!userDoc.exists) return null;
  const profile = { id: user.uid, ...userDoc.data() } as any;

  let couple = null
  let partner = null

  if (profile.couple_id) {
    const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
    couple = coupleDoc.exists ? { id: profile.couple_id, ...coupleDoc.data() } : null;

    if (couple) {
      const c = couple as any;
      const partnerId = c.user1_id === user.uid ? c.user2_id : c.user1_id
      if (partnerId) {
        const partnerDoc = await adminDb.collection('users').doc(partnerId).get();
        partner = partnerDoc.exists ? { id: partnerId, ...partnerDoc.data() } : null;
      }
    }
  }

  return { ...profile, couple, partner }
}

// --- DASHBOARD & VIEW STATE ---

export async function fetchUnreadCounts() {
  const user = await requireUser();
  if (!user) return { memories: 0, letters: 0 }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const profile = userDoc.data();
  if (!profile?.couple_id) return { memories: 0, letters: 0 }

  const lastMemView = profile.last_viewed_memories_at ? new Date(profile.last_viewed_memories_at) : new Date(0);
  const lastLetView = profile.last_viewed_letters_at ? new Date(profile.last_viewed_letters_at) : new Date(0);

  const memoriesSnap = await adminDb.collection('couples').doc(profile.couple_id).collection('memories')
    .where('created_at', '>', lastMemView)
    .get();

  const lettersSnap = await adminDb.collection('couples').doc(profile.couple_id).collection('letters')
    .where('receiver_id', '==', user.uid)
    .where('created_at', '>', lastLetView)
    .get();

  return {
    memories: memoriesSnap.size,
    letters: lettersSnap.size
  }
}

export async function markAsViewed(type: 'memories' | 'letters') {
  const user = await requireUser();
  if (!user) return

  const field = type === 'memories' ? 'last_viewed_memories_at' : 'last_viewed_letters_at'
  await adminDb.collection('users').doc(user.uid).update({
    [field]: new Date().toISOString()
  });

  revalidatePath('/dashboard', 'layout')
}

export async function refreshDashboard() {
  revalidatePath('/dashboard', 'layout')
}

// --- PROFILE & COUPLE MANAGEMENT ---

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const displayName = formData.get('displayName') as string
  const avatarUrl = formData.get('avatarUrl') as string

  try {
    await adminDb.collection('users').doc(user.uid).update({
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: FieldValue.serverTimestamp(),
    });
    return { success: true }
  } catch (error: any) {
    return { error: error.message }
  }
}

export async function generatePairCode() {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const existingCoupleId = userDoc.data()?.couple_id;

  if (existingCoupleId) {
    const coupleDoc = await adminDb.collection('couples').doc(existingCoupleId).get();
    return { success: true, pairCode: coupleDoc.data()?.couple_code }
  }

  const pairCode = Math.random().toString(36).substring(2, 8).toUpperCase()
  const coupleRef = await adminDb.collection('couples').add({
    user1_id: user.uid,
    couple_code: pairCode,
    created_at: FieldValue.serverTimestamp(),
  });

  await adminDb.collection('users').doc(user.uid).update({ couple_id: coupleRef.id });

  return { success: true, pairCode }
}

export async function joinCouple(pairCode: string) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const trimmedCode = pairCode.trim().toUpperCase()

  try {
    const couplesSnap = await adminDb.collection('couples').where('couple_code', '==', trimmedCode).limit(1).get();
    if (couplesSnap.empty) return { error: "Invalid pair code" }

    const coupleDoc = couplesSnap.docs[0];
    const coupleData = coupleDoc.data();

    if (coupleData.user2_id) return { error: "This couple is already full" }
    if (coupleData.user1_id === user.uid) return { error: "You cannot join your own couple" }

    await coupleDoc.ref.update({
      user2_id: user.uid,
      joined_at: FieldValue.serverTimestamp()
    });

    await adminDb.collection('users').doc(user.uid).update({ couple_id: coupleDoc.id });

    revalidatePath('/dashboard')
    return { success: true, couple: { id: coupleDoc.id, ...coupleData, user2_id: user.uid } }
  } catch (err: any) {
    return { error: err.message }
  }
}

// --- LUNARA / CYCLE ACTIONS ---

export async function saveLunaraOnboarding(onboardingData: any) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const coupleId = userDoc.data()?.couple_id;

  try {
    await adminDb.collection('couples').doc(coupleId || 'none').collection('cycle_profiles').doc(user.uid).set({
      user_id: user.uid,
      couple_id: coupleId || null,
      last_period_start: onboardingData.lastPeriodStart,
      avg_cycle_length: parseInt(onboardingData.cycleLength),
      avg_period_length: parseInt(onboardingData.periodLength),
      contraception: onboardingData.contraception,
      trying_to_conceive: onboardingData.tryingToConceive === 'yes',
      regularity: onboardingData.regularity,
      typical_symptoms: onboardingData.symptoms,
      tracking_goals: onboardingData.trackingGoals,
      sharing_enabled: onboardingData.sharingEnabled,
      onboarding_completed: true,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    revalidatePath('/dashboard', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function logSupportAction(trackerId: string, actionText: string, category: string) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const coupleId = userDoc.data()?.couple_id;

  try {
    const logData = {
      tracker_id: trackerId,
      supporter_id: user.uid,
      couple_id: coupleId || null,
      action_text: actionText,
      category: category,
      log_date: new Date().toISOString().split('T')[0],
      created_at: FieldValue.serverTimestamp()
    };

    await adminDb.collection('couples').doc(coupleId || 'none').collection('support_logs').add(logData);

    revalidatePath('/dashboard', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function logPeriodStart() {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const profile = userDoc.data();
  const today = getTodayIST()

  try {
    const cpRef = adminDb.collection('couples').doc(profile?.couple_id || 'none').collection('cycle_profiles').doc(user.uid);
    await cpRef.update({
      last_period_start: today,
      period_ended_at: null,
      updated_at: FieldValue.serverTimestamp()
    });

    await adminDb.collection('couples').doc(profile?.couple_id || 'none').collection('cycle_logs').doc(`${user.uid}_${today}`).set({
      user_id: user.uid,
      couple_id: profile?.couple_id || null,
      log_date: today,
      flow_level: 'medium',
      notes: 'Period started',
      created_at: FieldValue.serverTimestamp()
    }, { merge: true });

    if (profile?.couple_id) {
      const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
      const couple = coupleDoc.data();
      const partnerId = couple?.user1_id === user.uid ? couple?.user2_id : couple?.user1_id;
      if (partnerId) {
        await sendNotification({
          recipientId: partnerId,
          actorId: user.uid,
          type: 'period_start',
          title: 'Period Started',
          message: `${profile?.display_name || 'Your partner'} logged the start of their period.`,
          actionUrl: '/dashboard',
          metadata: { log_date: today }
        });
      }
    }

    revalidatePath('/dashboard', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function logSymptoms(symptoms: string[]) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const profile = userDoc.data();
  const today = getTodayIST()

  try {
    await adminDb.collection('couples').doc(profile?.couple_id || 'none').collection('cycle_logs').doc(`${user.uid}_${today}`).set({
      user_id: user.uid,
      couple_id: profile?.couple_id || null,
      log_date: today,
      symptoms: symptoms,
      updated_at: FieldValue.serverTimestamp()
    }, { merge: true });

    revalidatePath('/dashboard', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
export async function toggleLunaraSharing(enabled: boolean) {
  const user = await requireUser();
  if (!user) return { error: 'Not authenticated' }

  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const coupleId = userDoc.data()?.couple_id;

  try {
    await adminDb.collection('couples').doc(coupleId || 'none').collection('cycle_profiles').doc(user.uid).update({
      sharing_enabled: enabled,
      updated_at: FieldValue.serverTimestamp()
    });

    revalidatePath('/dashboard', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message }
  }
}
