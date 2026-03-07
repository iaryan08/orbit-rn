'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getTodayIST } from '@/lib/utils'
import { GoogleGenerativeAI } from '@google/generative-ai'
import staticContent from '@/lib/content/insights-static.json'

// --- Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '')
const INSIGHT_API_KEY = process.env.INSIGHT_API_KEY
const GLOBAL_ID = '00000000-0000-0000-0000-000000000000'

interface FeedCard {
    id?: string
    category: string
    title: string
    content: string
    image_url: string
    source: string
    publishedAt?: string
}

// Predefined Wikipedia topics for rotation
const WIKI_TOPICS: Record<string, string[]> = {
    "Sex Tips": ["Sex_positivity", "Human_sexual_activity", "Foreplay", "Sexual_communication"],
    "Safe Sex": ["Safe_sex", "Birth_control", "STI_prevention", "Condom"],
    "Orgasm & Pleasure": ["Orgasm", "Sexual_pleasure", "Clitoris", "Erogenous_zone"],
    "Reproductive Health": ["Reproductive_health", "Menstrual_cycle", "Fertility", "Sexual_health"],
    "Let's Talk": ["Interpersonal_communication", "Intimacy", "Relationship_counseling", "Active_listening"],
}

// --- Main Actions ---

/**
 * Fetches and normalizes content from Wikipedia, NewsAPI, and Static JSON.
 * Designed to be called by a CRON job or manually.
 */
export async function syncDailyFeed(force: boolean = false) {
    const supabase = await createAdminClient() // Use Admin Client
    const today = getTodayIST()

    console.log(`[Cron] Checking sync for ${today}`)

    // 1. Check if we already synced today
    const { data: existing } = await supabase
        .from('global_insights_cache')
        .select('insight_date')
        .eq('insight_date', today)
        .single()

    if (existing && !force) {
        console.log(`[Cron] Already synced for ${today}. Skipping.`)
        return { success: true, message: "Already synced" }
    }

    // 2. Randomization Logic (for Cron window 3:00 - 4:00 AM)
    // If called via Cron (not force), roll dice.
    // We want it to run ONCE between 3:00 and 4:00.
    // If current time is nearing 4:00 AM (e.g. > 3:45), run definitely.
    // Otherwise, 30% chance.
    if (!force) {
        const istHours = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours()
        const istMinutes = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getMinutes()

        // Critical window check (e.g. after 3:40 AM, just do it to ensure it happens)
        const isLateWindow = istHours === 3 && istMinutes >= 40

        if (!isLateWindow && Math.random() > 0.3) {
            console.log(`[Cron] Randomly postponing sync (Time: ${istHours}:${istMinutes})`)
            return { success: true, message: "Randomly postponed" }
        }
    }

    console.log(`[Cron] Executing sync...`)

    const allItems: FeedCard[] = []

    // 3. Wikipedia Content (Education/Evergreen)
    const wikiPromises = Object.entries(WIKI_TOPICS).map(async ([category, topics]) => {
        // Rotate weekly based on date
        const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
        const topic = topics[dayOfYear % topics.length]

        return await fetchWikipediaSummary(category, topic)
    })

    const wikiResults = await Promise.all(wikiPromises)
    wikiResults.forEach(item => {
        if (item) allItems.push(item)
    })

    // 4. NewsAPI Content (Freshness)
    const newsItems = await fetchNewsAPIContent()
    allItems.push(...newsItems)

    // 5. Static Fallback (Stability)
    // Add 1 static item per category to ensure variety
    for (const [category, items] of Object.entries(staticContent)) {
        const item = items[0] // Taking the first one as basic fallback
        allItems.push({
            ...item,
            category,
            content: item.summary, // Mapping summary to content
            image_url: item.imageUrl
        } as FeedCard)
    }

    // Save/Upsert to Global Cache Table
    const { error } = await supabase
        .from('global_insights_cache')
        .upsert({
            insight_date: today,
            content: allItems
        }, { onConflict: 'insight_date' })

    if (error) {
        console.error("Error caching global feed:", error)
        return { success: false, error }
    }

    return { success: true, count: allItems.length }
}

/**
 * Main function used by the UI.
 */
export async function getDailyInsights(coupleId: string, forceRefresh: boolean = false) {
    const supabase = await createClient()
    const supabaseAdmin = await createAdminClient() // Use Admin for Global Reads
    const today = getTodayIST()

    // 1. Check if couple already has personalized content cached (SKIP if forceRefresh is true)
    if (!forceRefresh) {
        const { data: existingCouple } = await supabase
            .from('couple_insights')
            .select('content')
            .eq('couple_id', coupleId)
            .eq('insight_date', today)
            .single()

        // Only return if we have a "healthy" amount of content (e.g. > 4 items)
        if (existingCouple && existingCouple.content && (existingCouple.content as FeedCard[]).length > 4) {
            return { success: true, data: existingCouple.content }
        }
    }

    // 2. Fetch Global Feed from Cache Table (Using Admin/Regular client works now if policy applies)
    // We use Admin just to be safe with RLS initial setup
    const { data: globalData } = await supabaseAdmin
        .from('global_insights_cache')
        .select('content')
        .eq('insight_date', today)
        .single()

    let feed = (globalData?.content || []) as FeedCard[]

    // Fallback if global feed is empty (trigger sync)
    if (feed.length === 0) {
        const syncResult = await syncDailyFeed()
        if (syncResult.success) {
            const { data: reFetchedGlobal } = await supabaseAdmin
                .from('global_insights_cache')
                .select('content')
                .eq('insight_date', today)
                .single()
            feed = (reFetchedGlobal?.content || []) as FeedCard[]
        }
    }

    // 3. Add "Just For You" personalized tips via Gemini
    const justForYou = await generateJustForYouTips(coupleId)
    const combined = [...justForYou, ...feed]

    // 4. Cache for this couple (using regular client as it's their own data)
    await supabase
        .from('couple_insights')
        .upsert({
            couple_id: coupleId,
            insight_date: today,
            content: combined
        }, { onConflict: 'couple_id, insight_date' })

    return { success: true, data: combined }
}

// --- Internal Helpers ---

async function fetchWikipediaSummary(category: string, topic: string): Promise<FeedCard | null> {
    try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`)
        if (!response.ok) return null
        const data = await response.json()

        return {
            category,
            title: data.title,
            content: data.extract,
            image_url: data.originalimage?.source || "https://images.unsplash.com/photo-1542596768-5d1d21f1cf98?w=800&auto=format&fit=crop",
            source: "Wikipedia"
        }
    } catch (e) {
        console.error(`Wiki fetch failed for ${topic}:`, e)
        return null
    }
}

async function fetchNewsAPIContent(): Promise<FeedCard[]> {
    if (!INSIGHT_API_KEY) return []

    const categories = [
        { key: "Latest News", query: "sexual health" },
        { key: "Common Worries", query: "relationship advice health" },
        { key: "Reproductive Health", query: "fertility health" }
    ]

    try {
        const promises = categories.map(async (cat) => {
            const response = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(cat.query)}&language=en&pageSize=3&apiKey=${INSIGHT_API_KEY}`)
            if (!response.ok) return []
            const data = await response.json()

            return data.articles.map((art: any) => ({
                category: cat.key,
                title: art.title,
                content: art.description || art.content || "Read more at source.",
                image_url: art.urlToImage || "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=800&auto=format&fit=crop",
                source: art.source?.name || "NewsAPI"
            }))
        })

        const results = await Promise.all(promises)
        return results.flat()
    } catch (e) {
        console.error("NewsAPI fetch failed:", e)
        return []
    }
}

async function generateJustForYouTips(coupleId: string) {
    const fallbackTips = [
        { category: "Just For You", title: "Daily Connection Ritual", content: "Spend 5 uninterrupted minutes sharing your day. No phones, just presence.", image_url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&auto=format&fit=crop", source: "Lunara AI" },
    ]

    if (!process.env.GOOGLE_API_KEY) return fallbackTips

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
        const prompt = `Generate EXACTLY 3 personalized wellness/intimacy tips for a couple ("Just For You"). 
        Format as JSON array: [{ "title": "...", "content": "..." }]`

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()
        const jsonBlock = text.replace(/```json/g, '').replace(/```/g, '').trim()
        const data = JSON.parse(jsonBlock)

        return data.map((tip: any) => ({
            category: "Just For You",
            title: tip.title,
            content: tip.content,
            image_url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=800&auto=format&fit=crop",
            source: "Lunara AI"
        }))
    } catch (e) {
        return fallbackTips
    }
}

