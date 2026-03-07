import { createAdminClient, createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { recipientId, sessionId, actionUrl } = await req.json()

        if (!recipientId || !sessionId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const admin = await createAdminClient()

        const { data: notification, error: findError } = await admin
            .from('notifications')
            .select('id, metadata')
            .eq('recipient_id', recipientId)
            .eq('actor_id', user.id)
            .eq('type', 'announcement')
            .contains('metadata', {
                type: 'canvas_update',
                sessionId
            })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (findError) {
            // Log it but don't crash. Some specific metadata queries can be finicky.
            console.warn('[Reactivate] Search returned error:', findError)
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
        }

        if (!notification || !notification.id) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
        }

        const updatedMetadata = {
            ...(notification.metadata || {}),
            reactivatedAt: new Date().toISOString()
        }

        const { error: updateError } = await admin
            .from('notifications')
            .update({
                is_read: false,
                action_url: actionUrl || '/dashboard',
                metadata: updatedMetadata
            })
            .eq('id', notification.id)

        if (updateError) {
            console.error('Reactivate notification update error:', updateError)
            return NextResponse.json({ error: 'Failed to reactivate notification' }, { status: 500 })
        }

        return NextResponse.json({ success: true, notificationId: notification.id })
    } catch (error) {
        console.error('Reactivate canvas API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
