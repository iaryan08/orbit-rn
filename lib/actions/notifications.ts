'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendPushNotification } from '@/lib/push-server'

export type NotificationType =
    | 'mood'
    | 'letter'
    | 'memory'
    | 'period_start'
    | 'ovulation'
    | 'intimacy'
    | 'on_this_day'
    | 'spark'
    | 'heartbeat'
    | 'comment'
    | 'polaroid'
    | 'bucket_list'
    | 'announcement'

interface CreateNotificationParams {
    recipientId: string
    actorId?: string // Optional, null if system
    type: NotificationType
    title: string
    message: string
    actionUrl?: string
    metadata?: any
}

/**
 * Sends a notification to a specific user.
 */
export async function sendNotification({
    recipientId,
    actorId,
    type,
    title,
    message,
    actionUrl,
    metadata
}: CreateNotificationParams) {
    const supabase = await createClient()

    // Safety check: Don't notify yourself (unless it's a system test, but usually logic handles this)
    if (actorId && recipientId === actorId) return { success: false, error: "Cannot notify self" }

    try {
        const { error } = await supabase
            .from('notifications')
            .insert({
                recipient_id: recipientId,
                actor_id: actorId || null, // null means 'System' or 'Lunara'
                type,
                title,
                message,
                action_url: actionUrl,
                metadata: metadata || {}
            })

        if (error) throw error

        // Attempt to send push notification
        try {
            await sendPushNotification(recipientId, title, message, actionUrl || '/', metadata)
        } catch (pushError) {
            console.error('Failed to send push notification:', pushError)
            // Don't fail the main action, just log it
        }

        return { success: true }
    } catch (error: any) {
        console.error("[Notification] Failed to send:", error)
        return { success: false, error: error.message }
    }
}

/**
 * Fetches recent notifications for the current user.
 */
export async function getNotifications(limit: number = 20) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return []

    const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

    return data || []
}

/**
 * Gets the count of unread notifications.
 */
export async function getUnreadCount() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return 0

    const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)

    return count || 0
}

/**
 * Marks a single notification (or all) as read.
 */
export async function markAsRead(notificationId?: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    if (notificationId) {
        // Mark specific
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_id', user.id)
    } else {
        // Mark all
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', user.id)
            .eq('is_read', false)
    }

    revalidatePath('/dashboard')
    return { success: true }
}

/**
 * Deletes a single notification.
 */
export async function deleteNotification(notificationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_id', user.id)

    if (error) {
        console.error("Failed to delete notification:", error)
        return { success: false, error: error.message }
    }

    revalidatePath('/dashboard')
    return { success: true }
}

/**
 * Deletes all notifications for the current user.
 */
export async function deleteAllNotifications() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('recipient_id', user.id)

    if (error) {
        console.error("Failed to clear notifications:", error)
        return { success: false, error: error.message }
    }

    revalidatePath('/dashboard')
    return { success: true }
}

/**
 * Sends a 'Spark' (thinking of you) notification to the partner.
 */
export async function sendSpark() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Unauthorized' }

    // 1. Get partner ID
    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

    const { data: couple } = await supabase
        .from('couples')
        .select('*')
        .eq('id', profile.couple_id)
        .single()

    if (!couple) return { success: false, error: 'Couple not found' }

    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id
    if (!partnerId) return { success: false, error: 'Partner not found' }

    // 2. Send the notification
    const sparkMessages = [
        "is thinking of you... ✨",
        "just sent you a spark! 💖",
        "is missing you right now. 🌙",
        "wants to let you know you're on their mind. 💫",
        "is sending you some love! 🔥"
    ]
    const randomMessage = sparkMessages[Math.floor(Math.random() * sparkMessages.length)]

    return await sendNotification({
        recipientId: partnerId,
        actorId: user.id,
        type: 'spark',
        title: 'Spark Received! ✨',
        message: `${profile.display_name || 'Your partner'} ${randomMessage}`,
        actionUrl: '/dashboard'
    })
}

/**
 * Sends a 'Heartbeat' notification (with specific vibration) to the partner.
 */
export async function sendHeartbeat() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Unauthorized' }

    // 1. Get partner ID
    const { data: profile } = await supabase
        .from('profiles')
        .select('couple_id, display_name')
        .eq('id', user.id)
        .single()

    if (!profile?.couple_id) return { success: false, error: 'No couple connected' }

    const { data: couple } = await supabase
        .from('couples')
        .select('*')
        .eq('id', profile.couple_id)
        .single()

    if (!couple) return { success: false, error: 'Couple not found' }

    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id
    if (!partnerId) return { success: false, error: 'Partner not found' }

    return await sendNotification({
        recipientId: partnerId,
        actorId: user.id,
        type: 'heartbeat',
        title: 'Heartbeat Detected 💓',
        message: `${profile.display_name || 'Your partner'} just sent you their heartbeat.`,
        actionUrl: '/dashboard',
        metadata: { type: 'heartbeat' }
    })
}
