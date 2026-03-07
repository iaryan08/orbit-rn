import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import webPush from 'web-push';

const VAPID_SUBJECT = 'mailto:jhariyaaryan08@gmail.com';

if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys are missing. Push notifications will not work.');
}

type SubscriptionRow = {
    endpoint: string | null;
    p256dh: string | null;
    auth: string | null;
};

function isValidSub(row: SubscriptionRow) {
    return (
        typeof row.endpoint === 'string' &&
        row.endpoint.length > 0 &&
        typeof row.p256dh === 'string' &&
        row.p256dh.length > 0 &&
        typeof row.auth === 'string' &&
        row.auth.length > 0
    );
}

export async function sendPushNotification(userId: string, title: string, message: string, url: string = '/', metadata: any = {}) {
    try {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.error('VAPID keys are missing');
            return { success: false, error: 'Configuration missing' };
        }

        const supabase = await createAdminClient();

        // Fetch subscriptions for this specific user
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching subscriptions:', error);
            if (error.code === '22P02') return { success: true, sent: 0, message: 'Push skipped: UUID error' };
            return { success: false, error: 'Database error' };
        }

        if (!subscriptions || subscriptions.length === 0) {
            return { success: true, sent: 0, message: 'No subscriptions found for user' };
        }

        const payload = JSON.stringify({
            title,
            body: message,
            url,
            metadata
        });

        const promises = subscriptions.map(async (sub) => {
            try {
                if (!isValidSub(sub)) {
                    if (sub?.endpoint) {
                        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    }
                    return { success: false, reason: 'invalid-subscription' as const };
                }

                await webPush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                }, payload, {
                    vapidDetails: {
                        subject: VAPID_SUBJECT,
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
                if (error?.code === 'ERR_INVALID_ARG_TYPE') {
                    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                    return { success: false, reason: 'invalid-subscription' as const };
                }
                console.error('Error sending push to ' + sub.endpoint, error);
                return { success: false, reason: 'error' };
            }
        });

        const results = await Promise.all(promises);
        const sentCount = results.filter(r => r.success).length;
        const failedCount = results.length - sentCount;

        return { success: failedCount === 0, sent: sentCount, failed: failedCount };
    } catch (error) {
        console.error('Error in sendPushNotification:', error);
        return { success: false, error: 'Internal error' };
    }
}
