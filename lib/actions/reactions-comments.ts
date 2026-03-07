"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireUser } from "@/lib/firebase/auth-server";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";
import { FieldValue } from "firebase-admin/firestore";

// ============ HELPERS ============

async function getUserAndProfile() {
    const user = await requireUser();
    if (!user) return { user: null, profile: null };

    const userDoc = await adminDb.collection('users').doc(user.uid).get();
    if (!userDoc.exists) return { user, profile: null };

    return { user, profile: userDoc.data() };
}

// ============ MEMORY COMMENTS ============

export async function addMemoryComment(memoryId: string, content: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        const commentData = {
            memory_id: memoryId,
            user_id: user.uid,
            content: content.trim(),
            created_at: FieldValue.serverTimestamp()
        };

        const memoryRef = adminDb.collection("couples").doc(profile.couple_id).collection("memories").doc(memoryId);
        const memorySnap = await memoryRef.get();
        if (!memorySnap.exists) return { error: "Memory not found" };
        const memory = memorySnap.data();

        const commentRef = await memoryRef.collection("comments").add(commentData);

        // --- Send Notification ---
        const coupleSnap = await adminDb.collection('couples').doc(profile.couple_id).get();
        const couple = coupleSnap.data();

        if (couple) {
            const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;
            if (partnerId) {
                await sendNotification({
                    recipientId: partnerId,
                    actorId: user.uid,
                    type: 'comment',
                    title: 'New Memory Comment 💬',
                    message: `"${memory?.title || 'Untitled'}": ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`,
                    actionUrl: `/memories?open=${memoryId}`
                });
            }
        }

        revalidatePath("/memories");
        return { success: true, data: { id: commentRef.id, ...commentData } };
    } catch (err: any) {
        console.error("[MemoryComment] Error:", err);
        return { error: err.message };
    }
}

export async function getMemoryComments(memoryId: string) {
    const { profile } = await getUserAndProfile();
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentsSnap = await adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("memories")
            .doc(memoryId)
            .collection("comments")
            .orderBy("created_at", "asc")
            .get();

        const comments = commentsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
        }));

        if (comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const profiles: any[] = [];
        for (const uid of userIds) {
            const pSnap = await adminDb.collection("users").doc(uid).get();
            if (pSnap.exists) {
                const pd = pSnap.data();
                profiles.push({ id: uid, display_name: pd?.display_name, avatar_url: pd?.avatar_url });
            }
        }

        const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
        const data = comments.map((c: any) => ({
            ...c,
            profiles: profileMap[c.user_id] || null
        }));

        return { data };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function updateMemoryComment(commentId: string, content: string, memoryId: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentRef = adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("memories")
            .doc(memoryId)
            .collection("comments")
            .doc(commentId);

        const commentSnap = await commentRef.get();
        if (!commentSnap.exists || commentSnap.data()?.user_id !== user.uid) {
            return { error: "Unauthorized or comment not found" };
        }

        await commentRef.update({
            content: content.trim(),
            updated_at: FieldValue.serverTimestamp()
        });

        revalidatePath("/memories");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deleteMemoryComment(commentId: string, memoryId: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentRef = adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("memories")
            .doc(memoryId)
            .collection("comments")
            .doc(commentId);

        const commentSnap = await commentRef.get();
        if (!commentSnap.exists || commentSnap.data()?.user_id !== user.uid) {
            return { error: "Unauthorized or comment not found" };
        }

        await commentRef.delete();
        revalidatePath("/memories");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

// ============ POLAROID COMMENTS ============

export async function addPolaroidComment(polaroidId: string, content: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        const commentData = {
            polaroid_id: polaroidId,
            user_id: user.uid,
            content: content.trim(),
            created_at: FieldValue.serverTimestamp()
        };

        const polaroidRef = adminDb.collection("couples").doc(profile.couple_id).collection("polaroids").doc(polaroidId);
        const polaroidSnap = await polaroidRef.get();
        if (!polaroidSnap.exists) return { error: "Polaroid not found" };
        const polaroid = polaroidSnap.data();

        const commentRef = await polaroidRef.collection("comments").add(commentData);

        // --- Send Notification ---
        const coupleSnap = await adminDb.collection('couples').doc(profile.couple_id).get();
        const couple = coupleSnap.data();

        if (couple) {
            const partnerId = couple.user1_id === user.uid ? couple.user2_id : couple.user1_id;
            if (partnerId) {
                const targetLabel = polaroid?.caption ? `"${polaroid.caption}"` : "your Polaroid";
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

        revalidatePath("/dashboard");
        return { success: true, data: { id: commentRef.id, ...commentData } };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function updatePolaroidComment(commentId: string, content: string, polaroidId: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentRef = adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("polaroids")
            .doc(polaroidId)
            .collection("comments")
            .doc(commentId);

        const commentSnap = await commentRef.get();
        if (!commentSnap.exists || commentSnap.data()?.user_id !== user.uid) {
            return { error: "Unauthorized or comment not found" };
        }

        await commentRef.update({
            content: content.trim(),
            updated_at: FieldValue.serverTimestamp()
        });

        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deletePolaroidComment(commentId: string, polaroidId: string) {
    const { user, profile } = await getUserAndProfile();
    if (!user) return { error: "Unauthorized" };
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentRef = adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("polaroids")
            .doc(polaroidId)
            .collection("comments")
            .doc(commentId);

        const commentSnap = await commentRef.get();
        if (!commentSnap.exists || commentSnap.data()?.user_id !== user.uid) {
            return { error: "Unauthorized or comment not found" };
        }

        await commentRef.delete();
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function getPolaroidComments(polaroidId: string) {
    const { profile } = await getUserAndProfile();
    if (!profile?.couple_id) return { error: "No couple found" };

    try {
        const commentsSnap = await adminDb
            .collection("couples")
            .doc(profile.couple_id)
            .collection("polaroids")
            .doc(polaroidId)
            .collection("comments")
            .orderBy("created_at", "asc")
            .get();

        const comments = commentsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate()?.toISOString() || new Date().toISOString()
        }));

        if (comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const profiles: any[] = [];
        for (const uid of userIds) {
            const pSnap = await adminDb.collection("users").doc(uid).get();
            if (pSnap.exists) {
                const pd = pSnap.data();
                profiles.push({ id: uid, display_name: pd?.display_name, avatar_url: pd?.avatar_url });
            }
        }

        const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));
        const data = comments.map((c: any) => ({
            ...c,
            profiles: profileMap[c.user_id] || null
        }));

        return { data };
    } catch (err: any) {
        return { error: err.message };
    }
}
