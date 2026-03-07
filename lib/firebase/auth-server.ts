import { adminAuth } from '@/lib/firebase/admin';
import { NextRequest } from 'next/server';
import { headers } from 'next/headers';

/**
 * Verifies Firebase ID token from Authorization header.
 * Works in both API routes (pass request) and Server Actions (no args).
 * 
 * Usage:
 *   const user = await requireUser(); // In Server Actions
 *   const user = await requireUser(request); // In API Routes
 */
export async function requireUser(request?: NextRequest) {
    try {
        let authHeader: string | null = null;

        if (request) {
            authHeader = request.headers.get('Authorization');
        } else {
            const h = await headers();
            authHeader = h.get('Authorization');
        }

        if (!authHeader?.startsWith('Bearer ')) return null;

        const token = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(token);
        return decoded;
    } catch {
        return null;
    }
}
