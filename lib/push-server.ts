import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import webPush from 'web-push';

const VAPID_SUBJECT = 'mailto:jhariyaaryan08@gmail.com';

if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys are missing. Push notifications will not work.');
}

type SubscriptionRow = {
    endpoint: string;
    p256dh: string;
    auth: string;
    user_id: string;
};

function isValidSub(row: any) {
    return (
        typeof row.endpoint === 'string' &&
        row.endpoint.length > 0 &&
        typeof row.keys?.p256dh === 'string' &&
        typeof row.keys?.auth === 'string'
    );
}

export async function sendPushNotification(userId: string, title: string, message: string, url: string = '/', metadata: any = {}) {
    try {
        if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
            console.error('VAPID keys are missing');
            return { success: false, error: 'Configuration missing' };
        }

        // Fetch subscriptions from Firestore
        const subSnap = await adminDb.collection('push_subscriptions').where('user_id', '==', userId).get();

        if (subSnap.empty) {
            return { success: true, sent: 0, message: 'No subscriptions found for user' };
        }

        const payload = JSON.stringify({
            title,
            body: message,
            url,
            metadata
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
                        subject: VAPID_SUBJECT,
                        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
                        privateKey: process.env.VAPID_PRIVATE_KEY!
                    }
                });
                return { success: true };
            } catch (error: any) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Subscription has expired
                    await doc.ref.delete();
                    return { success: false, reason: 'expired' };
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
