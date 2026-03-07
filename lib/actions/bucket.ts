'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { sendNotification } from '@/lib/actions/notifications'

export async function getBucketList() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { items: [] }

    const { data: items, error } = await supabase
        .from('bucket_list')
        .select('*')
        .eq('couple_id', profile.couple_id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching bucket list:', error)
        return { error: error.message }
    }

    return { items }
}

export async function addBucketItem(title: string, description: string = '') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

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
        })
        .select('id')
        .single()

    if (error) return { error: error.message }

    // Notify Partner
    const { data: couple } = await supabase
        .from('couples')
        .select('user1_id, user2_id')
        .eq('id', profile.couple_id)
        .single()

    if (couple) {
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

    revalidatePath('/dashboard', 'layout')
    return { success: true }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

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

    // Notify Partner if completed
    if (isCompleted && profile?.couple_id) {
        const { data: couple } = await supabase
            .from('couples')
            .select('user1_id, user2_id')
            .eq('id', profile.couple_id)
            .single()

        if (couple) {
            const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id
            // Get item title for notification
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

    revalidatePath('/dashboard', 'layout')
    return { success: true }
}

export async function deleteBucketItem(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Not authenticated' }

    const { error } = await supabase
        .from('bucket_list')
        .delete()
        .eq('id', id)

    if (error) return { error: error.message }

    revalidatePath('/dashboard', 'layout')
    return { success: true }
}
