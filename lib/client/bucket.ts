import { createClient } from '@/lib/supabase/client'
import { sendNotification } from '@/lib/client/notifications'
import { enqueueMutation, isLikelyNetworkError, isOffline } from '@/lib/client/offline-mutation-queue'
import { readOfflineCache, writeOfflineCache } from '@/lib/client/offline-cache'
import { Capacitor } from '@capacitor/core'
import { LocalDB } from '@/lib/client/local-db'

export async function getBucketList() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) return { error: 'Not authenticated' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { items: [] }

    const cacheKey = `bucket:${profile.couple_id}`

    // SQLite Fast-Load
    if (Capacitor.isNativePlatform()) {
        try {
            const localItems = await LocalDB.query<any>('bucket_list', profile.couple_id);
            if (localItems && localItems.length > 0) {
                // Return locally immediately, sync in background
                ; (async () => {
                    try {
                        const { data } = await supabase
                            .from('bucket_list')
                            .select('*')
                            .eq('couple_id', profile.couple_id)
                            .order('created_at', { ascending: false })
                        if (data) {
                            writeOfflineCache(cacheKey, data)
                            data.forEach((item: any) => {
                                void LocalDB.upsertFromSync('bucket_list', { ...item, pending_sync: 0 })
                            })
                        }
                    } catch (err) {
                        console.error(err)
                    }
                })()
                return { items: localItems }
            }
        } catch (e) {
            console.warn('[BucketList] SQLite load failed', e)
        }
    }

    try {
        const { data: items, error } = await supabase
            .from('bucket_list')
            .select('*')
            .eq('couple_id', profile.couple_id)
            .order('created_at', { ascending: false })

        if (error) throw error
        writeOfflineCache(cacheKey, items || [])
        // Hydrate SQLite
        if (Capacitor.isNativePlatform() && items) {
            items.forEach((item: any) => {
                void LocalDB.upsertFromSync('bucket_list', { ...item, pending_sync: 0 });
            });
        }
        return { items: items || [] }
    } catch (error: any) {
        const cached = readOfflineCache<any[]>(cacheKey) || []
        if (cached.length > 0) return { items: cached, cached: true }
        console.error('Error fetching bucket list:', error)
        return { error: error?.message || 'Failed to fetch bucket list' }
    }
}

export async function addBucketItem(title: string, description: string = '', isPrivate: boolean = false) {
    if (isOffline()) {
        await enqueueMutation('bucket.add', { title, description, is_private: isPrivate })
        return { success: true, queued: true }
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) return { error: 'Not authenticated' }
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('couple_id, display_name')
            .eq('id', user.id)
            .single()

        if (!profile?.couple_id) return { error: 'No couple found' }

        const { data: item, error } = await supabase
            .from('bucket_list')
            .insert({
                couple_id: profile.couple_id,
                created_by: user.id,
                title,
                description,
                is_private: isPrivate,
            })
            .select('id')
            .single()

        if (error) return { error: error.message }

        const { data: couple } = await supabase
            .from('couples')
            .select('user1_id, user2_id')
            .eq('id', profile.couple_id)
            .single()

        if (couple && !isPrivate) {
            const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.id,
                    type: 'bucket_list',
                    title: 'New Bucket List Item',
                    message: `${profile.display_name || 'Your partner'} added "${title}" to your bucket list.`,
                    actionUrl: item?.id ? `/dashboard?bucketItemId=${encodeURIComponent(item.id)}` : '/dashboard',
                    metadata: item?.id ? { bucket_item_id: item.id } : undefined,
                })
            }
        }

        if (Capacitor.isNativePlatform() && profile?.couple_id) {
            void LocalDB.insert('bucket_list', {
                id: item?.id || crypto.randomUUID(),
                couple_id: profile.couple_id,
                created_by: user.id,
                title,
                description: description || '',
                is_completed: false,
                is_private: isPrivate,
                created_at: new Date().toISOString()
            } as any);
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.add', { title, description, is_private: isPrivate })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to add bucket item' }
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    if (isOffline()) {
        await enqueueMutation('bucket.toggle', { id, isCompleted })
        return { success: true, queued: true }
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) return { error: 'Not authenticated' }
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('couple_id, display_name')
            .eq('id', user.id)
            .single()

        const { error } = await supabase
            .from('bucket_list')
            .update({
                is_completed: isCompleted,
                completed_at: isCompleted ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)

        if (error) return { error: error.message }

        if (isCompleted && profile?.couple_id) {
            const { data: couple } = await supabase
                .from('couples')
                .select('user1_id, user2_id')
                .eq('id', profile.couple_id)
                .single()

            if (couple) {
                const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id
                const { data: item } = await supabase.from('bucket_list').select('title').eq('id', id).single()

                if (partnerId && item) {
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.id,
                        type: 'bucket_list',
                        title: 'Bucket List Item Completed! 🎉',
                        message: `${profile.display_name || 'Your partner'} marked "${item.title}" as completed!`,
                        actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(id)}`,
                        metadata: { bucket_item_id: id },
                    })
                }
            }
        }

        if (Capacitor.isNativePlatform() && profile?.couple_id) {
            void LocalDB.update('bucket_list', id, profile.couple_id, {
                is_completed: isCompleted,
                completed_at: isCompleted ? new Date().toISOString() : null,
            } as any);
        }

        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.toggle', { id, isCompleted })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to toggle bucket item' }
    }
}

export async function deleteBucketItem(id: string) {
    if (isOffline()) {
        await enqueueMutation('bucket.delete', { id })
        return { success: true, queued: true }
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    if (!user) return { error: 'Not authenticated' }
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('couple_id')
            .eq('id', user.id)
            .single()

        const { error } = await supabase
            .from('bucket_list')
            .delete()
            .eq('id', id)

        if (error) return { error: error.message }
        if (Capacitor.isNativePlatform() && profile?.couple_id) {
            void LocalDB.delete('bucket_list', id, profile.couple_id)
        }
        return { success: true }
    } catch (e: any) {
        if (isLikelyNetworkError(e)) {
            await enqueueMutation('bucket.delete', { id })
            return { success: true, queued: true }
        }
        return { error: e?.message || 'Failed to delete bucket item' }
    }
}
