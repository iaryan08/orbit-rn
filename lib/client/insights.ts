import { createClient } from '@/lib/supabase/client'
import { getTodayIST } from '@/lib/utils'
import staticContent from '@/lib/content/insights-static.json'

interface FeedCard {
    id?: string
    category: string
    title: string
    content: string
    image_url: string
    source: string
    publishedAt?: string
}

const WIKI_TOPICS: Record<string, string[]> = {
    "Sex Tips": ["Sex_positivity", "Human_sexual_activity", "Foreplay", "Sexual_communication"],
    "Safe Sex": ["Safe_sex", "Birth_control", "STI_prevention", "Condom"],
    "Orgasm & Pleasure": ["Orgasm", "Sexual_pleasure", "Clitoris", "Erogenous_zone"],
    "Reproductive Health": ["Reproductive_health", "Menstrual_cycle", "Fertility", "Sexual_health"],
    "Let's Talk": ["Interpersonal_communication", "Intimacy", "Relationship_counseling", "Active_listening"],
}

export async function syncDailyFeed(force: boolean = false) {
    // In a fully standalone app without a custom backend, syncing global feeds 
    // requires either everyone having write access to a global cache or 
    // simply relying on client-side fetching every time if not cached locally.
    // To preserve functionality, we will fetch directly and rely on local storage or individual caching if needed, 
    // but here we interact with Supabase as if the user has auth to read globals.

    // NOTE: This usually requires a secure backend (Admin client). 
    // We will attempt with the standard client. RLS must allow SELECT on global_insights_cache.

    const supabase = createClient()
    const today = getTodayIST()

    console.log(`[Standalone Sync] Checking sync for ${today}`)

    const { data: existing, error: cacheReadError } = await supabase
        .from('global_insights_cache')
        .select('insight_date, content')
        .eq('insight_date', today)
        .single()

    if (existing && !force) {
        return { success: true, message: "Already synced", data: existing.content }
    }

    console.log(`[Standalone Sync] Executing local sync...`)

    const allItems: FeedCard[] = []

    const wikiPromises = Object.entries(WIKI_TOPICS).map(async ([category, topics]) => {
        const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
        const topic = topics[dayOfYear % topics.length]
        return await fetchWikipediaSummary(category, topic)
    })

    const wikiResults = await Promise.allSettled(wikiPromises)
    wikiResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
            allItems.push(result.value)
        }
    })

    // News API omitted from standalone client-side calls to prevent API key leakage, unless proxy is used.
    // Using static fallback instead.

    for (const [category, items] of Object.entries(staticContent)) {
        const item = items[0]
        allItems.push({
            ...item,
            category,
            content: item.summary,
            image_url: item.imageUrl
        } as FeedCard)
    }

    // Absolute safety net: never return an empty/broken feed
    if (allItems.length === 0) {
        for (const [category, items] of Object.entries(staticContent)) {
            const item = items[0]
            allItems.push({
                ...item,
                category,
                content: item.summary,
                image_url: item.imageUrl
            } as FeedCard)
        }
    }

    return { success: true, data: allItems }
}


export async function getDailyInsights(coupleId: string, forceRefresh: boolean = false) {
    const supabase = createClient()
    const today = getTodayIST()

    if (!forceRefresh) {
        const { data: existingCouple } = await supabase
            .from('couple_insights')
            .select('content')
            .eq('couple_id', coupleId)
            .eq('insight_date', today)
            .single()

        if (existingCouple && existingCouple.content && (existingCouple.content as FeedCard[]).length > 4) {
            return { success: true, data: existingCouple.content }
        }
    }

    const { data: globalData } = await supabase
        .from('global_insights_cache')
        .select('content')
        .eq('insight_date', today)
        .single()

    let feed = (globalData?.content || []) as FeedCard[]

    if (feed.length === 0) {
        const syncResult = await syncDailyFeed(true)
        if (syncResult.success && syncResult.data) {
            feed = syncResult.data as FeedCard[]
        }
    }

    const justForYou = await generateJustForYouTips(coupleId)
    const combined = [...justForYou, ...feed]

    await supabase
        .from('couple_insights')
        .upsert({
            couple_id: coupleId,
            insight_date: today,
            content: combined
        }, { onConflict: 'couple_id, insight_date' })

    return { success: true, data: combined }
}

async function fetchWikipediaSummary(category: string, topic: string): Promise<FeedCard | null> {
    try {
        const response = await fetch(
            `https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts|pageimages&exintro&explaintext&redirects=1&titles=${encodeURIComponent(topic)}&pithumbsize=800&origin=*`
        )
        if (!response.ok) return null
        const data = await response.json()
        const pages = data.query?.pages
        if (!pages) return null

        const pageId = Object.keys(pages)[0]
        if (pageId === "-1") return null

        const page = pages[pageId]

        return {
            category,
            title: page.title,
            content: page.extract || "Read more on Wikipedia.",
            image_url: page.thumbnail?.source || "https://images.unsplash.com/photo-1542596768-5d1d21f1cf98?w=800&auto=format&fit=crop",
            source: "Wikipedia"
        }
    } catch (e) {
        console.error(`Wiki fetch failed for ${topic}:`, e)
        return null
    }
}

async function generateJustForYouTips(coupleId: string) {
    const fallbackTips = [
        { category: "Just For You", title: "Daily Connection Ritual", content: "Spend 5 uninterrupted minutes sharing your day. No phones, just presence.", image_url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&auto=format&fit=crop", source: "Lunara AI" },
    ]

    try {
        const prompt = `Generate EXACTLY 3 personalized wellness/intimacy tips for a couple ("Just For You"). 
        Format as JSON array: [{ "title": "...", "content": "..." }]`

        const response = await fetch('/api/generate-insights', {
            method: 'POST',
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) return fallbackTips;

        const { text } = await response.json();
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
