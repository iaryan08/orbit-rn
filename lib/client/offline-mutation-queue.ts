import { createClient } from '@/lib/supabase/client'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'

const QUEUE_KEY = 'mutations:queue:v1'
const MAX_QUEUE_ITEMS = 500

export type OfflineMutationKind =
    | 'memory.create'
    | 'memory.update'
    | 'pin.create'
    | 'pin.delete'
    | 'letter.send'
    | 'letter.update'
    | 'letter.open'
    | 'letter.close'
    | 'bucket.add'
    | 'bucket.toggle'
    | 'bucket.delete'
    | 'intimacy.log'
    | 'notification.send'
    | 'notification.markRead'
    | 'notification.delete'
    | 'notification.deleteAll'

export interface OfflineMutation {
    id: string
    kind: OfflineMutationKind
    payload: any
    createdAt: string
    attempts: number
    lastError?: string
}

function uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function readQueue(): OfflineMutation[] {
    const q = readOfflineCache<OfflineMutation[]>(QUEUE_KEY)
    return Array.isArray(q) ? q : []
}

function writeQueue(items: OfflineMutation[]) {
    writeOfflineCache(QUEUE_KEY, items.slice(-MAX_QUEUE_ITEMS))
}

export function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function isLikelyNetworkError(error: any) {
    const message = String(error?.message || error || '').toLowerCase()
    return (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network request failed') ||
        message.includes('load failed') ||
        message.includes('timeout') ||
        message.includes('fetch')
    )
}

export async function enqueueMutation(kind: OfflineMutationKind, payload: any) {
    const queue = readQueue()
    queue.push({
        id: uid(),
        kind,
        payload,
        createdAt: new Date().toISOString(),
        attempts: 0,
    })
    writeQueue(queue)
    return { queued: true }
}

export function getPendingMutationCount() {
    return readQueue().length
}

async function getProfileAndCoupleInfo(supabase: ReturnType<typeof createClient>, userId: string) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', userId)
        .single()

    if (!profile?.couple_id) return { profile, couple: null, partnerId: null as string | null }

    const { data: couple } = await supabase
        .from('couples')
        .select('user1_id, user2_id')
        .eq('id', profile.couple_id)
        .single()

    const partnerId = couple ? (couple.user1_id === userId ? couple.user2_id : couple.user1_id) : null
    return { profile, couple, partnerId }
}

async function applyMutation(m: OfflineMutation, userId: string) {
    const supabase = createClient()

    switch (m.kind) {
        case 'memory.create': {
            const { profile } = await getProfileAndCoupleInfo(supabase, userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            const { error } = await supabase.from('memories').insert({
                couple_id: profile.couple_id,
                user_id: userId,
                title: payload.title,
                description: payload.description,
                image_urls: payload.image_urls || [],
                location: payload.location ?? null,
                memory_date: payload.memory_date,
            })
            if (error) throw error
            return
        }
        case 'memory.update': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('memories')
                .update({
                    title: payload.title,
                    description: payload.description,
                    image_urls: payload.image_urls || [],
                    location: payload.location ?? null,
                    memory_date: payload.memory_date,
                })
                .eq('id', payload.memoryId)
                .eq('user_id', userId)
            if (error) throw error
            return
        }
        case 'pin.create': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('content_pins')
                .upsert(
                    {
                        couple_id: payload.coupleId,
                        item_type: payload.itemType,
                        item_id: payload.itemId,
                        pinned_by: userId,
                        share_with_partner: payload.shareWithPartner !== false,
                        pinned_at: payload.pinnedAt || new Date().toISOString(),
                        expires_at: payload.expiresAt ?? null,
                    },
                    { onConflict: 'couple_id,item_type,item_id' }
                )
            if (error) throw error
            return
        }
        case 'pin.delete': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('content_pins')
                .delete()
                .eq('couple_id', payload.coupleId)
                .eq('item_type', payload.itemType)
                .eq('item_id', payload.itemId)
            if (error) throw error
            return
        }
        case 'letter.send': {
            const { profile, partnerId } = await getProfileAndCoupleInfo(supabase, userId)
            if (!profile?.couple_id || !partnerId) throw new Error('No couple found')
            const payload = m.payload || {}
            let unlockType = 'immediate'
            if (payload.isOneTime) unlockType = 'one_time'
            else if (payload.unlock_date) unlockType = 'custom'
            const { error } = await supabase.from('love_letters').insert({
                couple_id: profile.couple_id,
                sender_id: userId,
                receiver_id: partnerId,
                title: payload.title,
                content: payload.content,
                unlock_date: payload.unlock_date || null,
                unlock_type: unlockType,
            })
            if (error) throw error
            return
        }
        case 'letter.update': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('love_letters')
                .update({
                    title: payload.title,
                    content: payload.content,
                    unlock_date: payload.unlock_date || null,
                    unlock_type: payload.unlock_date ? 'custom' : 'immediate',
                })
                .eq('id', payload.letterId)
                .eq('sender_id', userId)
            if (error) throw error
            return
        }
        case 'letter.open': {
            const payload = m.payload || {}
            const now = new Date().toISOString()
            const { data: letter, error } = await supabase
                .from('love_letters')
                .select('id, unlock_type, receiver_id')
                .eq('id', payload.letterId)
                .eq('receiver_id', userId)
                .single()
            if (error) throw error
            if (letter?.unlock_type === 'one_time') {
                const { error: deleteError } = await supabase
                    .from('love_letters')
                    .delete()
                    .eq('id', payload.letterId)
                    .eq('receiver_id', userId)
                if (deleteError) throw deleteError
                return
            }
            const { error: updateError } = await supabase
                .from('love_letters')
                .update({ is_read: true, read_at: now })
                .eq('id', payload.letterId)
                .eq('receiver_id', userId)
            if (updateError) throw updateError
            return
        }
        case 'letter.close': {
            const payload = m.payload || {}
            const { data: letter, error: fetchError } = await supabase
                .from('love_letters')
                .select('id, unlock_type, receiver_id')
                .eq('id', payload.letterId)
                .single()
            if (fetchError) throw fetchError
            if (letter?.unlock_type === 'one_time' && letter.receiver_id === userId) {
                const { error: deleteError } = await supabase
                    .from('love_letters')
                    .delete()
                    .eq('id', payload.letterId)
                    .eq('receiver_id', userId)
                if (deleteError) throw deleteError
            }
            return
        }
        case 'bucket.add': {
            const { profile } = await getProfileAndCoupleInfo(supabase, userId)
            if (!profile?.couple_id) throw new Error('No couple found')
            const payload = m.payload || {}
            const { error } = await supabase.from('bucket_list').insert({
                couple_id: profile.couple_id,
                created_by: userId,
                title: payload.title,
                description: payload.description || '',
            })
            if (error) throw error
            return
        }
        case 'bucket.toggle': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('bucket_list')
                .update({
                    is_completed: !!payload.isCompleted,
                    completed_at: payload.isCompleted ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', payload.id)
            if (error) throw error
            return
        }
        case 'bucket.delete': {
            const payload = m.payload || {}
            const { error } = await supabase.from('bucket_list').delete().eq('id', payload.id)
            if (error) throw error
            return
        }
        case 'intimacy.log': {
            const payload = m.payload || {}
            const { profile, couple } = await getProfileAndCoupleInfo(supabase, userId)
            if (!profile?.couple_id || !couple) throw new Error('No couple found')
            const isUser1 = couple.user1_id === userId
            const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category)
            const contentField = isUser1 ? 'content_user1' : 'content_user2'
            const dateField = isUser1 ? 'date_user1' : 'date_user2'

            const updateData: any = {
                couple_id: profile.couple_id,
                category: payload.category,
                [contentField]: payload.content,
                updated_at: new Date().toISOString(),
            }
            if (payload.date) {
                if (showDualDates) {
                    updateData[dateField] = payload.date
                    updateData.milestone_date = payload.date
                } else {
                    updateData.milestone_date = payload.date
                }
            }
            if (payload.time) {
                updateData.milestone_time = payload.time
            }
            let { error } = await supabase.from('milestones').upsert(updateData, { onConflict: 'couple_id, category' })
            if (error) {
                const msg = String(error.message || '').toLowerCase()
                const timeColumnMissing = msg.includes('milestone_time') && (msg.includes('column') || msg.includes('schema'))
                if (timeColumnMissing) {
                    const fallbackData = { ...updateData }
                    delete fallbackData.milestone_time
                    const retry = await supabase.from('milestones').upsert(fallbackData, { onConflict: 'couple_id, category' })
                    error = retry.error
                }
            }
            if (error) throw error
            return
        }
        case 'notification.send': {
            const payload = m.payload || {}
            const { error } = await supabase.from('notifications').insert({
                recipient_id: payload.recipientId,
                actor_id: payload.actorId || null,
                type: payload.type,
                title: payload.title,
                message: payload.message,
                action_url: payload.actionUrl,
                metadata: payload.metadata || {},
            })
            if (error) throw error
            return
        }
        case 'notification.markRead': {
            const payload = m.payload || {}
            if (payload.notificationId) {
                const { error } = await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', payload.notificationId)
                    .eq('recipient_id', userId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('recipient_id', userId)
                    .eq('is_read', false)
                if (error) throw error
            }
            return
        }
        case 'notification.delete': {
            const payload = m.payload || {}
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', payload.notificationId)
                .eq('recipient_id', userId)
            if (error) throw error
            return
        }
        case 'notification.deleteAll': {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('recipient_id', userId)
            if (error) throw error
            return
        }
    }
}

export async function flushMutationQueue() {
    if (isOffline()) return { processed: 0, failed: 0, skipped: true }
    const queue = readQueue()
    if (queue.length === 0) return { processed: 0, failed: 0, skipped: false }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return { processed: 0, failed: queue.length, skipped: true }

    const remaining: OfflineMutation[] = []
    let processed = 0
    let failed = 0

    for (const item of queue) {
        try {
            await applyMutation(item, userId)
            processed += 1
        } catch (error: any) {
            failed += 1
            remaining.push({
                ...item,
                attempts: item.attempts + 1,
                lastError: String(error?.message || error || 'Unknown error'),
            })
        }
    }

    writeQueue(remaining)
    return { processed, failed, skipped: false }
}
