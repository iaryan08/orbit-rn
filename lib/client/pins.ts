import { createClient } from '@/lib/supabase/client'
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

type ContentPinQueryRow = ContentPinRow & {
    item_id: string
    share_with_partner: boolean | number
}

const MAX_PINS = 3
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 5
}

function getSupabase() {
    return createClient()
}

async function getCurrentUserId() {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
}

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

function coerceShareWithPartner(value: boolean | number | null | undefined) {
    return value === true || value === 1
}

async function readPinnedIdsFromLocal(coupleId: string, itemType: PinItemType, userId: string): Promise<string[]> {
    const db = await getNativeDb()
    if (!db) return []

    try {
        const result = await db.query(
            `SELECT id, couple_id, item_type, item_id, pinned_by, share_with_partner, pinned_at, expires_at
             FROM content_pins_local
             WHERE couple_id = ? AND item_type = ?
             ORDER BY pinned_at DESC`,
            [coupleId, itemType]
        )
        const rows = (result.values || []) as ContentPinQueryRow[]
        const normalized: ContentPinRow[] = rows.map((row) => ({
            ...row,
            share_with_partner: coerceShareWithPartner(row.share_with_partner),
        }))
        return normalized
            .filter((row) => isPinVisibleToUser(row, userId))
            .slice(0, MAX_PINS)
            .map((row) => row.item_id)
            .filter((id) => typeof id === 'string')
    } catch (error) {
        console.warn('[pins] readPinnedIdsFromLocal failed:', error)
        return []
    }
}

async function replaceLocalPins(coupleId: string, itemType: PinItemType, rows: ContentPinRow[]) {
    const db = await getNativeDb()
    if (!db) return
    const now = new Date().toISOString()

    try {
        await db.run('DELETE FROM content_pins_local WHERE couple_id = ? AND item_type = ?', [coupleId, itemType])
        for (const row of rows) {
            const id = row.id || `${coupleId}:${itemType}:${row.item_id}`
            await db.run(
                `INSERT INTO content_pins_local
                  (id, couple_id, item_type, item_id, pinned_by, share_with_partner, pinned_at, expires_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(couple_id, item_type, item_id) DO UPDATE SET
                  id = excluded.id,
                  pinned_by = excluded.pinned_by,
                  share_with_partner = excluded.share_with_partner,
                  pinned_at = excluded.pinned_at,
                  expires_at = excluded.expires_at,
                  updated_at = excluded.updated_at`,
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

async function upsertLocalPin(
    coupleId: string,
    itemType: PinItemType,
    itemId: string,
    userId: string,
    shareWithPartner: boolean,
    pinnedAt: string,
    expiresAt: string | null
) {
    const db = await getNativeDb()
    if (!db) return
    const now = new Date().toISOString()
    const id = `${coupleId}:${itemType}:${itemId}`
    try {
        await db.run(
            `INSERT INTO content_pins_local
              (id, couple_id, item_type, item_id, pinned_by, share_with_partner, pinned_at, expires_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(couple_id, item_type, item_id) DO UPDATE SET
              id = excluded.id,
              pinned_by = excluded.pinned_by,
              share_with_partner = excluded.share_with_partner,
              pinned_at = excluded.pinned_at,
              expires_at = excluded.expires_at,
              updated_at = excluded.updated_at`,
            [id, coupleId, itemType, itemId, userId, shareWithPartner ? 1 : 0, pinnedAt, expiresAt, pinnedAt || now, now]
        )
    } catch (error) {
        console.warn('[pins] upsertLocalPin failed:', error)
    }
}

async function deleteLocalPin(coupleId: string, itemType: PinItemType, itemId: string) {
    const db = await getNativeDb()
    if (!db) return
    try {
        await db.run('DELETE FROM content_pins_local WHERE couple_id = ? AND item_type = ? AND item_id = ?', [coupleId, itemType, itemId])
    } catch (error) {
        console.warn('[pins] deleteLocalPin failed:', error)
    }
}

export async function fetchPinnedIds(coupleId: string, itemType: PinItemType, providedUserId?: string): Promise<string[]> {
    if (!isValidUuid(coupleId)) return []
    const supabase = getSupabase()
    const userId = providedUserId || await getCurrentUserId()
    if (!userId) return []

    const { data, error } = await supabase
        .from('content_pins')
        .select('id, item_id, pinned_by, share_with_partner, pinned_at, expires_at')
        .eq('couple_id', coupleId)
        .eq('item_type', itemType)
        .order('pinned_at', { ascending: false })

    if (error) {
        console.error('[pins] fetchPinnedIds failed:', error)
        return readPinnedIdsFromLocal(coupleId, itemType, userId)
    }

    const visible = ((data || []) as ContentPinRow[]).filter((row) => isPinVisibleToUser(row, userId))
    await replaceLocalPins(coupleId, itemType, visible)
    return visible
        .slice(0, MAX_PINS)
        .map((row) => row.item_id)
        .filter((id): id is string => isValidUuid(id))
}

export async function fetchAllPinnedIds(coupleId: string, userId: string): Promise<{ memory: string[], letter: string[] }> {
    if (!isValidUuid(coupleId)) return { memory: [], letter: [] }
    const supabase = getSupabase()

    const { data, error } = await supabase
        .from('content_pins')
        .select('id, item_id, item_type, pinned_by, share_with_partner, pinned_at, expires_at')
        .eq('couple_id', coupleId)
        .order('pinned_at', { ascending: false })

    if (error) {
        console.error('[pins] fetchAllPinnedIds failed:', error)
        // Fallback to separate local reads
        const [mIds, lIds] = await Promise.all([
            readPinnedIdsFromLocal(coupleId, 'memory', userId),
            readPinnedIdsFromLocal(coupleId, 'letter', userId)
        ])
        return { memory: mIds, letter: lIds }
    }

    const rows = (data || []) as (ContentPinRow & { item_type: PinItemType })[]

    const memoryRows = rows.filter(r => r.item_type === 'memory' && isPinVisibleToUser(r, userId))
    const letterRows = rows.filter(r => r.item_type === 'letter' && isPinVisibleToUser(r, userId))

    // Update local cache for both
    await Promise.all([
        replaceLocalPins(coupleId, 'memory', memoryRows),
        replaceLocalPins(coupleId, 'letter', letterRows)
    ])

    return {
        memory: memoryRows.slice(0, MAX_PINS).map(r => r.item_id).filter((id): id is string => isValidUuid(id)),
        letter: letterRows.slice(0, MAX_PINS).map(r => r.item_id).filter((id): id is string => isValidUuid(id))
    }
}

async function trimOverflowPins(coupleId: string, itemType: PinItemType) {
    if (!isValidUuid(coupleId)) return
    const supabase = getSupabase()
    const userId = await getCurrentUserId()
    if (!userId) return

    const { data: rows, error } = await supabase
        .from('content_pins')
        .select('id, pinned_by, share_with_partner, pinned_at, expires_at')
        .eq('couple_id', coupleId)
        .eq('item_type', itemType)
        .order('pinned_at', { ascending: false })

    if (error || !rows || rows.length <= MAX_PINS) return

    const visible = (rows as ContentPinRow[]).filter((row) => isPinVisibleToUser(row, userId))
    const overflowIds = visible.slice(MAX_PINS).map((row) => row.id).filter(Boolean)
    if (!overflowIds.length) return

    const { error: deleteError } = await supabase
        .from('content_pins')
        .delete()
        .in('id', overflowIds)

    if (deleteError) {
        console.error('[pins] trimOverflowPins failed:', deleteError)
    }
}

export async function pinContentItem(
    coupleId: string,
    itemType: PinItemType,
    itemId: string,
    shareWithPartner = true,
    duration: PinDurationOption = 'forever'
) {
    if (!isValidUuid(coupleId)) return { error: 'Invalid couple id' }
    if (!isValidUuid(itemId)) return { error: 'Content is still syncing. Try again in a moment.' }
    const supabase = getSupabase()
    const userId = await getCurrentUserId()
    if (!userId) return { error: 'Unauthorized' }
    const pinnedAt = new Date().toISOString()
    const expiresAt = getExpiresAtIso(duration)

    const payload = {
        couple_id: coupleId,
        item_type: itemType,
        item_id: itemId,
        pinned_by: userId,
        share_with_partner: shareWithPartner,
        pinned_at: pinnedAt,
        expires_at: expiresAt,
    }

    const queuePayload = {
        coupleId,
        itemType,
        itemId,
        shareWithPartner,
        pinnedAt,
        expiresAt,
    }

    if (isOffline()) {
        await enqueueMutation('pin.create', queuePayload)
        await upsertLocalPin(coupleId, itemType, itemId, userId, shareWithPartner, pinnedAt, expiresAt)
        const ids = await readPinnedIdsFromLocal(coupleId, itemType, userId)
        return { data: ids, queued: true }
    }

    const { error } = await supabase
        .from('content_pins')
        .upsert(payload, { onConflict: 'couple_id,item_type,item_id' })

    if (error) {
        console.error('[pins] pinContentItem failed:', error)
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('pin.create', queuePayload)
            await upsertLocalPin(coupleId, itemType, itemId, userId, shareWithPartner, pinnedAt, expiresAt)
            const ids = await readPinnedIdsFromLocal(coupleId, itemType, userId)
            return { data: ids, queued: true }
        }
        return { error: error.message || 'Failed to pin item' }
    }

    await upsertLocalPin(coupleId, itemType, itemId, userId, shareWithPartner, pinnedAt, expiresAt)
    await trimOverflowPins(coupleId, itemType)
    const ids = await fetchPinnedIds(coupleId, itemType)
    return { data: ids }
}

export async function unpinContentItem(coupleId: string, itemType: PinItemType, itemId: string) {
    if (!isValidUuid(coupleId)) return { error: 'Invalid couple id' }
    if (!isValidUuid(itemId)) return { error: 'Invalid content id' }
    const supabase = getSupabase()
    const userId = await getCurrentUserId()
    if (!userId) return { error: 'Unauthorized' }

    const queuePayload = { coupleId, itemType, itemId }

    if (isOffline()) {
        await enqueueMutation('pin.delete', queuePayload)
        await deleteLocalPin(coupleId, itemType, itemId)
        const ids = await readPinnedIdsFromLocal(coupleId, itemType, userId)
        return { data: ids, queued: true }
    }

    const { error } = await supabase
        .from('content_pins')
        .delete()
        .eq('couple_id', coupleId)
        .eq('item_type', itemType)
        .eq('item_id', itemId)

    if (error) {
        console.error('[pins] unpinContentItem failed:', error)
        if (isLikelyNetworkError(error)) {
            await enqueueMutation('pin.delete', queuePayload)
            await deleteLocalPin(coupleId, itemType, itemId)
            const ids = await readPinnedIdsFromLocal(coupleId, itemType, userId)
            return { data: ids, queued: true }
        }
        return { error: error.message || 'Failed to unpin item' }
    }

    await deleteLocalPin(coupleId, itemType, itemId)
    const ids = await fetchPinnedIds(coupleId, itemType)
    return { data: ids }
}

export function subscribeToPins(
    coupleId: string,
    itemType: PinItemType,
    onPinnedIds: (ids: string[]) => void
) {
    if (!isValidUuid(coupleId)) {
        return () => { }
    }
    const supabase = getSupabase()

    const channel = supabase
        .channel(`content-pins:${coupleId}:${itemType}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'content_pins',
                filter: `couple_id=eq.${coupleId}`,
            },
            async () => {
                const ids = await fetchPinnedIds(coupleId, itemType)
                onPinnedIds(ids)
            }
        )
        .subscribe()

    return () => {
        supabase.removeChannel(channel)
    }
}
