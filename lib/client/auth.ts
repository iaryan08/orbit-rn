import { auth, db, storage } from '@/lib/firebase/client'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { doc, getDoc, updateDoc, setDoc, query, collection, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { LocalDB } from './local-db'
import { extractFilePathFromStorageUrl } from '@/lib/storage'
import { Capacitor } from '@capacitor/core'
import { sendNotification } from './notifications'
import { getTodayIST } from '@/lib/utils'
import { useOrbitStore } from '@/lib/store/global-store'

const isValidId = (id: any): id is string => typeof id === 'string' && id !== 'undefined' && id.length > 0;

const LAST_VIEWED_MEMORIES_KEY = 'orbit:last_viewed_memories_at'
const LAST_VIEWED_LETTERS_KEY = 'orbit:last_viewed_letters_at'
const LAST_VIEWED_INTIMACY_KEY = 'orbit:last_viewed_intimacy_at'

export function clearProfileCaches() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('orbit_wallpaper_last_sync_at');
    localStorage.removeItem('orbit_active_session');
    localStorage.removeItem('orbit:cached_couple_id');
    localStorage.removeItem('orbit:last_synced_at');
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('orbit:dashboard:')) {
            toRemove.push(key);
        }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
}

export async function signOut() {
    clearProfileCaches();
    try {
        await firebaseSignOut(auth)
    } catch (err) {
        console.warn('[Auth] Remote signout failed or blocked:', err);
    }
}

export async function getUser() {
    return auth.currentUser;
}

export async function getProfile() {
    const user = auth.currentUser;
    if (!user) return null;

    const profileDoc = await getDoc(doc(db, 'users', user.uid));
    if (!profileDoc.exists()) return null;

    const profile = { id: profileDoc.id, ...profileDoc.data() } as any;

    if (!isValidId(profile.couple_id)) {
        return { ...profile, couple: null, partner: null };
    }

    const coupleDoc = await getDoc(doc(db, 'couples', profile.couple_id));
    if (!coupleDoc.exists()) return { ...profile, couple: null, partner: null };

    const couple = { id: coupleDoc.id, ...coupleDoc.data() } as any;
    const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;

    let partner = null;
    if (isValidId(partnerId)) {
        const partnerDoc = await getDoc(doc(db, 'users', partnerId));
        if (partnerDoc.exists()) {
            partner = { id: partnerDoc.id, ...partnerDoc.data() };
        }
    }

    return { ...profile, couple, partner };
}

export async function fetchUnreadCounts(providedUser?: any) {
    const state = useOrbitStore.getState();
    const profile = state.profile;
    const memories = state.memories || [];
    const letters = state.letters || [];
    const user = auth.currentUser;

    if (!user || !profile?.couple_id) return { memories: 0, letters: 0 };

    const lastViewedMemories = profile.last_viewed_memories_at || new Date(0).toISOString();
    const lastViewedLetters = profile.last_viewed_letters_at || new Date(0).toISOString();

    const unreadMemories = memories.filter((m: any) => m.created_at > lastViewedMemories).length;
    const unreadLetters = letters.filter((l: any) =>
        l.sender_id !== user.uid && l.created_at > lastViewedLetters
    ).length;

    return {
        memories: unreadMemories,
        letters: unreadLetters
    };
}

export async function markAsViewed(type: 'memories' | 'letters' | 'intimacy', providedUser?: any) {
    const user = auth.currentUser;
    if (!user) return;

    const field = type === 'memories' ? 'last_viewed_memories_at' : (type === 'letters' ? 'last_viewed_letters_at' : 'last_viewed_intimacy_at');
    const nowIso = new Date().toISOString();

    // Optimistically update global store
    const state = useOrbitStore.getState();
    if (state.profile) {
        state.setCoreData({
            profile: { ...state.profile, [field]: nowIso }
        });
    }

    try {
        await updateDoc(doc(db, 'users', user.uid), {
            [field]: nowIso
        });
    } catch (error: any) {
        console.warn(`[markAsViewed] Could not persist ${field} to profiles.`, error.message);
    }
}

export async function deleteMemory(memoryId: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const memoryRef = doc(db, 'couples', coupleId, 'memories', memoryId);
        const memorySnap = await getDoc(memoryRef);

        if (!memorySnap.exists()) return { success: true, deleted: false };

        const memoryData = memorySnap.data();

        // Storage cleanup
        if (memoryData.image_urls && memoryData.image_urls.length > 0) {
            for (const url of memoryData.image_urls) {
                const path = extractFilePathFromStorageUrl(url, 'memories');
                if (path) {
                    try {
                        const storageRef = ref(storage, `memories/${path}`);
                        await deleteObject(storageRef);
                    } catch (err) {
                        console.warn('[deleteMemory] Storage delete failed:', err);
                    }
                }
            }
        }

        await deleteDoc(memoryRef);

        if (Capacitor.isNativePlatform()) {
            await LocalDB.delete('memories', memoryId, coupleId);
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function updateProfile(formData: FormData) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const displayName = formData.get('displayName') as string;
    const avatarUrl = formData.get('avatarUrl') as string;

    try {
        await updateDoc(doc(db, 'users', user.uid), {
            display_name: displayName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        });
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function generatePairCode(forceNew: boolean = false) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { generatePairCode: genCode } = await import('@/lib/firebase/pairing');
    return genCode();
}

export async function joinCouple(pairCode: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { joinCouple: join } = await import('@/lib/firebase/pairing');
    return join(pairCode);
}

export async function updateLocation(locData: { latitude?: number; longitude?: number }) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    let timezone: string | undefined;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { }

    const isGps = typeof locData.latitude === 'number' && typeof locData.longitude === 'number';
    const lat = isGps ? locData.latitude! : null;
    const lng = isGps ? locData.longitude! : null;

    const payload: any = {
        latitude: lat,
        longitude: lng,
        location_source: isGps ? 'gps' : 'ip',
        updated_at: new Date().toISOString(),
    };
    if (timezone) payload.timezone = timezone;

    try {
        await updateDoc(doc(db, 'users', user.uid), payload);

        if (Capacitor.isNativePlatform()) {
            LocalDB.update('profiles', user.uid, '', payload).catch(() => { });
        }

        return { success: true, ...payload };
    } catch (error: any) {
        console.error('[Location] Update failed:', error);
        return { error: error.message };
    }
}

export async function logPeriodStart() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const cycleRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
        await setDoc(cycleRef, {
            user_id: user.uid,
            last_period_start: today,
            period_ended_at: null,
            updated_at: now
        }, { merge: true });

        const partnerProfile = state.partnerProfile;
        if (partnerProfile?.id) {
            await sendNotification({
                recipientId: partnerProfile.id,
                actorId: user.uid,
                type: 'period_start',
                title: 'Period Logged',
                message: `${state.profile?.display_name || 'Your partner'} logged period start.`,
                actionUrl: '/dashboard',
                metadata: { source: 'cycle_period_start', logDate: today }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logPeriodEnd() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const cycleRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
        await updateDoc(cycleRef, {
            period_ended_at: today,
            updated_at: now
        });

        const partnerProfile = state.partnerProfile;
        if (partnerProfile?.id) {
            await sendNotification({
                recipientId: partnerProfile.id,
                actorId: user.uid,
                type: 'period_start',
                title: 'Period Ended',
                message: `${state.profile?.display_name || 'Your partner'} logged period end.`,
                actionUrl: '/dashboard',
                metadata: { source: 'cycle_period_end', logDate: today }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logSymptoms(symptoms: string[], options?: { notifyPartner?: boolean; customPrefix?: string }) {
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
            updated_at: now
        }, { merge: true });

        if (options?.notifyPartner !== false && state.partnerProfile?.id) {
            const prefix = (options?.customPrefix || 'is having').trim();
            const message = symptoms.length > 0
                ? `${state.profile?.display_name || 'She'} ${prefix} - ${symptoms.join(', ')}.`
                : `${state.profile?.display_name || 'She'} shared a feeling update: no symptoms right now.`;

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

export async function saveLunaraOnboarding(data: any) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const now = new Date().toISOString();
    const payload = {
        user_id: user.uid,
        last_period_start: data.lastPeriodStart,
        avg_period_length: parseInt(data.periodLength),
        avg_cycle_length: parseInt(data.cycleLength),
        regularity: data.regularity,
        contraception: data.contraception,
        trying_to_conceive: data.tryingToConceive === 'yes',
        typical_symptoms: data.symptoms,
        tracking_goals: data.trackingGoals,
        sharing_enabled: data.sharingEnabled,
        updated_at: now
    };

    try {
        const cycleRef = doc(db, 'couples', coupleId, 'cycle_profiles', user.uid);
        await setDoc(cycleRef, payload, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logSupportAction(partnerId: string, action: string, category: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const logRef = doc(collection(db, 'couples', coupleId, 'support_logs'));
        await setDoc(logRef, {
            supporter_id: user.uid,
            tracker_id: partnerId,
            action_text: action,
            category: category,
            log_date: getTodayIST(),
            created_at: serverTimestamp()
        });

        await sendNotification({
            recipientId: partnerId,
            actorId: user.uid,
            type: 'announcement',
            title: 'Support Received',
            message: `${state.profile?.display_name || 'Your partner'} supported you with: ${action}`,
            actionUrl: '/dashboard'
        });

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

export async function refreshDashboard() {
    console.log('[Firebase-Auth] refreshDashboard called (Handled by listeners)');
}
