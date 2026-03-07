import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
    runTransaction
} from 'firebase/firestore';
import { db, auth } from './client';

/**
 * Generates a 6-digit uppercase alphanumeric pair code.
 */
export function createRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, 0, I, 1 to avoid confusion
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Generates a pair code for the current user and saves it to a 'pair_codes' collection.
 */
export async function generatePairCode(force: boolean = false) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    try {
        // Check if user already has a code unless forced
        if (!force) {
            const q = query(collection(db, 'pair_codes'), where('user_id', '==', user.uid));
            const snap = await getDocs(q);
            if (!snap.empty) {
                return { success: true, pairCode: snap.docs[0].id };
            }
        }

        const newCode = createRandomCode();
        await setDoc(doc(db, 'pair_codes', newCode), {
            user_id: user.uid,
            display_name: user.displayName || 'Partner',
            created_at: serverTimestamp()
        });

        return { success: true, pairCode: newCode };
    } catch (error: any) {
        return { error: error.message };
    }
}

/**
 * Peeks at a pair code to see who it belongs to.
 */
export async function peekPairInvite(code: string) {
    try {
        const docSnap = await getDoc(doc(db, 'pair_codes', code.toUpperCase()));
        if (!docSnap.exists()) {
            return { error: 'Invalid or expired code' };
        }
        const data = docSnap.data();
        return { success: true, partner_display_name: data.display_name };
    } catch (error: any) {
        return { error: error.message };
    }
}

/**
 * Joins a couple using a pair code.
 */
export async function joinCouple(code: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    try {
        const codeRef = doc(db, 'pair_codes', code.toUpperCase());
        const codeSnap = await getDoc(codeRef);

        if (!codeSnap.exists()) return { error: 'Invalid code' };
        const codeData = codeSnap.data();
        const partnerId = codeData.user_id;

        if (partnerId === user.uid) return { error: "You can't pair with yourself!" };

        return await runTransaction(db, async (transaction) => {
            // 1. Create the 'couples' document
            const coupleRef = doc(collection(db, 'couples'));
            transaction.set(coupleRef, {
                user1_id: partnerId,
                user2_id: user.uid,
                couple_code: code.toUpperCase(), // Make it persistent
                paired_at: serverTimestamp(),
                anniversary_date: null
            });

            // 2. Update both users with the new couple_id (using set merge:true in case profiles are missing)
            transaction.set(doc(db, 'users', user.uid), { couple_id: coupleRef.id }, { merge: true });
            transaction.set(doc(db, 'users', partnerId), { couple_id: coupleRef.id }, { merge: true });

            // 3. Delete the pair code
            transaction.delete(codeRef);

            return { success: true, coupleId: coupleRef.id };
        });
    } catch (error: any) {
        return { error: error.message };
    }
}
