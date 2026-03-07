import { adminDb } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';
import webPush from 'web-push';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.error('VAPID keys are missing');
            return NextResponse.json({ error: 'Server VAPID configuration missing' }, { status: 500 });
        }

        const body = await request.json();
        const { message, title, url } = body;

        const subSnap = await adminDb.collection('push_subscriptions').get();

        if (subSnap.empty) {
            return NextResponse.json({ message: 'No subscriptions found' });
        }

        const payload = JSON.stringify({
            title: title || 'New Notification',
            body: message || 'You have a new update',
            url
        });

        const promises = subSnap.docs.map(async (doc) => {
            const sub = doc.data();
            try {
                await webPush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                }, payload, {
                    vapidDetails: {
                        subject: 'mailto:jhariyaaryan08@gmail.com',
                        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
                        privateKey: process.env.VAPID_PRIVATE_KEY!
                    }
                });
                return { success: true };
            } catch (error: any) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await doc.ref.delete();
                    return { success: false, reason: 'expired' };
                }
                console.error('Error sending to ' + sub.endpoint, error);
                return { success: false, reason: 'error' };
            }
        });

        const results = await Promise.all(promises);
        const sentCount = results.filter(r => r.success).length;

        return NextResponse.json({ success: true, sent: sentCount, total: subSnap.size });
    } catch (error) {
        console.error('Error sending push:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
