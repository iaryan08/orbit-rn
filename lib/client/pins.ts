import { db, auth } from '@/lib/firebase/client'
import { collection, updateDoc, deleteDoc, doc, getDoc, query, where, getDocs, setDoc, orderBy, onSnapshot } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'

export type PinItemType = 'memory' | 'letter'
export type PinDurationOption = '24h' | '7d' | '30d' | 'forever'

interface ContentPinRow {
    id: string
    couple_id: string
    item_type: PinItemType
    item_id: string
    pinned_by: string
    share_with_partner: boolean
    pinned_at: string
    expires_at?: string | null
}

const MAX_PINS = 3

function getExpiresAtIso(duration: PinDurationOption): string | null {
    if (duration === 'forever') return null
    const now = Date.now()
    const ms =
        duration === '24h' ? 24 * 60 * 60 * 1000 :
            duration === '7d' ? 7 * 24 * 60 * 60 * 1000 :
                30 * 24 * 60 * 60 * 1000
    return new Date(now + ms).toISOString()
}

function isPinVisibleToUser(row: ContentPinRow, userId: string) {
    const allowed = row.share_with_partner || row.pinned_by === userId
    if (!allowed) return false
    if (!row.expires_at) return true
    return new Date(row.expires_at).getTime() > Date.now()
}

async function getNativeDb() {
    if (!Capacitor.isNativePlatform()) return null
    try {
        const { sqliteService } = await import('./sqlite')
        return await sqliteService.getDb()
    } catch (error) {
        console.warn('[pins] native db unavailable:', error)
        return null
    }
}

async function replaceLocalPins(coupleId: string, itemType: PinItemType, rows: ContentPinRow[]) {
    const dbLocal = await getNativeDb()
    if (!dbLocal) return
    const now = new Date().toISOString()

    try {
        await dbLocal.run('DELETE FROM content_pins_local WHERE couple_id = ? AND item_type = ?', [coupleId, itemType])
        for (const row of rows) {
            const id = row.id || `${coupleId}:${itemType}:${row.item_id}`
            await dbLocal.run(
                `INSERT INTO content_pins_local
                  (id, couple_id, item_type, item_id, pinned_by, share_with_partner, pinned_at, expires_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    coupleId,
                    itemType,
                    row.item_id,
                    row.pinned_by,
                    row.share_with_partner ? 1 : 0,
                    row.pinned_at || now,
                    row.expires_at || null,
                    row.pinned_at || now,
                    now,
                ]
            )
        }
    } catch (error) {
        console.warn('[pins] replaceLocalPins failed:', error)
    }
}

export async function fetchPinnedIds(coupleId: string, itemType: PinItemType, providedUserId?: string): Promise<string[]> {
    const userId = providedUserId || auth.currentUser?.uid
    if (!userId) return []

    try {
        const q = query(
            collection(db, 'couples', coupleId, 'pins'),
            where('item_type', '==', itemType),
            orderBy('pinned_at', 'desc')
        );
        const snap = await getDocs(q);
        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ContentPinRow[];

        const visible = rows.filter((row) => isPinVisibleToUser(row, userId))
        await replaceLocalPins(coupleId, itemType, visible)
        return visible
            .slice(0, MAX_PINS)
            .map((row) => row.item_id);
    } catch (error) {
        console.error('[pins] fetchPinnedIds failed:', error)
        return [];
    }
}

export async function pinContentItem(
    coupleId: string,
    itemType: PinItemType,
    itemId: string,
    shareWithPartner = true,
    duration: PinDurationOption = 'forever'
) {
    const userId = auth.currentUser?.uid;
    if (!userId) return { error: 'Unauthorized' }

    const pinnedAt = new Date().toISOString()
    const expiresAt = getExpiresAtIso(duration)

    const payload = {
        item_type: itemType,
        item_id: itemId,
        pinned_by: userId,
        share_with_partner: shareWithPartner,
        pinned_at: pinnedAt,
        expires_at: expiresAt,
    }

    try {
        const pinId = `${itemType}_${itemId}`;
        const pinRef = doc(db, 'couples', coupleId, 'pins', pinId);
        await setDoc(pinRef, payload, { merge: true });

        // Fetch fresh list
        const ids = await fetchPinnedIds(coupleId, itemType);
        return { data: ids }
    } catch (error: any) {
        console.error('[pins] pinContentItem failed:', error)
        return { error: error.message || 'Failed to pin item' }
    }
}

export async function unpinContentItem(coupleId: string, itemType: PinItemType, itemId: string) {
    const userId = auth.currentUser?.uid;
    if (!userId) return { error: 'Unauthorized' }

    try {
        const pinId = `${itemType}_${itemId}`;
        const pinRef = doc(db, 'couples', coupleId, 'pins', pinId);
        await deleteDoc(pinRef);

        const ids = await fetchPinnedIds(coupleId, itemType);
        return { data: ids }
    } catch (error: any) {
        console.error('[pins] unpinContentItem failed:', error)
        return { error: error.message || 'Failed to unpin item' }
    }
}

export function subscribeToPins(
    coupleId: string,
    itemType: PinItemType,
    onPinnedIds: (ids: string[]) => void
) {
    const q = query(
        collection(db, 'couples', coupleId, 'pins'),
        where('item_type', '==', itemType),
        orderBy('pinned_at', 'desc')
    );

    return onSnapshot(q, (snap) => {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ContentPinRow[];
        const visible = rows.filter((row) => isPinVisibleToUser(row, userId))

        const ids = visible
            .slice(0, MAX_PINS)
            .map((row) => row.item_id);

        onPinnedIds(ids);
    });
}
