import { sendPushNotification } from '@/lib/push-server';
import { adminDb } from '@/lib/firebase/admin';
import { isNativePushConfigured, sendFcmToToken } from '@/lib/fcm-server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { recipientId, title, message, url, metadata } = await req.json();

        if (!recipientId || !title || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1) Web Push (for PWA/browser clients)
        const pushResult = await sendPushNotification(recipientId, title, message, url, metadata);

        // 2) Native FCM (for Android/iOS app clients)
        let nativeSent = 0;
        let nativeError: string | null = null;

        if (isNativePushConfigured()) {
            const userDoc = await adminDb.collection('users').doc(recipientId).get();
            const profile = userDoc.data();

            if (!userDoc.exists) {
                nativeError = `User doc not found for id: ${recipientId}`;
            } else if (profile?.fcm_token) {
                const result = await sendFcmToToken({
                    token: profile.fcm_token,
                    title,
                    message,
                    url,
                    metadata: metadata || {},
                });

                if (result.success) {
                    nativeSent = 1;
                } else {
                    nativeError = result.error;

                    // Remove invalid/expired tokens
                    if (result.status === 404 || result.status === 400) {
                        await adminDb.collection('users').doc(recipientId).update({ fcm_token: null });
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            webSent: pushResult.sent ?? 0,
            nativeSent,
            nativeError
        });
    } catch (error) {
        console.error('Trigger Push API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
