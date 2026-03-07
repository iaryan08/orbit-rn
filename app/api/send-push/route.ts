import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import webPush from 'web-push';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.error('VAPID keys are missing');
            // Return 500 but don't crash, let the client know configuration is missing
            return NextResponse.json({ error: 'Server VAPID configuration missing' }, { status: 500 });
        }

        const body = await request.json();
        const { message, title, url } = body;

        const supabase = await createAdminClient();
        const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('*');

        if (error) {
            console.error('Db error:', error);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ message: 'No subscriptions found' });
        }

        const payload = JSON.stringify({
            title: title || 'New Notification',
            body: message || 'You have a new update',
            url
        });

        const promises = subscriptions.map(async (sub) => {
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
                    // Subscription has expired
                    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    return { success: false, reason: 'expired' };
                }
                console.error('Error sending to ' + sub.endpoint, error);
                return { success: false, reason: 'error' };
            }
        });

        const results = await Promise.all(promises);
        const sentCount = results.filter(r => r.success).length;

        return NextResponse.json({ success: true, sent: sentCount, total: subscriptions.length });
    } catch (error) {
        console.error('Error sending push:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
