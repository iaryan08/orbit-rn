"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getLatestPolaroid() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from("profiles")
        .select("couple_id")
        .eq("id", user.id)
        .single();

    if (!profile?.couple_id) return null;

    const { data: polaroid } = await supabase
        .from("polaroids")
        .select("*")
        .eq("couple_id", profile.couple_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    return polaroid;
}

export async function getDashboardPolaroids(providedCoupleId?: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { userPolaroid: null, partnerPolaroid: null };

    let coupleId = providedCoupleId;
    if (!coupleId) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("couple_id")
            .eq("id", user.id)
            .single();
        coupleId = profile?.couple_id;
    }

    if (!coupleId) return { userPolaroid: null, partnerPolaroid: null };

    const { data: couple } = await supabase
        .from("couples")
        .select("user1_id, user2_id")
        .eq("id", coupleId)
        .single();

    if (!couple) return { userPolaroid: null, partnerPolaroid: null };

    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;

    const [userRes, partnerRes] = await Promise.all([
        supabase
            .from("polaroids")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        partnerId ? supabase
            .from("polaroids")
            .select("*")
            .eq("user_id", partnerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle() : Promise.resolve({ data: null })
    ]);

    return {
        userPolaroid: userRes.data,
        partnerPolaroid: partnerRes.data
    };
}

import { sendNotification } from "@/lib/actions/notifications";

export async function createPolaroid(payload: {
    imageUrl: string;
    caption: string;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const { data: profile } = await supabase
        .from("profiles")
        .select("couple_id, display_name")
        .eq("id", user.id)
        .single();

    if (!profile?.couple_id) return { error: "No couple linked" };

    // Get partner ID for notification
    const { data: couple } = await supabase
        .from("couples")
        .select("user1_id, user2_id")
        .eq("id", profile.couple_id)
        .single();

    if (!couple) return { error: "Couple data error" };
    const partnerId = couple.user1_id === user.id ? couple.user2_id : couple.user1_id;

    // Delete previous polaroid for this user specifically (keep only latest per user)
    await supabase
        .from("polaroids")
        .delete()
        .eq("user_id", user.id);

    // Insert new polaroid
    const { data: polaroid, error } = await supabase
        .from("polaroids")
        .insert({
            image_url: payload.imageUrl,
            caption: payload.caption,
            user_id: user.id,
            couple_id: profile.couple_id
        })
        .select()
        .single();

    if (error) return { error: error.message };

    // Notify Partner
    if (partnerId) {
        await sendNotification({
            recipientId: partnerId,
            actorId: user.id,
            type: 'polaroid',
            title: 'New Polaroid Snapped',
            message: `${profile.display_name || 'Your partner'} just snapped a new polaroid!`,
            actionUrl: `/dashboard?polaroidId=${encodeURIComponent(polaroid.id)}`,
            metadata: { polaroid_id: polaroid.id }
        });
    }

    revalidatePath("/dashboard");
    return { success: true };
}

export async function deletePolaroid(id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };

    const { error } = await supabase
        .from("polaroids")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    return { success: true };
}
