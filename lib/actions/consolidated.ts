'use server'

import { adminDb } from '@/lib/firebase/admin'
import { getTodayIST } from '@/lib/utils'
import { getDashboardPolaroids } from '@/lib/actions/polaroids'
import { getDoodle } from '@/lib/actions/doodles'
import { cache } from 'react'
import { requireUser } from '@/lib/firebase/auth-server'

/**
 * CONSOLIDATED DATA FETCHERS v3 (Firestore Migrated)
 * High-performance, streaming-compatible server actions.
 */

export const getCoreDashboardData = cache(async () => {
    try {
        const user = await requireUser();
        if (!user) return { success: false, error: 'Not authenticated' }

        // 1. Fetch user profile
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        if (!userDoc.exists) return { success: false, error: 'Profile not found' }
        const profile = { id: user.uid, ...userDoc.data() } as any;

        const coupleId = profile.couple_id;
        let partnerId = null;
        let coupleData = null;

        if (coupleId) {
            const cDoc = await adminDb.collection('couples').doc(coupleId).get();
            if (cDoc.exists) {
                coupleData = { id: cDoc.id, ...cDoc.data() } as any;
                partnerId = (coupleData.user1_id === user.uid) ? coupleData.user2_id : coupleData.user1_id;
            }
        }

        const rolling24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 2. Parallel fetching of dashboard components
        const [
            partnerProfile,
            partnerMoodsSnap,
            userMoodsSnap,
            memoriesSnap,
            lettersSnap,
            userCycleSnap,
            partnerCycleSnap,
            cycleLogsSnap,
            supportLogsSnap,
            polaroids,
            doodle
        ] = await Promise.all([
            partnerId ? adminDb.collection('users').doc(partnerId).get().then(d => d.exists ? { id: d.id, ...d.data() } : null) : Promise.resolve(null),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('moods')
                .where('user_id', '==', partnerId)
                .where('created_at', '>=', rolling24hStart)
                .orderBy('created_at', 'desc').get() : Promise.resolve({ docs: [] }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('moods')
                .where('user_id', '==', user.uid)
                .where('created_at', '>=', rolling24hStart)
                .orderBy('created_at', 'desc').get() : Promise.resolve({ docs: [] }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('memories').get() : Promise.resolve({ size: 0 }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('letters').get() : Promise.resolve({ size: 0 }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('cycle_profiles').doc(user.uid).get() : Promise.resolve({ exists: false, data: () => null }),
            (coupleId && partnerId) ? adminDb.collection('couples').doc(coupleId).collection('cycle_profiles').doc(partnerId).get() : Promise.resolve({ exists: false, data: () => null }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('cycle_logs').limit(30).get() : Promise.resolve({ docs: [] }),
            coupleId ? adminDb.collection('couples').doc(coupleId).collection('support_logs').limit(30).get() : Promise.resolve({ docs: [] }),
            getDashboardPolaroids(coupleId),
            getDoodle(coupleId)
        ]);

        const normalizeSnap = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

        return {
            success: true,
            data: {
                profile: { ...profile, partner_id: partnerId },
                partnerProfile,
                couple: coupleData,
                partnerTodayMoods: normalizeSnap(partnerMoodsSnap),
                userTodayMoods: normalizeSnap(userMoodsSnap),
                memoriesCount: memoriesSnap.size,
                lettersCount: lettersSnap.size,
                userCycle: userCycleSnap.data(),
                partnerCycle: partnerCycleSnap.data(),
                cycleLogs: normalizeSnap(cycleLogsSnap),
                supportLogs: normalizeSnap(supportLogsSnap),
                currentDateIST: getTodayIST(),
                polaroids,
                doodle
            }
        }
    } catch (e: any) {
        console.error('[Orbit-Dashboard] Critical Error:', e);
        return { success: false, error: e.message }
    }
});

export async function getDashboardData() {
    return await getCoreDashboardData()
}

export async function fetchBucketListData(coupleId: string) {
    try {
        const snap = await adminDb.collection('couples').doc(coupleId).collection('bucket_list')
            .orderBy('created_at', 'desc')
            .get();

        return snap.docs.map(doc => {
            const item = doc.data();
            return {
                id: doc.id,
                ...item,
                is_completed: item.is_completed ?? item.is_done ?? false
            };
        });
    } catch (e) {
        console.error('[fetchBucketListData] Error:', e);
        return []
    }
}

export async function fetchOnThisDayData(coupleId: string) {
    // In Firestore, there's no native 'month'/'day' extraction inside query without custom index or computed fields.
    // For now, we fetch all (or recent) and filter in JS if the set is small.
    // Optimization: Store 'month' and 'day' as separate fields on every document.
    try {
        const todayIST = getTodayIST() // YYYY-MM-DD
        const [, m, d] = todayIST.split('-').map(Number)

        const [memsSnap, milesSnap] = await Promise.all([
            adminDb.collection('couples').doc(coupleId).collection('memories').get(),
            adminDb.collection('couples').doc(coupleId).collection('milestones').get()
        ]);

        const filterOnThisDay = (items: any[], dateField: string) => {
            return items.filter(item => {
                const dateStr = item[dateField] || item.created_at;
                if (!dateStr) return false;
                const dt = new Date(dateStr);
                return (dt.getMonth() + 1) === m && dt.getDate() === d;
            });
        };

        const memories = filterOnThisDay(memsSnap.docs.map(d => ({ id: d.id, ...d.data() })), 'memory_date');
        const milestones = filterOnThisDay(milesSnap.docs.map(d => ({ id: d.id, ...d.data() })), 'milestone_date');

        return { memories, milestones }
    } catch (e) {
        console.error('[fetchOnThisDayData] Error:', e);
        return { memories: [], milestones: [] }
    }
}
