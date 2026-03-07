import { db, auth } from "@/lib/firebase/client";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { sendNotification } from "@/lib/client/notifications";
import { extractFilePathFromStorageUrl, deleteFromR2 } from "@/lib/storage";
import { LocalDB } from "@/lib/client/local-db";
import { Capacitor } from "@capacitor/core";

const isNative = () => Capacitor.isNativePlatform();

// ─────────────────────────────────────────────────────────────────────────────
// SQLite helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getPolaroidsFromSQLite(coupleId: string, currentUserId: string) {
    try {
        if (!isNative()) return null;
        const rows = await LocalDB.query<any>('polaroids', coupleId);
        const mine = rows.find((p: any) => p.user_id === currentUserId && !p.deleted) || null;
        const theirs = rows.find((p: any) => p.user_id !== currentUserId && !p.deleted) || null;
        return { userPolaroid: mine, partnerPolaroid: theirs };
    } catch { return null; }
}

async function upsertPolaroidToSQLite(polaroid: any) {
    try {
        if (!isNative()) return;
        await LocalDB.upsertFromSync('polaroids', {
            ...polaroid,
            pending_sync: 0,
            deleted: 0,
        });
    } catch { /* noop */ }
}

async function deletePolaroidFromSQLite(id: string, coupleId: string) {
    try {
        if (!isNative()) return;
        await LocalDB.delete('polaroids', id, coupleId);
    } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let lastPolaroidSyncAt = 0;
const POLAROID_SYNC_COOLDOWN = 30000;

export async function getDashboardPolaroids(coupleId: string, currentUserId: string) {
    const sqliteData = await getPolaroidsFromSQLite(coupleId, currentUserId);
    const now = Date.now();
    if (now - lastPolaroidSyncAt < POLAROID_SYNC_COOLDOWN && sqliteData) {
        return sqliteData;
    }

    try {
        const q = query(collection(db, 'couples', coupleId, 'polaroids'), orderBy('created_at', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        lastPolaroidSyncAt = Date.now();
        for (const row of data) {
            await upsertPolaroidToSQLite(row);
        }
        const mine = data.find((p: any) => p.user_id === currentUserId) || null;
        const theirs = data.find((p: any) => p.user_id !== currentUserId) || null;
        return { userPolaroid: mine, partnerPolaroid: theirs };
    } catch (e) {
        console.warn('[Polaroids] Firestore error:', e);
        return sqliteData;
    }
}

export async function createPolaroid(payload: {
    imageUrl: string;
    caption: string;
}) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    const storeState = (await import('@/lib/store/global-store')).useOrbitStore.getState();
    const storeProfile = storeState.profile;
    const storeCouple = storeState.couple;

    let userId = user.uid;
    let coupleId = storeProfile?.couple_id;
    let displayName = storeProfile?.display_name || '';
    let partnerId = storeCouple ? (storeCouple.user1_id === userId ? storeCouple.user2_id : storeCouple.user1_id) : '';

    if (!coupleId) {
        const userDoc = await getDoc(doc(db, "users", userId));
        const profile = userDoc.data();
        coupleId = profile?.couple_id;
        displayName = profile?.display_name || '';
        if (!coupleId) return { error: "No couple linked" };

        const coupleDoc = await getDoc(doc(db, "couples", coupleId));
        const coupleData = coupleDoc.data();
        partnerId = coupleData?.user1_id === userId ? coupleData?.user2_id : coupleData?.user1_id;
    }

    const cleanUrl = payload.imageUrl.split('?t=')[0].split('&t=')[0];

    try {
        const polaroidRef = doc(db, "couples", coupleId, "polaroids", userId);
        const polaroidData = {
            image_url: cleanUrl,
            caption: payload.caption,
            user_id: userId,
            couple_id: coupleId,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        await setDoc(polaroidRef, polaroidData, { merge: true });

        const finalPolaroid = {
            id: userId,
            ...polaroidData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await upsertPolaroidToSQLite({ ...finalPolaroid, pending_sync: 0 });

        if (partnerId) {
            sendNotification({
                recipientId: partnerId,
                actorId: userId,
                type: 'polaroid',
                title: 'New Polaroid Snapped',
                message: `${displayName || 'Your partner'} just snapped a new polaroid!`,
                actionUrl: `/dashboard?polaroidId=${encodeURIComponent(userId)}`,
                metadata: { polaroid_id: userId },
            });
        }

        return { success: true, data: finalPolaroid };
    } catch (error: any) {
        console.error('[Polaroid] Firestore error:', error);
        return { error: error.message };
    }
}

export async function deletePolaroid(id: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    const storeState = (await import('@/lib/store/global-store')).useOrbitStore.getState();
    const coupleId = storeState.profile?.couple_id;
    if (!coupleId) return { error: "No couple linked" };

    try {
        const polaroidRef = doc(db, "couples", coupleId, "polaroids", id);
        const polaroidDoc = await getDoc(polaroidRef);
        const polaroidData = polaroidDoc.data();

        if (!polaroidData || polaroidData.user_id !== user.uid) {
            return { error: "Permission denied or not found" };
        }

        await deleteDoc(polaroidRef);

        if (polaroidData.image_url) {
            try {
                const path = extractFilePathFromStorageUrl(polaroidData.image_url, 'memories');
                if (path) {
                    await deleteFromR2('memories', path);
                }
            } catch { }
        }

        await deletePolaroidFromSQLite(id, coupleId);
        return { success: true };
    } catch (error: any) {
        console.error('[Polaroids] Delete error:', error);
        return { error: error.message };
    }
}

export async function savePolaroidToMemories(polaroid: any, saverProfile: any, uploaderProfile: any) {
    const originalCaption = polaroid.caption || "A sweet moment";
    const uploaderName = uploaderProfile?.display_name || "Partner";
    const saverName = saverProfile?.display_name || "You";
    const narrativeDescription = `Shared by ${uploaderName}. Saved by ${saverName}.\n\n${originalCaption}`;

    const memoryPayload = {
        title: `Polaroid Moment`,
        description: narrativeDescription,
        image_urls: [polaroid.image_url],
        location: null,
        memory_date: polaroid.created_at || new Date().toISOString()
    };

    const { createMemory } = await import("./memories");
    return createMemory(memoryPayload);
}
