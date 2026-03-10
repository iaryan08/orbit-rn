import { auth, db, storage } from './firebase';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject, uploadBytes } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as ImageCompressor } from 'react-native-compressor';
import { updateDoc as firestoreUpdateDoc } from 'firebase/firestore';
// useOrbitStore is imported dynamically inside functions to avoid circular dependency with store.ts

import { getTodayIST } from './utils';
import { sendNotification } from './notifications';

export async function submitMood(mood: string, note?: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    try {
        const moodData = {
            user_id: user.uid,
            couple_id: coupleId,
            emoji: mood,
            mood_text: note || null,
            mood_date: today,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        const moodId = `${user.uid}_${today}`;
        await setDoc(doc(db, 'couples', coupleId, 'moods', moodId), moodData, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'mood',
                title: 'New Mood Log',
                message: `${state.profile?.display_name || 'Your partner'} is feeling ${mood} ${note ? 'with a note' : ''}`,
                actionUrl: '/dashboard'
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function clearMood() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();

    try {
        // Find today's moods for this user and delete them
        const moodsRef = collection(db, 'couples', coupleId, 'moods');
        const q = query(moodsRef, where('user_id', '==', user.uid), where('mood_date', '==', today));
        const snap = await getDocs(q);

        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logSymptoms(symptoms: string[], options?: { notifyPartner?: boolean; customPrefix?: string; note?: string }) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const logId = `${user.uid}_${today}`;
        const logRef = doc(db, 'couples', coupleId, 'cycle_logs', logId);

        await setDoc(logRef, {
            user_id: user.uid,
            log_date: today,
            symptoms,
            note: options?.note || '',
            updated_at: now
        }, { merge: true });

        if (options?.notifyPartner !== false && state.partnerProfile?.id) {
            const prefix = (options?.customPrefix || 'is having').trim();
            let message = symptoms.length > 0
                ? `${state.profile?.display_name || 'Partner'} ${prefix} - ${symptoms.join(', ')}.`
                : `${state.profile?.display_name || 'Partner'} shared a feeling update: no symptoms right now.`;

            if (options?.note) {
                message += ` Note: "${options.note}"`;
            }

            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'announcement',
                title: 'Feeling Update',
                message,
                actionUrl: '/dashboard',
                metadata: { source: 'cycle_symptoms_update', symptoms }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logSexDrive(level: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    const today = getTodayIST();
    const now = new Date().toISOString();

    try {
        const logId = `${user.uid}_${today}`;
        const logRef = doc(db, 'couples', coupleId, 'cycle_logs', logId);

        await setDoc(logRef, {
            user_id: user.uid,
            log_date: today,
            sex_drive: level,
            updated_at: now
        }, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'intimacy',
                title: 'Libido Status Updated',
                message: `${state.profile?.display_name || 'Your partner'} updated libido to ${level.replace('_', ' ')}.`,
                actionUrl: '/dashboard',
                metadata: { source: 'libido_update', currentLevel: level }
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function logIntimacyMilestone(payload: {
    category: string;
    content: string;
    date?: string;
    time?: string;
}) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const state = (await import('./store')).useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple ID' };

    try {
        const isUser1 = state.couple?.user1_id === user.uid;
        const showDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category);
        const contentField = isUser1 ? "content_user1" : "content_user2";
        const dateField = isUser1 ? "date_user1" : "date_user2";
        const timeField = isUser1 ? "time_user1" : "time_user2";

        const updateData: any = {
            couple_id: coupleId,
            category: payload.category,
            [contentField]: payload.content,
            updated_at: new Date().toISOString()
        };

        if (payload.date) {
            updateData.milestone_date = payload.date;
            if (showDualDates) updateData[dateField] = payload.date;
        }
        if (payload.time) {
            updateData.milestone_time = payload.time;
            if (showDualDates) updateData[timeField] = payload.time;
        }

        const milestoneRef = doc(db, 'couples', coupleId, 'milestones', payload.category);
        await setDoc(milestoneRef, updateData, { merge: true });

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'intimacy',
                title: 'Intimacy Memory Added',
                message: `${state.profile?.display_name || 'Your partner'} added a memory for an intimacy milestone.`,
                actionUrl: '/intimacy'
            });
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function addBucketItem(title: string, description: string = '', is_private: boolean = false) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };
    const normalizedTitle = (title || '').trim();
    if (!normalizedTitle) return { error: 'Title is required' };

    try {
        const itemData = {
            couple_id: coupleId,
            created_by: user.uid,
            title: normalizedTitle,
            description,
            is_completed: false,
            is_private: is_private,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'couples', coupleId, 'bucket_list'), itemData);

        if (state.partnerProfile?.id && !is_private) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'bucket_list',
                title: 'New Bucket List Item 📝',
                message: `${state.profile?.display_name || 'Your partner'} added "${normalizedTitle}" to your bucket list.`,
                actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(docRef.id)}`,
                metadata: { bucket_item_id: docRef.id },
            });
        }

        return { success: true, id: docRef.id };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function toggleBucketItem(id: string, isCompleted: boolean) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        const itemRef = doc(db, 'couples', coupleId, 'bucket_list', id);

        await setDoc(itemRef, {
            is_completed: isCompleted,
            completed_at: isCompleted ? serverTimestamp() : null,
            updated_at: serverTimestamp()
        }, { merge: true });

        if (isCompleted && state.partnerProfile?.id) {
            const item = state.bucketList.find(i => i.id === id);
            if (item) {
                await sendNotification({
                    recipientId: state.partnerProfile.id,
                    actorId: user.uid,
                    type: 'bucket_list',
                    title: 'Bucket List Item Completed! 🎉',
                    message: `${state.profile?.display_name || 'Your partner'} marked "${item.title}" as completed!`,
                    actionUrl: `/dashboard?bucketItemId=${encodeURIComponent(id)}`,
                    metadata: { bucket_item_id: id },
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function deleteBucketItem(id: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        await deleteDoc(doc(db, 'couples', coupleId, 'bucket_list', id));
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function updateLetterReadStatus(id: string, isRead: boolean) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        const itemRef = doc(db, 'couples', coupleId, 'letters', id);
        await setDoc(itemRef, {
            is_read: isRead,
            updated_at: serverTimestamp()
        }, { merge: true });
        return { success: true };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function deleteMemory(memory: any) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Delete from Firestore
        await deleteDoc(doc(db, 'couples', coupleId, 'memories', memory.id));

        // 2. Best-in-Class: Total Storage Cleanup
        const urls = memory.image_urls || (memory.image_url ? [memory.image_url] : []);
        for (const url of urls) {
            if (!url || url.startsWith('http')) continue;

            const cleanPath = url.replace(/^\/+/, '').replace(/^memories\//i, '');
            const fullPath = `memories/${cleanPath}`;

            // Cleanup R2 (Primary Storage)
            if (R2_URL && R2_SECRET) {
                try {
                    const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/memories/${cleanPath}`;
                    await fetch(r2DeleteUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${R2_SECRET}` }
                    });
                } catch (e) {
                    console.error("[StorageCleanup] R2 delete failed:", e);
                }
            }

            // Cleanup Firebase Storage (Backup Storage)
            try {
                await deleteObject(ref(storage, fullPath));
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.error("[StorageCleanup] Firebase delete failed:", e);
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("deleteMemory error:", error);
        return { error: error.message };
    }
}

export async function submitPolaroid(imageUrl: string, caption?: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    const today = getTodayIST();
    try {
        const polaroidData = {
            user_id: user.uid,
            couple_id: coupleId,
            image_url: imageUrl,
            caption: caption || 'A moment shared',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            polaroid_date: today
        };

        // We use a fixed ID per user per day to ensure only ONE polaroid exists daily
        const polaroidId = `${user.uid}_${today}`;
        const polaroidRef = doc(db, 'couples', coupleId, 'polaroids', polaroidId);

        // Delete old one if exists (to manage R2 costs/cleanup)
        // In a real app we might want to keep them, but here we strictly follow "Daily Polaroid"
        await setDoc(polaroidRef, polaroidData);

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'moment',
                title: 'New Polaroid! 📸',
                message: `${state.profile?.display_name || 'Your partner'} just shared a daily Polaroid.`,
                actionUrl: '/dashboard'
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("submitPolaroid error:", error);
        return { error: error.message };
    }
}

export async function uploadWallpaper(uri: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Process Image (Resize and Convert to WebP)
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 2000 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.WEBP }
        );

        // 2. Further compression if needed
        const finalUri = await ImageCompressor.compress(manipulated.uri, {
            compressionMethod: 'auto',
            maxWidth: 2000,
        });

        const timestamp = Date.now();
        const fileName = `${user.uid}_${timestamp}.webp`;
        const storagePath = `wallpapers/${fileName}`;

        // 3. Upload to R2 (Primary)
        if (R2_URL && R2_SECRET) {
            const r2TargetUrl = `${R2_URL.replace(/\/$/, '')}/wallpapers/${fileName}`;
            const blob = await new Promise<Blob>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = () => resolve(xhr.response);
                xhr.onerror = () => reject(new Error('R2 Blob Conversion Failed'));
                xhr.responseType = 'blob';
                xhr.open('GET', finalUri, true);
                xhr.send();
            });

            await fetch(r2TargetUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${R2_SECRET}`,
                    'Content-Type': 'image/webp'
                },
                body: blob
            });
        }

        // 4. Upload to Firebase (Backup/Meta)
        const storageRef = ref(storage, storagePath);
        const blob = await new Promise<Blob>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => resolve(xhr.response);
            xhr.onerror = () => reject(new Error('Firebase Blob Conversion Failed'));
            xhr.responseType = 'blob';
            xhr.open('GET', finalUri, true);
            xhr.send();
        });
        await uploadBytes(storageRef, blob);

        // 5. Update Profile
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            custom_wallpaper_url: storagePath,
            wallpaper_mode: 'custom'
        });

        return { success: true, url: storagePath };
    } catch (error: any) {
        console.error("uploadWallpaper error:", error);
        return { error: error.message };
    }
}

export async function deleteWallpaper() {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const currentWallpaper = state.profile?.custom_wallpaper_url;

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Update Profile first (Optimistic for user)
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            custom_wallpaper_url: null,
            wallpaper_mode: 'stars'
        });

        // 2. Cleanup Storage
        if (currentWallpaper) {
            const cleanPath = currentWallpaper.replace(/^\/+/, '').replace(/^wallpapers\//i, '');
            const fullPath = `wallpapers/${cleanPath}`;

            // R2 Cleanup
            if (R2_URL && R2_SECRET) {
                try {
                    const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/wallpapers/${cleanPath}`;
                    await fetch(r2DeleteUrl, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${R2_SECRET}` }
                    });
                } catch (e) {
                    console.error("[WallpaperCleanup] R2 delete failed:", e);
                }
            }

            // Firebase Cleanup
            try {
                await deleteObject(ref(storage, fullPath));
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.error("[WallpaperCleanup] Firebase delete failed:", e);
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("deleteWallpaper error:", error);
        return { error: error.message };
    }
}

export async function savePolaroidToMemories(polaroid: any) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();
    const coupleId = state.profile?.couple_id;
    if (!coupleId) return { error: 'No couple found' };

    try {
        const memoryData = {
            couple_id: coupleId,
            user_id: user.uid,
            title: 'Daily Polaroid',
            content: polaroid.caption || 'A moment shared',
            image_url: polaroid.image_url,
            type: 'image',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            is_favorite: false,
            source: 'polaroid'
        };

        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(db, 'couples', coupleId, 'memories'), memoryData);

        if (state.partnerProfile?.id) {
            await sendNotification({
                recipientId: state.partnerProfile.id,
                actorId: user.uid,
                type: 'memory',
                title: 'Polaroid Archived! 🎞️',
                message: `${state.profile?.display_name || 'Your partner'} saved a daily Polaroid to your shared memories gallery.`,
                actionUrl: '/memories'
            });
        }

        return { success: true };
    } catch (error: any) {
        console.error("savePolaroidToMemories error:", error);
        return { error: error.message };
    }
}


export async function uploadAvatar(uri: string) {
    const user = auth.currentUser;
    if (!user) return { error: 'Not authenticated' };

    const { useOrbitStore } = await import('./store');
    const state = useOrbitStore.getState();

    const R2_URL = process.env.EXPO_PUBLIC_UPLOAD_URL;
    const R2_SECRET = process.env.EXPO_PUBLIC_UPLOAD_SECRET;

    try {
        // 1. Process Image
        const manipulated = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 800 } }],
            { compress: 0.75, format: ImageManipulator.SaveFormat.WEBP }
        );

        const timestamp = Date.now();
        const fileName = `${user.uid}_${timestamp}.webp`;
        const storagePath = `avatars/${fileName}`;

        // Utility: Convert URI to Blob with better error handling
        const getBlob = async (targetUri: string): Promise<Blob> => {
            const response = await fetch(targetUri);
            return await response.blob();
        };

        const blob = await getBlob(manipulated.uri);

        // 2. Upload to R2 (Primary)
        if (R2_URL && R2_SECRET) {
            try {
                const r2TargetUrl = `${R2_URL.replace(/\/$/, '')}/avatars/${fileName}`;
                await fetch(r2TargetUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${R2_SECRET}`,
                        'Content-Type': 'image/webp'
                    },
                    body: blob
                });
            } catch (r2Err) {
                console.warn("R2 Upload failed, continuing with Firebase:", r2Err);
            }
        }

        // 3. Upload to Firebase (Backup/Meta)
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, blob, { contentType: 'image/webp' });

        // 4. Update Profile
        const userRef = doc(db, 'users', user.uid);
        await firestoreUpdateDoc(userRef, {
            avatar_url: storagePath,
            updated_at: serverTimestamp()
        });

        // 5. Cleanup OLD avatar
        const oldAvatar = state.profile?.avatar_url;
        if (oldAvatar && oldAvatar.startsWith('avatars/') && oldAvatar !== storagePath) {
            (async () => {
                try {
                    const cleanOldPath = oldAvatar.replace(/^avatars\//, '');
                    await deleteObject(ref(storage, oldAvatar));
                    if (R2_URL && R2_SECRET) {
                        const r2DeleteUrl = `${R2_URL.replace(/\/$/, '')}/avatars/${cleanOldPath}`;
                        await fetch(r2DeleteUrl, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${R2_SECRET}` }
                        });
                    }
                } catch (cleanupErr) { /* non-critical */ }
            })();
        }

        return { success: true, url: storagePath };
    } catch (error: any) {
        console.error("uploadAvatar error:", error);
        return { error: error.code || error.message || "Unknown Upload Error" };
    }
}
