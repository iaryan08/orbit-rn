import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const runtime = 'edge';

type DailyContentData = {
    quote: string;
    challenge: string;
    tip: string;
};
type CacheRow = {
    content_date: string;
    content: DailyContentData | { status: "generating" };
};

const CONTENT_DATE_TZ = 'Asia/Kolkata';
const CACHE_TABLE = 'daily_inspiration_cache';
const CORS_HEADERS: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Small CDN cache for Android/web app clients while DB remains source-of-truth.
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

function getTodayInspirationDate() {
    const d = new Date();
    // Match client side IST logic exactly
    const date = d.toLocaleDateString('en-CA', { timeZone: CONTENT_DATE_TZ });
    const hours = d.getHours();
    const phase = hours < 14 ? "AM" : "PM"; // 14:00 (2 PM) cutoff
    return `${date}-${phase}`;
}

const GENERATING_SENTINEL = { status: "generating" } as const;
const WAIT_RETRIES = 60; // 60 * 250ms = 15 seconds
const WAIT_MS = 250;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReadyContent(content: unknown): content is DailyContentData {
    if (!content || typeof content !== "object") return false;
    const c = content as Record<string, unknown>;
    return typeof c.quote === "string" && typeof c.challenge === "string" && typeof c.tip === "string";
}

async function generateDailyContent(apiKey: string, contentDate: string): Promise<DailyContentData> {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Today's date is ${contentDate}. You are a romantic relationship coach. Generate a NEW and UNIQUE "Daily Inspiration" for a couple for this specific day.
Provide exactly three parts in a strict JSON format:
{
  "quote": "A unique, beautiful, short romantic quote about love or partnership (don't repeat common ones)",
  "challenge": "A small, actionable daily challenge for the couple to do today (e.g., 'give each other a 10-second hug')",
  "tip": "A quick relationship tip for better communication or intimacy"
}
Make it feel warm, premium, and slightly poetic. Ensure it is distinct from generic advice.
Only return the JSON. No other text.`;

    const result = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: prompt
    });
    const text = result.text || "";
    const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonString);

    return {
        quote: String(parsed.quote || '').trim(),
        challenge: String(parsed.challenge || '').trim(),
        tip: String(parsed.tip || '').trim(),
    };
}

async function handleDailyContent() {
    try {
        const today = getTodayInspirationDate();
        let admin: Awaited<ReturnType<typeof createAdminClient>> | null = null;
        let dbAvailable = true;
        try {
            admin = await createAdminClient();
        } catch (e) {
            dbAvailable = false;
            console.error("Daily cache admin client init failed:", e);
        }
        const nowIso = new Date().toISOString();
        const apiKey = process.env.GEMINI_API_KEY;

        const generateWithoutCache = async () => {
            if (!apiKey) {
                return NextResponse.json(
                    { error: "Content currently unavailable" },
                    { status: 500, headers: CORS_HEADERS }
                );
            }
            const content = await generateDailyContent(apiKey, today);
            return new NextResponse(JSON.stringify(content), { status: 200, headers: CORS_HEADERS });
        };

        if (!dbAvailable || !admin) {
            return await generateWithoutCache();
        }

        // Keep cache global and day-scoped: remove older entries every day.
        const { error: cleanupError } = await admin
            .from(CACHE_TABLE)
            .delete()
            .lt('content_date', today);
        if (cleanupError) {
            console.error("Daily cache cleanup error:", cleanupError);
            if ((cleanupError as any)?.code === 'PGRST301') {
                return await generateWithoutCache();
            }
        }

        // 1) Try global once-per-day cache first
        const { data: cached } = await admin
            .from(CACHE_TABLE)
            .select('content')
            .eq('content_date', today)
            .single();

        if (isReadyContent(cached?.content)) {
            return new NextResponse(JSON.stringify(cached.content), { status: 200, headers: CORS_HEADERS });
        }

        // 2) Claim generation slot for this day.
        //    Only the request that successfully inserts sentinel should generate.
        const { data: claimRow } = await admin
            .from(CACHE_TABLE)
            .insert({ content_date: today, content: GENERATING_SENTINEL, updated_at: nowIso })
            .select('content_date')
            .maybeSingle();

        const iAmGenerator = !!claimRow;

        if (!iAmGenerator) {
            // Another request/process is generating. Wait briefly for ready content.
            for (let i = 0; i < WAIT_RETRIES; i++) {
                await sleep(WAIT_MS);
                const { data: waited } = await admin
                    .from(CACHE_TABLE)
                    .select('content')
                    .eq('content_date', today)
                    .single();
                if (isReadyContent(waited?.content)) {
                    return new NextResponse(JSON.stringify(waited.content), { status: 200, headers: CORS_HEADERS });
                }
            }
            // Timed out waiting: return graceful error instead of duplicate generation.
            return new NextResponse(
                JSON.stringify({ error: "Daily inspiration is being prepared. Please retry in a moment." }),
                { status: 503, headers: CORS_HEADERS }
            );
        }

        // 3) This request owns generation for today. Generate once, then persist globally.
        if (!apiKey) {
            console.error("GEMINI_API_KEY is missing and daily cache is empty");
            return NextResponse.json(
                { error: "Content currently unavailable" },
                { status: 500, headers: CORS_HEADERS }
            );
        }
        const content = await generateDailyContent(apiKey, today);

        const { error: upsertError } = await admin
            .from(CACHE_TABLE)
            .upsert(
                { content_date: today, content, updated_at: nowIso },
                { onConflict: 'content_date' }
            );
        if (upsertError) {
            console.error("Daily cache upsert error:", upsertError);
        }

        return new NextResponse(JSON.stringify(content), { status: 200, headers: CORS_HEADERS });
    } catch (error) {
        console.error("Daily inspiration API error:", error);
        return new NextResponse(
            JSON.stringify({ error: "Inspiration is resting today. Check back tomorrow!" }),
            { status: 500, headers: CORS_HEADERS }
        );
    }
}

export async function GET() {
    return handleDailyContent();
}

export async function POST() {
    return handleDailyContent();
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS
    });
}
