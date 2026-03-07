'use server'

import { createClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/actions/notifications'
import { revalidatePath } from 'next/cache'

export async function createMemory(payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { error: "No couple found" }

    const { data: memory, error } = await supabase
        .from('memories')
        .insert({
            couple_id: profile.couple_id,
            user_id: user.id,
            title: payload.title,
            description: payload.description,
            image_urls: payload.image_urls,
            location: payload.location,
            memory_date: payload.memory_date
        })
        .select()
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
                type: 'memory',
                title: 'New Memory Shared',
                message: `${profile.display_name || 'Your partner'} added a new memory: "${payload.title}"`,
                actionUrl: `/memories?open=${encodeURIComponent(memory.id)}`,
                metadata: { memory_id: memory.id }
            })
        }
    }

    revalidatePath('/memories')
    revalidatePath('/dashboard')
    return { success: true }
}

export async function updateMemory(memoryId: string, payload: {
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: "Unauthorized" }

    const { error } = await supabase
        .from('memories')
        .update({
            title: payload.title,
            description: payload.description,
            image_urls: payload.image_urls,
            location: payload.location,
            memory_date: payload.memory_date
        })
        .eq('id', memoryId)
        .eq('user_id', user.id) // Security check

    if (error) return { error: error.message }

    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', user.id)
        .single();

    if (profile?.couple_id) {
        const { data: couple } = await supabase
            .from('couples')
            .select('user1_id, user2_id')
            .eq('id', profile.couple_id)
            .single();

        if (couple) {
            const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.id,
                    type: 'memory',
                    title: 'Memory Updated',
                    message: `${profile.display_name || 'Your partner'} updated the memory: "${payload.title}"`,
                    actionUrl: `/memories?open=${encodeURIComponent(memoryId)}`,
                    metadata: { memory_id: memoryId }
                });
            }
        }
    }

    revalidatePath('/memories')
    revalidatePath('/dashboard')
    return { success: true }
}
