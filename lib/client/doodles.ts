import { db, auth } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { LocalDB } from "@/lib/client/local-db";
import { Capacitor } from "@capacitor/core";

const isNative = () => Capacitor.isNativePlatform();

export async function saveDoodle(path: string, knownCoupleId?: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    let coupleId = knownCoupleId;
    if (!coupleId) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        coupleId = userDoc.data()?.couple_id;
    }

    if (!coupleId) return { error: "No couple linked" };

    try {
        // Single document for the latest doodle to simplify real-time listeners
        const doodleRef = doc(db, "couples", coupleId, "doodles", "latest");
        await setDoc(doodleRef, {
            couple_id: coupleId,
            user_id: user.uid,
            path_data: path,
            updated_at: serverTimestamp()
        }, { merge: true });

        // Write to SQLite for native offline persistence
        if (isNative()) {
            try {
                await LocalDB.upsertFromSync('doodles', {
                    id: coupleId,
                    couple_id: coupleId,
                    user_id: user.uid,
                    path_data: path,
                    updated_at: new Date().toISOString(),
                    pending_sync: 0
                });
            } catch (e) { console.warn('[saveDoodle] SQLite mirror failed:', e); }
        }

        return { success: true };
    } catch (error: any) {
        console.error("[saveDoodle] Firestore error:", error.message);
        return { error: error.message };
    }
}

export async function getDoodle(providedCoupleId?: string) {
    const user = auth.currentUser;
    if (!user) return null;

    let coupleId = providedCoupleId;
    if (!coupleId) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        coupleId = userDoc.data()?.couple_id;
    }

    if (!coupleId) return null;

    // On Native: try SQLite first for instant render
    if (isNative()) {
        try {
            const rows = await LocalDB.query<any>('doodles', coupleId);
            if (rows && rows.length > 0) {
                return rows[0];
            }
        } catch { /* fallback to firestore */ }
    }

    try {
        const doodleDoc = await getDoc(doc(db, "couples", coupleId, "doodles", "latest"));
        const result = doodleDoc.exists() ? doodleDoc.data() : null;

        // Cache to SQLite if we got a valid result
        if (result && isNative()) {
            try {
                await LocalDB.upsertFromSync('doodles', {
                    id: (result as any).id || (result as any).couple_id || coupleId,
                    couple_id: (result as any).couple_id || coupleId,
                    ...(result as any),
                    pending_sync: 0
                });
            } catch { /* noop */ }
        }

        return result;
    } catch (e) {
        console.error('[getDoodle] Firestore error:', e);
        return null;
    }
}
