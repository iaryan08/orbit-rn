import { auth, db } from "@/lib/firebase/client";
import {
    collection,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    setDoc
} from "firebase/firestore";
import { sendNotification } from "./notifications";
import { Capacitor } from "@capacitor/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string | null | undefined): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());

// ── SQLite helpers — only used on native platforms ───────────────────────────
async function isSQLiteAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform();
}

async function writeCommentToSQLite(
    table: 'memory_comments' | 'polaroid_comments',
    comment: {
        id: string;
        memory_id?: string;
        polaroid_id?: string;
        couple_id: string;
        user_id: string;
        content: string;
        created_at: string;
        updated_at: string;
    }
) {
    if (!await isSQLiteAvailable()) return;
    try {
        const { LocalDB } = await import('./local-db');
        await LocalDB.upsertFromSync(table, { ...comment, pending_sync: 0, deleted: 0 } as any);
    } catch (e) {
        console.warn('[comments] SQLite write failed:', e);
    }
}

async function softDeleteCommentInSQLite(
    table: 'memory_comments' | 'polaroid_comments',
    commentId: string,
    coupleId: string
) {
    if (!await isSQLiteAvailable()) return;
    try {
        const { LocalDB } = await import('./local-db');
        await LocalDB.delete(table, commentId, coupleId);
    } catch (e) {
        console.warn('[comments] SQLite delete failed:', e);
    }
}

async function readCommentsFromSQLite(
    table: 'memory_comments' | 'polaroid_comments',
    coupleId: string,
    filterKey: 'memory_id' | 'polaroid_id',
    filterId: string
): Promise<any[]> {
    if (!await isSQLiteAvailable()) return [];
    try {
        const { sqliteService } = await import('./sqlite');
        const dbInstance = await sqliteService.getDb();
        const result = await dbInstance.query(
            `SELECT * FROM ${table} WHERE couple_id = ? AND ${filterKey} = ? AND deleted = 0 ORDER BY created_at ASC`,
            [coupleId, filterId]
        );
        return (result.values || []) as any[];
    } catch (e) {
        console.warn('[comments] SQLite read failed:', e);
        return [];
    }
}
// ─────────────────────────────────────────────────────────────────────────────

export async function addMemoryComment(memoryId: string, content: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        // Fetch user profile to get couple_id
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { error: "No couple found" };

        // Fetch memory metadata from correct nested path
        const memorySnap = await getDoc(doc(db, 'couples', coupleId, 'memories', memoryId));
        if (!memorySnap.exists()) return { error: "Memory not found" };
        const memoryData = memorySnap.data();

        const newCommentRef = doc(collection(db, "memory_comments"));
        const now = new Date().toISOString();

        const commentPayload: any = {
            id: newCommentRef.id,
            memory_id: memoryId,
            user_id: user.uid,
            content: content.trim(),
            created_at: now,
            updated_at: now,
            couple_id: memoryData.couple_id || null
        };

        await setDoc(newCommentRef, commentPayload);

        // SQLite Cache
        if (memoryData.couple_id) {
            writeCommentToSQLite('memory_comments', {
                ...commentPayload,
                couple_id: memoryData.couple_id
            });

            // Send Notification
            const coupleSnap = await getDoc(doc(db, 'couples', memoryData.couple_id));
            if (coupleSnap.exists()) {
                const couple = coupleSnap.data();
                const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;
                if (partnerId) {
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.uid,
                        type: 'comment',
                        title: 'New Memory Comment 💬',
                        message: `"${memoryData.title || 'Untitled'}": ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`,
                        actionUrl: `/memories?open=${memoryId}`
                    });
                }
            }
        }

        return { success: true, data: commentPayload };
    } catch (err: any) {
        console.error('[addMemoryComment] Error:', err);
        return { error: err.message };
    }
}

export async function getMemoryComments(memoryId: string) {
    try {
        const q = query(
            collection(db, "memory_comments"),
            where("memory_id", "==", memoryId),
            orderBy("created_at", "asc")
        );
        const querySnapshot = await getDocs(q);
        const comments = querySnapshot.docs.map(doc => doc.data());

        if (comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const profilePromises = userIds.map(uid => getDoc(doc(db, 'users', uid)));
        const profileSnaps = await Promise.all(profilePromises);

        const profileMap: Record<string, any> = {};
        profileSnaps.forEach(snap => {
            if (snap.exists()) {
                profileMap[snap.id] = snap.data();
            }
        });

        const data = comments.map((c: any) => ({
            ...c,
            profiles: profileMap[c.user_id] || { display_name: 'User', avatar_url: null }
        }));

        // Native SQLite background cache
        if (Capacitor.isNativePlatform() && auth.currentUser) {
            const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const coupleId = userSnap.data()?.couple_id;
            if (coupleId) {
                comments.forEach((c: any) => {
                    writeCommentToSQLite('memory_comments', {
                        id: c.id,
                        memory_id: memoryId,
                        couple_id: coupleId,
                        user_id: c.user_id,
                        content: c.content,
                        created_at: c.created_at,
                        updated_at: c.updated_at || c.created_at,
                    });
                });
            }
        }

        return { data };
    } catch (err: any) {
        console.error('[getMemoryComments] Error:', err);
        // SQLite Fallback
        if (Capacitor.isNativePlatform() && auth.currentUser) {
            try {
                const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                const coupleId = userSnap.data()?.couple_id;
                if (coupleId) {
                    const cached = await readCommentsFromSQLite('memory_comments', coupleId, 'memory_id', memoryId);
                    return { data: cached, cached: true };
                }
            } catch (sqlErr) {
                console.warn('[getMemoryComments] SQLite fallback failed:', sqlErr);
            }
        }
        return { error: err.message };
    }
}

export async function updateMemoryComment(commentId: string, content: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    try {
        const now = new Date().toISOString();
        const commentRef = doc(db, "memory_comments", commentId);
        const commentSnap = await getDoc(commentRef);

        if (!commentSnap.exists()) return { error: "Comment not found" };
        if (commentSnap.data().user_id !== user.uid) return { error: "Forbidden" };

        await updateDoc(commentRef, {
            content: content.trim(),
            updated_at: now
        });

        // SQLite Update
        if (Capacitor.isNativePlatform()) {
            try {
                const { sqliteService } = await import('./sqlite');
                const dbInstance = await sqliteService.getDb();
                await dbInstance.run(
                    `UPDATE memory_comments SET content = ?, updated_at = ?, pending_sync = 0 WHERE id = ?`,
                    [content.trim(), now, commentId]
                );
            } catch (e) {
                console.warn('[updateMemoryComment] SQLite update failed:', e);
            }
        }

        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deleteMemoryComment(commentId: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    try {
        const commentRef = doc(db, "memory_comments", commentId);
        const commentSnap = await getDoc(commentRef);

        if (!commentSnap.exists()) return { error: "Comment not found" };
        if (commentSnap.data().user_id !== user.uid) return { error: "Forbidden" };

        const coupleId = commentSnap.data().couple_id;
        await deleteDoc(commentRef);

        if (coupleId && Capacitor.isNativePlatform()) {
            await softDeleteCommentInSQLite('memory_comments', commentId, coupleId);
        }

        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function addPolaroidComment(polaroidId: string, content: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        // Fetch user profile to get couple_id
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const coupleId = userDoc.data()?.couple_id;
        if (!coupleId) return { error: "No couple found" };

        // Fetch polaroid metadata from correct nested path
        const polaroidSnap = await getDoc(doc(db, 'couples', coupleId, 'polaroids', polaroidId));
        if (!polaroidSnap.exists()) return { error: "Polaroid not found" };
        const polaroidData = polaroidSnap.data();

        const newCommentRef = doc(collection(db, "polaroid_comments"));
        const now = new Date().toISOString();

        const commentPayload: any = {
            id: newCommentRef.id,
            polaroid_id: polaroidId,
            user_id: user.uid,
            content: content.trim(),
            created_at: now,
            updated_at: now,
            couple_id: polaroidData.couple_id || null
        };

        await setDoc(newCommentRef, commentPayload);

        if (polaroidData.couple_id) {
            writeCommentToSQLite('polaroid_comments', {
                ...commentPayload,
                couple_id: polaroidData.couple_id
            });

            const coupleSnap = await getDoc(doc(db, 'couples', polaroidData.couple_id));
            if (coupleSnap.exists()) {
                const couple = coupleSnap.data();
                const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;
                if (partnerId) {
                    const targetLabel = polaroidData.caption ? `"${polaroidData.caption}"` : "the Polaroid";
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.uid,
                        type: 'comment',
                        title: 'New Polaroid Comment 💬',
                        message: `${targetLabel}: ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`,
                        actionUrl: `/dashboard?polaroidId=${polaroidId}`
                    });
                }
            }
        }

        return { success: true, data: commentPayload };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function updatePolaroidComment(commentId: string, content: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    try {
        const now = new Date().toISOString();
        const commentRef = doc(db, "polaroid_comments", commentId);
        const commentSnap = await getDoc(commentRef);

        if (!commentSnap.exists()) return { error: "Comment not found" };
        if (commentSnap.data().user_id !== user.uid) return { error: "Forbidden" };

        await updateDoc(commentRef, {
            content: content.trim(),
            updated_at: now
        });

        if (Capacitor.isNativePlatform()) {
            try {
                const { sqliteService } = await import('./sqlite');
                const dbInstance = await sqliteService.getDb();
                await dbInstance.run(
                    `UPDATE polaroid_comments SET content = ?, updated_at = ?, pending_sync = 0 WHERE id = ?`,
                    [content.trim(), now, commentId]
                );
            } catch (e) {
                console.warn('[updatePolaroidComment] SQLite update failed:', e);
            }
        }

        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deletePolaroidComment(commentId: string) {
    const user = auth.currentUser;
    if (!user) return { error: "Unauthorized" };

    try {
        const commentRef = doc(db, "polaroid_comments", commentId);
        const commentSnap = await getDoc(commentRef);

        if (!commentSnap.exists()) return { error: "Comment not found" };
        if (commentSnap.data().user_id !== user.uid) return { error: "Forbidden" };

        const coupleId = commentSnap.data().couple_id;
        await deleteDoc(commentRef);

        if (coupleId && Capacitor.isNativePlatform()) {
            await softDeleteCommentInSQLite('polaroid_comments', commentId, coupleId);
        }

        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function getPolaroidComments(polaroidId: string) {
    // Basic ID validation
    if (!polaroidId || polaroidId.startsWith('opt-')) {
        return { data: [] };
    }

    try {
        const q = query(
            collection(db, "polaroid_comments"),
            where("polaroid_id", "==", polaroidId),
            orderBy("created_at", "asc")
        );
        const querySnapshot = await getDocs(q);
        const comments = querySnapshot.docs.map(doc => doc.data());

        if (comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const profilePromises = userIds.map(uid => getDoc(doc(db, 'users', uid)));
        const profileSnaps = await Promise.all(profilePromises);

        const profileMap: Record<string, any> = {};
        profileSnaps.forEach(snap => {
            if (snap.exists()) {
                profileMap[snap.id] = snap.data();
            }
        });

        const data = comments.map((c: any) => ({
            ...c,
            profiles: profileMap[c.user_id] || { display_name: 'User', avatar_url: null }
        }));

        if (Capacitor.isNativePlatform() && auth.currentUser) {
            const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
            const coupleId = userSnap.data()?.couple_id;
            if (coupleId) {
                comments.forEach((c: any) => {
                    writeCommentToSQLite('polaroid_comments', {
                        id: c.id,
                        polaroid_id: polaroidId,
                        couple_id: coupleId,
                        user_id: c.user_id,
                        content: c.content,
                        created_at: c.created_at,
                        updated_at: c.updated_at || c.created_at,
                    });
                });
            }
        }

        return { data };
    } catch (err: any) {
        console.error('[getPolaroidComments] Error:', err);
        if (Capacitor.isNativePlatform() && auth.currentUser) {
            try {
                const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                const coupleId = userSnap.data()?.couple_id;
                if (coupleId) {
                    const cached = await readCommentsFromSQLite('polaroid_comments', coupleId, 'polaroid_id', polaroidId);
                    return { data: cached, cached: true };
                }
            } catch (sqlErr) {
                console.warn('[getPolaroidComments] SQLite fallback failed:', sqlErr);
            }
        }
        return { error: err.message };
    }
}
