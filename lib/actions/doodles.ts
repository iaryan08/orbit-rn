"use server";

import { adminDb } from "@/lib/firebase/admin";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/firebase/auth-server";
import { FieldValue } from "firebase-admin/firestore";

export async function saveDoodle(path: string) {
    const user = await requireUser();
    if (!user) return { error: "Unauthorized" };

    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    const coupleId = userDoc.data()?.couple_id;
    if (!coupleId) return { error: "No couple linked" };

    try {
        // Upsert doodle into the 'doodles' subcollection OR a root doodles with doc=coupleId
        // The original used a root 'doodles' table with onConflict couple_id.
        // We'll use a specific doc in a root 'doodles' collection for simplicity.
        await adminDb.collection('doodles').doc(coupleId).set({
            couple_id: coupleId,
            user_id: user.uid,
            path_data: path,
            updated_at: FieldValue.serverTimestamp()
        }, { merge: true });

        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function getDoodle(providedCoupleId?: string) {
    const user = await requireUser();
    if (!user) return null;

    let coupleId = providedCoupleId;
    if (!coupleId) {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        coupleId = userDoc.data()?.couple_id;
    }

    if (!coupleId) return null;

    const doodleDoc = await adminDb.collection('doodles').doc(coupleId).get();
    if (!doodleDoc.exists) return null;

    return { id: doodleDoc.id, ...doodleDoc.data() };
}
