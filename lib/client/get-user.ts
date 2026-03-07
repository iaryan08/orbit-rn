import { auth } from '@/lib/firebase/client';

export async function getClientUser() {
    return auth.currentUser;
}

export function getCachedAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('orbit_active_session');
}
