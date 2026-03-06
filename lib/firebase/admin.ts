import admin from 'firebase-admin';

// Prevent re-initialization in Next.js hot reload / serverless
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
            // Replace escaped newlines in env var
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
        }),
    });
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
export default admin;
