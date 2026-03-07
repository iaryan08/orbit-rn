import { auth, db } from '@/lib/firebase/client'
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    updateProfile as firebaseUpdateProfile
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

const RECENT_ACCOUNTS_KEY = 'orbit:recent_accounts:v1'

function storeRecentAccount(email: string) {
    if (typeof window === 'undefined') return
    const normalized = email.trim().toLowerCase()
    if (!normalized) return
    try {
        const raw = localStorage.getItem(RECENT_ACCOUNTS_KEY)
        const current = raw ? (JSON.parse(raw) as string[]) : []
        const unique = [normalized, ...current.filter((e) => e !== normalized)].slice(0, 5)
        localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(unique))
    } catch { }
}

export async function signInClient(email: string, password: string) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password)
        storeRecentAccount(email)
        return { success: true, user: userCredential.user }
    } catch (error: any) {
        let message = error.message
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = 'Invalid email or password. Please try again.'
        }
        return { error: message }
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
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        const user = userCredential.user

        // Update Firebase profile
        await firebaseUpdateProfile(user, { displayName })

        // Create Firestore profile
        await setDoc(doc(db, 'users', user.uid), {
            display_name: displayName,
            gender: gender,
            birthday: birthday || null,
            anniversary_date: anniversary || null,
            email: email.toLowerCase(),
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
        })

        return { success: true, user }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function signOutClient() {
    try {
        await firebaseSignOut(auth)
        if (typeof window !== 'undefined') {
            const { clearProfileCaches } = await import('@/lib/client/auth')
            clearProfileCaches()
        }
    } catch (error: any) {
        console.error('[AuthActions] Sign out failed:', error)
    }
}
