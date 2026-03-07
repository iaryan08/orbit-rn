import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/firebase/auth-server'
import { adminDb } from '@/lib/firebase/admin'

/**
 * GET /api/sync/tab?tab=letters|memories|intimacy[&since=ISO_TIMESTAMP]
 * 
 * Firestore implementation of tab-specific data fetching.
 */
export async function GET(request: NextRequest) {
    const user = await requireUser(request)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tab = request.nextUrl.searchParams.get('tab')
    if (!tab || !['letters', 'memories', 'intimacy'].includes(tab)) {
        return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
    }

    const since = request.nextUrl.searchParams.get('since')
    const isDelta = !!since

    try {
        // Resolve coupleId
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profileData = userDoc.data();
        const coupleId = profileData?.couple_id;

        if (!coupleId) {
            return NextResponse.json({ profile: profileData }, { status: 200 })
        }

        // --- Tab: Letters ---
        if (tab === 'letters') {
            let lettersRef = adminDb.collection('couples').doc(coupleId).collection('letters')
                .orderBy('created_at', 'desc');

            if (isDelta && since) {
                // For Firestore, 'since' might be an ISO string. 
                // We'll compare against 'updated_at' if it exists, else 'created_at'.
                lettersRef = lettersRef.where('updated_at', '>', new Date(since));
            }

            const lettersSnap = await lettersRef.limit(100).get();
            const letters = lettersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get pinned letters
            const pinsSnap = await adminDb.collection('couples').doc(coupleId).collection('pins')
                .where('item_type', '==', 'letter')
                .get();

            const pinnedLetterIds = pinsSnap.docs
                .map(d => d.data())
                .filter(p => !p.expires_at || p.expires_at.toDate() > new Date())
                .map(p => p.item_id);

            return NextResponse.json({
                letters,
                lettersCount: letters.length, // simplistic for now
                pinnedLetterIds,
                isDelta
            }, { headers: { 'Cache-Control': 'private, max-age=30' } });
        }

        // --- Tab: Memories ---
        if (tab === 'memories') {
            let memoriesRef = adminDb.collection('couples').doc(coupleId).collection('memories')
                .orderBy('memory_date', 'desc');

            if (isDelta && since) {
                memoriesRef = memoriesRef.where('created_at', '>', new Date(since));
            }

            const memoriesSnap = await memoriesRef.limit(100).get();
            const memories = memoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Get pinned memories
            const pinsSnap = await adminDb.collection('couples').doc(coupleId).collection('pins')
                .where('item_type', '==', 'memory')
                .get();

            const pinnedMemoryIds = pinsSnap.docs
                .map(d => d.data())
                .filter(p => !p.expires_at || p.expires_at.toDate() > new Date())
                .map(p => p.item_id);

            return NextResponse.json({
                memories,
                memoriesCount: memories.length,
                pinnedMemoryIds,
                isDelta
            }, { headers: { 'Cache-Control': 'private, max-age=30' } });
        }

        // --- Tab: Intimacy ---
        if (tab === 'intimacy') {
            const [milestonesSnap, logsSnap, supportSnap] = await Promise.all([
                adminDb.collection('couples').doc(coupleId).collection('milestones').get(),
                adminDb.collection('couples').doc(coupleId).collection('cycle_logs').orderBy('log_date', 'desc').limit(50).get(),
                adminDb.collection('couples').doc(coupleId).collection('support_logs').orderBy('created_at', 'desc').limit(50).get(),
            ]);

            const milestones: Record<string, any> = {};
            milestonesSnap.docs.forEach(d => {
                const data = d.data();
                if (data.category) milestones[data.category] = { id: d.id, ...data };
            });

            return NextResponse.json({
                milestones,
                cycleLogs: logsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                supportLogs: supportSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            }, { headers: { 'Cache-Control': 'private, max-age=30' } });
        }

    } catch (err: any) {
        console.error('[SyncAPI] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
