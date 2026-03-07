import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './client';

const RECENT_ACCOUNTS_KEY = 'orbit:recent_accounts:v1';

function storeRecentAccount(email: string) {
    if (typeof window === 'undefined') return;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    try {
        const raw = localStorage.getItem(RECENT_ACCOUNTS_KEY);
        const current = raw ? (JSON.parse(raw) as string[]) : [];
        const unique = [normalized, ...current.filter((e) => e !== normalized)].slice(0, 5);
        localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(unique));
    } catch { }
}

export async function signInClient(email: string, password: string) {
    try {
        const normalizedEmail = email.trim().toLowerCase();

        // Switch account logic if needed
        if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== normalizedEmail) {
            await signOut(auth);
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Clear caches if user changed
        try {
            const { clearProfileCaches } = await import('@/lib/client/auth'); // If ported
            clearProfileCaches();
        } catch { }

        storeRecentAccount(normalizedEmail);
        return { success: true, user };
    } catch (error: any) {
        let message = error.message;
        if (error.code === 'auth/invalid-credential') {
            message = 'Invalid email or password. Please try again.';
        } else if (error.code === 'auth/user-not-found') {
            message = 'No account found with this email.';
        }
        return { error: message };
    }
}

export async function signUpClient(
    email: string,
    password: string,
    displayName: string,
    gender: string,
    birthday?: string,
    anniversary?: string
) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update Auth profile
        await updateProfile(user, { displayName });

        // Create Firestore profile
        await setDoc(doc(db, 'users', user.uid), {
            email: email.toLowerCase(),
            display_name: displayName,
            gender,
            birthday: birthday || null,
            anniversary: anniversary || null,
            couple_id: null, // Initially unpaired
            created_at: serverTimestamp(),
            role: 'user'
        });

        return { success: true, user };
    } catch (error: any) {
        console.error('[AuthClient] SignUp Error:', error);
        return { error: error.message };
    }
}

export async function signOutClient() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}
