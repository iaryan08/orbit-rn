import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { moods, memories, cycleData } = body;

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'Gemini API Key not configured' }, { status: 500 });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

        const prompt = `
            You are an expert AI Intimacy and Relationship Coach for a premium couple's app called 'Orbit'. 
            Your goal is to generate a personalized 30-day "Intimacy Forecast" based on a couple's emotional history and biological cycle.

            CTX (Cycle & History):
            - Recent Moods: ${JSON.stringify(moods?.slice(0, 10))}
            - Recent Memories: ${JSON.stringify(memories?.slice(0, 5))}
            - Cycle Status: ${JSON.stringify(cycleData)}

            PREDICTIVE TASK:
            Return a JSON array of exactly 30 objects. Each object represents 1 day of the upcoming 30-day forecast.
            Each object MUST have:
            - "day": (Number 1-30)
            - "phase": "Menstrual" | "Follicular" | "Ovulatory" | "Luteal"
            - "aura": "Lavender" | "Soft Teal" | "Amber Glow" | "Dusty Rose" | "Midnight Blue"
            - "insight": (A poetic, supportive 1-2 sentence intimacy tip)
            - "cheatCode": (A specific tip for the partner to support them)
            - "mission": (A small daily challenge for the couple)
            - "fertilityStatus": "Low" | "Rising" | "Peak" | "High"

            AURA MAPPING:
            - Lavender: Menstrual / Soft Teal: Follicular / Amber Glow: Ovulatory / Dusty Rose & Midnight Blue: Luteal.

            JSON ONLY. No markdown. No conversational text. Start with [.
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Robust JSON extraction
        let cleanedJson = responseText.trim();
        if (cleanedJson.includes('[')) {
            cleanedJson = cleanedJson.substring(cleanedJson.indexOf('['), cleanedJson.lastIndexOf(']') + 1);
        }

        const forecast = JSON.parse(cleanedJson);
        return NextResponse.json({ forecast });
    } catch (error: any) {
        console.error('[LunaraRefresh] Error:', error);
        return NextResponse.json({ error: 'AI generation failed. Please try again later.' }, { status: 500 });
    }
}
