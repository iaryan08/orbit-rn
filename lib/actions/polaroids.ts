"use server";

import { adminDb } from "@/lib/firebase/admin";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/firebase/auth-server";
import { sendNotification } from "@/lib/actions/notifications";
import { FieldValue } from "firebase-admin/firestore";

export async function getLatestPolaroid() {
    const user = await requireUser();
    if (!user) return null;

    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const profile = userDoc.data();
    if (!profile?.couple_id) return null;

    const snap = await adminDb.collection('couples').doc(profile.couple_id).collection('polaroids')
        .orderBy("created_at", "desc")
        .limit(1)
        .get();

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function getDashboardPolaroids(providedCoupleId?: string) {
    const user = await requireUser();
    if (!user) return { userPolaroid: null, partnerPolaroid: null };

    let coupleId = providedCoupleId;
    if (!coupleId) {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        coupleId = userDoc.data()?.couple_id;
    }

    if (!coupleId) return { userPolaroid: null, partnerPolaroid: null };

    const coupleDoc = await adminDb.collection('couples').doc(coupleId).get();
    const couple = coupleDoc.data();
    if (!couple) return { userPolaroid: null, partnerPolaroid: null };

    const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;

    const [userSnap, partnerSnap] = await Promise.all([
        adminDb.collection('couples').doc(coupleId).collection('polaroids')
            .where("user_id", "==", user.uid)
            .orderBy("created_at", "desc")
            .limit(1)
            .get(),
        partnerId ? adminDb.collection('couples').doc(coupleId).collection('polaroids')
            .where("user_id", "==", partnerId)
            .orderBy("created_at", "desc")
            .limit(1)
            .get() : Promise.resolve({ empty: true, docs: [] })
    ]);

    return {
        userPolaroid: userSnap.empty ? null : { id: userSnap.docs[0].id, ...userSnap.docs[0].data() },
        partnerPolaroid: partnerSnap.empty ? null : { id: partnerSnap.docs[0].id, ...partnerSnap.docs[0].data() }
    };
}

export async function createPolaroid(payload: {
    imageUrl: string;
    caption: string;
}) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" };

    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const profile = userDoc.data();
    if (!profile?.couple_id) return { error: "No couple linked" };

    const coupleDoc = await adminDb.collection('couples').doc(profile.couple_id).get();
    const couple = coupleDoc.data();
    if (!couple) return { error: "Couple data error" };

    const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;

    // Delete previous polaroids for this user
    const oldSnaps = await adminDb.collection('couples').doc(profile.couple_id).collection('polaroids')
        .where("user_id", "==", user.uid)
        .get();

    const batch = adminDb.batch();
    oldSnaps.docs.forEach(doc => batch.delete(doc.ref));

    // Insert new
    const newRef = adminDb.collection('couples').doc(profile.couple_id).collection('polaroids').doc();
    batch.set(newRef, {
        image_url: payload.imageUrl,
        caption: payload.caption,
        user_id: user.uid,
        couple_id: profile.couple_id,
        created_at: FieldValue.serverTimestamp()
    });

    await batch.commit();

    // Notify Partner
    if (partnerId) {
        await sendNotification({
            recipientId: partnerId,
            actorId: user.uid,
            type: 'polaroid',
            title: 'New Polaroid Snapped',
            message: `${profile.display_name || 'Your partner'} just snapped a new polaroid!`,
            actionUrl: `/dashboard?polaroidId=${encodeURIComponent(newRef.id)}`,
            metadata: { polaroid_id: newRef.id }
        });
    }

    revalidatePath("/dashboard");
    return { success: true };
}

import { deleteFromR2, extractFilePathFromStorageUrl } from "@/lib/storage";

export async function deletePolaroid(id: string) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" };

    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const coupleId = userDoc.data()?.couple_id;
    if (!coupleId) return { error: "No couple linked" };

    try {
        const docRef = adminDb.collection('couples').doc(coupleId).collection('polaroids').doc(id);
        const snap = await docRef.get();
        const data = snap.data();

        if (data?.image_url) {
            const path = extractFilePathFromStorageUrl(data.image_url, 'polaroids');
            if (path) await deleteFromR2('polaroids', path);
        }

        await docRef.delete();
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}
