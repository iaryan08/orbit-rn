import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const maxDuration = 60;
export const runtime = 'nodejs';

const CORS_HEADERS: HeadersInit = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { phase, cycleDay, symptoms = [], goals = [], avgCycleLength = 28 } = body;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "API key missing" }, { status: 500, headers: CORS_HEADERS });
        }

        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are a holistic menstrual cycle and relationship coach. 
The user is on Day ${cycleDay} of a ${avgCycleLength}-day cycle, currently in the ${phase} phase.
Recent symptoms: ${symptoms.length ? symptoms.join(', ') : 'None reported'}.
User goals: ${goals.length ? goals.join(', ') : 'General cycle tracking'}.

Provide exactly three parts in a strict JSON format:
{
  "insight": "A short, empathetic, scientifically grounded insight about what her body is doing right now (hormonally or physically). Keep it to 2 sentences max.",
  "recommendation": "A highly actionable holistic recommendation (e.g., specific food, movement type, or self-care act) tailored to day ${cycleDay} and her symptoms.",
  "hormoneContext": "A 1-sentence summary of the dominant hormones right now."
}
Only return the JSON. No other text.`;

        const result = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: prompt
        });

        const text = result.text || "";
        const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonString);

        return NextResponse.json({
            insight: String(parsed.insight || '').trim(),
            recommendation: String(parsed.recommendation || '').trim(),
            hormoneContext: String(parsed.hormoneContext || '').trim()
        }, { headers: CORS_HEADERS });

    } catch (error) {
        console.error("Daily Insight API error:", error);
        return NextResponse.json({ error: "Failed to generate insight" }, { status: 500, headers: CORS_HEADERS });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
