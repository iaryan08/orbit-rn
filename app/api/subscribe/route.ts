import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const subscription = await req.json();

        // Use the auth token to get the user ID on the server if possible, 
        // but for now let's assume the user is authenticated and we can use a header or similar.
        // Actually, many of your routes use a custom header or the Firebase admin auth to verify.
        // Let's check how other routes get the user.

        // For simplicity and since this is a PWA push registration, 
        // we'll expect the caller to be authenticated via the Firebase SDK.
        // We can get the bearer token from the Authorization header.

        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        // Store in Firestore. Use a hash of the endpoint as the ID to avoid duplicates.
        const subscriptionId = Buffer.from(subscription.endpoint).toString('base64').replace(/\//g, '_').substring(0, 100);

        await adminDb.collection('push_subscriptions').doc(subscriptionId).set({
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys?.p256dh || '',
            auth: subscription.keys?.auth || '',
            created_at: new Date().toISOString()
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error saving push subscription:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
