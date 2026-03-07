"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendNotification } from "./notifications";

// ============ MEMORY COMMENTS ============

export async function addMemoryComment(memoryId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        const { data, error } = await supabase
            .from("memory_comments")
            .insert({
                memory_id: memoryId,
                user_id: user.id,
                content: content.trim()
            })
            .select();

        if (error) {
            console.error("[MemoryComment] Insert Error:", JSON.stringify(error, null, 2));
            throw error;
        }

        // --- Fetch Memory Context & Send Notification ---
        const [{ data: profile }, { data: memory }] = await Promise.all([
            supabase.from('profiles').select('couple_id, display_name').eq('id', user.id).single(),
            supabase.from('memories').select('title').eq('id', memoryId).single()
        ]);

        if (profile?.couple_id) {
            const { data: couple } = await supabase
                .from('couples')
                .select('*')
                .eq('id', profile.couple_id)
                .single();

            if (couple) {
                const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;
                if (partnerId) {
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.id,
                        type: 'comment',
                        title: 'New Memory Comment 💬',
                        message: `"${memory?.title || 'Untitled'}": ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`,
                        actionUrl: `/memories?open=${memoryId}`
                    });
                }
            }
        }

        revalidatePath("/memories");
        return { success: true, data: data?.[0] };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function getMemoryComments(memoryId: string) {
    const supabase = await createClient();

    try {
        const { data: comments, error: commentError } = await supabase
            .from("memory_comments")
            .select('*')
            .eq("memory_id", memoryId)
            .order("created_at", { ascending: true });

        if (commentError) throw commentError;
        if (!comments || comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", userIds);

        if (profilesError) throw profilesError;

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

export async function updateMemoryComment(commentId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from("memory_comments")
            .update({ content: content.trim(), updated_at: new Date().toISOString() })
            .eq("id", commentId)
            .eq("user_id", user.id);

        if (error) throw error;
        revalidatePath("/memories");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deleteMemoryComment(commentId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from("memory_comments")
            .delete()
            .eq("id", commentId)
            .eq("user_id", user.id);

        if (error) throw error;
        revalidatePath("/memories");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

// ============ POLAROID COMMENTS ============

export async function addPolaroidComment(polaroidId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: "Unauthorized" };
    if (!content.trim()) return { error: "Comment cannot be empty" };

    try {
        const { data, error } = await supabase
            .from("polaroid_comments")
            .insert({
                polaroid_id: polaroidId,
                user_id: user.id,
                content: content.trim()
            })
            .select();

        if (error) throw error;

        // --- Fetch Polaroid Context & Send Notification ---
        const [{ data: profile }, { data: polaroid }] = await Promise.all([
            supabase.from('profiles').select('couple_id, display_name').eq('id', user.id).single(),
            supabase.from('polaroids').select('caption').eq('id', polaroidId).single()
        ]);

        if (profile?.couple_id) {
            const { data: couple } = await supabase
                .from('couples')
                .select('*')
                .eq('id', profile.couple_id)
                .single();

            if (couple) {
                const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;
                if (partnerId) {
                    const targetLabel = polaroid?.caption ? `"${polaroid.caption}"` : "your Polaroid";
                    await sendNotification({
                        recipientId: partnerId,
                        actorId: user.id,
                        type: 'comment',
                        title: 'New Polaroid Comment 💬',
                        message: `${targetLabel}: ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`,
                        actionUrl: `/dashboard?polaroidId=${polaroidId}`
                    });
                }
            }
        }

        revalidatePath("/dashboard");
        return { success: true, data: data?.[0] };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function updatePolaroidComment(commentId: string, content: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from("polaroid_comments")
            .update({ content: content.trim(), updated_at: new Date().toISOString() })
            .eq("id", commentId)
            .eq("user_id", user.id);

        if (error) throw error;
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function deletePolaroidComment(commentId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    try {
        const { error } = await supabase
            .from("polaroid_comments")
            .delete()
            .eq("id", commentId)
            .eq("user_id", user.id);

        if (error) throw error;
        revalidatePath("/dashboard");
        return { success: true };
    } catch (err: any) {
        return { error: err.message };
    }
}

export async function getPolaroidComments(polaroidId: string) {
    const supabase = await createClient();

    try {
        const { data: comments, error: commentError } = await supabase
            .from("polaroid_comments")
            .select('*')
            .eq("polaroid_id", polaroidId)
            .order("created_at", { ascending: true });

        if (commentError) throw commentError;
        if (!comments || comments.length === 0) return { data: [] };

        const userIds = [...new Set(comments.map((c: any) => c.user_id))];
        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", userIds);

        if (profilesError) throw profilesError;

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
