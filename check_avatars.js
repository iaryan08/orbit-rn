
require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
}

const db = admin.firestore();
async function run() {
    const snap = await db.collection('users').get();
    snap.docs.forEach(doc => {
        const data = doc.data();
        console.log('User:', doc.id);
        console.log('  avatar_url:', data.avatar_url);
        console.log('  custom_wallpaper_url:', data.custom_wallpaper_url);
        console.log('---');
    });
}
run().catch(console.error);

