import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;
// Note: Edge runtime doesn't support firebase-admin easily in some environments, 
// but if the rest of the app uses it, we should be fine or use nodejs runtime.
export const runtime = 'nodejs';

type DailyContentData = {
    quote: string;
    challenge: string;
    tip: string;
};

const CONTENT_DATE_TZ = 'Asia/Kolkata';
const CACHE_COLLECTION = 'daily_inspiration_cache';
const CORS_HEADERS: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

function getTodayInspirationDate() {
    const d = new Date();
    const date = d.toLocaleDateString('en-CA', { timeZone: CONTENT_DATE_TZ });
    const hours = d.getHours();
    const phase = hours < 14 ? "AM" : "PM";
    return `${date}-${phase}`;
}

const GENERATING_SENTINEL = { status: "generating" } as const;
const WAIT_RETRIES = 60;
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
        const apiKey = process.env.GEMINI_API_KEY;

        const generateWithoutCache = async () => {
            if (!apiKey) {
                return NextResponse.json({ error: "Content unavailable" }, { status: 500, headers: CORS_HEADERS });
            }
            const content = await generateDailyContent(apiKey, today);
            return NextResponse.json(content, { headers: CORS_HEADERS });
        };

        // 1. Try Firestore cache
        const cacheRef = adminDb.collection(CACHE_COLLECTION).doc(today);
        const cacheSnap = await cacheRef.get();
        const cachedContent = cacheSnap.data()?.content;

        if (isReadyContent(cachedContent)) {
            return NextResponse.json(cachedContent, { headers: CORS_HEADERS });
        }

        // 2. Claim generation slot (atomic update)
        if (!apiKey) return generateWithoutCache();

        try {
            await adminDb.runTransaction(async (transaction) => {
                const docSnap = await transaction.get(cacheRef);
                if (docSnap.exists && docSnap.data()?.content?.status === 'generating') {
                    throw new Error('Already generating');
                }
                if (docSnap.exists && isReadyContent(docSnap.data()?.content)) {
                    return; // Already ready
                }
                transaction.set(cacheRef, {
                    content: GENERATING_SENTINEL,
                    updated_at: FieldValue.serverTimestamp()
                });
            });
        } catch (e: any) {
            if (e.message === 'Already generating') {
                // Wait for other process
                for (let i = 0; i < WAIT_RETRIES; i++) {
                    await sleep(WAIT_MS);
                    const snap = await cacheRef.get();
                    const content = snap.data()?.content;
                    if (isReadyContent(content)) return NextResponse.json(content, { headers: CORS_HEADERS });
                }
                return NextResponse.json({ error: "Preparing inspiration..." }, { status: 503, headers: CORS_HEADERS });
            }
        }

        // 3. Generate and save
        const content = await generateDailyContent(apiKey, today);
        await cacheRef.set({
            content,
            updated_at: FieldValue.serverTimestamp()
        });

        // Optional: Cleanup old entries (simple version: delete older than yesterday)
        // For brevity skipping exhaustive cleanup here as Firebase TTL can handle it or a cron.

        return NextResponse.json(content, { headers: CORS_HEADERS });

    } catch (error) {
        console.error("Daily inspiration API error:", error);
        return NextResponse.json({ error: "Inspiration is resting today." }, { status: 500, headers: CORS_HEADERS });
    }
}

export async function GET() { return handleDailyContent(); }
export async function POST() { return handleDailyContent(); }
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
