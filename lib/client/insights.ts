import { db } from '@/lib/firebase/client'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
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
    // Client-side standalone sync logic migrated to Firestore pattern.
    const today = getTodayIST()

    try {
        const globalRef = doc(db, 'global_insights_cache', today);
        const globalSnap = await getDoc(globalRef);

        if (globalSnap.exists() && !force) {
            return { success: true, message: "Already synced", data: globalSnap.data().content }
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

        // Use static fallback for categories
        for (const [category, items] of Object.entries(staticContent)) {
            const item = items[0]
            allItems.push({
                ...item,
                category,
                content: item.summary,
                image_url: item.imageUrl
            } as FeedCard)
        }

        return { success: true, data: allItems }
    } catch (error: any) {
        console.error("Local sync failed:", error)
        return { success: false, error: error.message }
    }
}

export async function getDailyInsights(coupleId: string, forceRefresh: boolean = false) {
    const today = getTodayIST()

    if (!forceRefresh) {
        const coupleRef = doc(db, 'couple_insights', `${coupleId}_${today}`);
        const coupleSnap = await getDoc(coupleRef);
        const data = coupleSnap.data();

        if (coupleSnap.exists() && data?.content && (data.content as FeedCard[]).length > 4) {
            return { success: true, data: data.content }
        }
    }

    const globalRef = doc(db, 'global_insights_cache', today);
    const globalSnap = await getDoc(globalRef);
    let feed = (globalSnap.data()?.content || []) as FeedCard[]

    if (feed.length === 0) {
        const syncResult = await syncDailyFeed(true)
        if (syncResult.success && syncResult.data) {
            feed = syncResult.data as FeedCard[]
        }
    }

    const justForYou = await generateJustForYouTips(coupleId)
    const combined = [...justForYou, ...feed]

    try {
        await setDoc(doc(db, 'couple_insights', `${coupleId}_${today}`), {
            couple_id: coupleId,
            insight_date: today,
            content: combined,
            updated_at: serverTimestamp()
        });
    } catch (e) {
        console.warn("Failed to cache couple insights locally:", e);
    }

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
