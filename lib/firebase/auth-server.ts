import { adminAuth } from '@/lib/firebase/admin';
import { NextRequest } from 'next/server';

/**
 * Verifies Firebase ID token from Authorization header.
 * Use this in all API routes that need authentication.
 * 
 * Usage:
 *   const user = await requireUser(request);
 *   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function requireUser(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) return null;

        const token = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(token);
        return decoded;
    } catch {
        return null;
    }
}
