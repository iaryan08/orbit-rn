import { adminDb } from '@/lib/firebase/admin'
import { requireUser } from '@/lib/firebase/auth-server'
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(req: Request) {
    try {
        const user = await requireUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { recipientId, sessionId, actionUrl } = await req.json()

        if (!recipientId || !sessionId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Search for the specific 'canvas_update' notification in Firestore
        const notificationsRef = adminDb.collection('notifications');
        const query = notificationsRef
            .where('recipient_id', '==', recipientId)
            .where('actor_id', '==', user.uid)
            .where('type', '==', 'announcement')
            .orderBy('created_at', 'desc')
            .limit(10); // Check recent notifications

        const snap = await query.get();
        let targetDoc = null;

        for (const doc of snap.docs) {
            const data = doc.data();
            if (data.metadata?.type === 'canvas_update' && data.metadata?.sessionId === sessionId) {
                targetDoc = doc;
                break;
            }
        }

        if (!targetDoc) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
        }

        const updatedMetadata = {
            ...(targetDoc.data().metadata || {}),
            reactivatedAt: new Date().toISOString()
        }

        await targetDoc.ref.update({
            is_read: false,
            action_url: actionUrl || '/dashboard',
            metadata: updatedMetadata,
            updated_at: FieldValue.serverTimestamp()
        });

        return NextResponse.json({ success: true, notificationId: targetDoc.id })
    } catch (error) {
        console.error('Reactivate canvas API error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
