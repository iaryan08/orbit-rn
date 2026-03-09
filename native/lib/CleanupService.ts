import { collection, query, where, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from './firebase';
import { ref, deleteObject } from 'firebase/storage';
import { useOrbitStore } from './store';

const POLAROID_EXPIRY_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runBackgroundCleanup() {
    const user = auth.currentUser;
    if (!user) return;

    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return;

    console.log("[CleanupService] Running 3-day Vanish Mode cleanup...");

    try {
        const now = Date.now();
        const expiryTime = now - (POLAROID_EXPIRY_DAYS * MS_PER_DAY);

        // 1. Find expired Polaroids in Firestore
        const polaroidsRef = collection(db, 'couples', coupleId, 'polaroids');
        const q = query(polaroidsRef, where('created_at', '<', new Date(expiryTime)));
        const snap = await getDocs(q);

        if (snap.empty) {
            console.log("[CleanupService] No expired polaroids found.");
            return;
        }

        console.log(`[CleanupService] Found ${snap.docs.length} expired polaroids.`);

        for (const polaroidDoc of snap.docs) {
            const data = polaroidDoc.data();
            const polaroidId = polaroidDoc.id;

            // 2. Delete from Storage (R2 & Firebase)
            if (data.image_url) {
                await cleanupMediaStorage(data.image_url);
            }

            // 3. Delete Metadata from Firestore
            await deleteDoc(polaroidDoc.ref);
            console.log(`[CleanupService] Deleted expired polaroid: ${polaroidId}`);
        }

    } catch (error) {
        console.error("[CleanupService] Error during cleanup:", error);
    }
}

async function cleanupMediaStorage(url: string) {
    if (!url || url.startsWith('http')) return;

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    const cleanPath = url.replace(/^\/+/, '').replace(/^polaroids\//i, '');
    const fullPath = `polaroids/${cleanPath}`;

    // Cleanup R2 (Primary Storage)
    if (R2_URL && R2_SECRET) {
        try {
            const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/polaroids/${cleanPath}`;
            await fetch(r2DeleteUrl, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${R2_SECRET}` }
            });
        } catch (e) {
            console.error("[CleanupService] R2 delete failed:", e);
        }
    }

    // Cleanup Firebase Storage (Backup Storage)
    try {
        await deleteObject(ref(storage, fullPath));
    } catch (e: any) {
        if (e.code !== 'storage/object-not-found') {
            console.error("[CleanupService] Firebase delete failed:", e);
        }
    }
}
