export interface SupportSuggestion {
    id: string
    type: 'physical' | 'emotional' | 'logistical' | 'surprise'
    text: string
    description: string
}

export async function fetchSupportSuggestions(partnerId: string, partnerName: string, phase: string, day: number): Promise<SupportSuggestion[]> {
    const dateKey = new Date().toISOString().split('T')[0]
    const cacheKey = `support_tips_${partnerId}_${dateKey}_${phase}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
        try {
            return JSON.parse(cached)
        } catch (e) {
            localStorage.removeItem(cacheKey)
        }
    }

    try {
        const phaseContext: Record<string, string> = {
            'The Winter': 'Menstrual phase - Time for deep rest, cozy comfort, and gentle listening.',
            'The Spring': 'Follicular phase - Rising energy, creativity, and new beginnings.',
            'The Summer': 'Ovulatory phase - Peak magnetism, social energy, and vibrant connection.',
            'The Autumn': 'Luteal phase - Grounding, focus, and preparation for rest.'
        }
        const context = phaseContext[phase] || 'General cycle support.'

        const response = await fetch('/api/generate-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `Partner: ${partnerName}. Phase: ${phase} (${context}). Day: ${day}. 
                Task: Generate 3 highly personalized, poetic, and creative support suggestions for ${partnerName} today.
                CRITICAL: Do NOT use pronouns like "her" or "she" in the 'text' or 'description'. ALWAYS use the name "${partnerName}".
                Return ONLY a JSON array of 3 objects with keys: id (string), type (physical/emotional/logistical/surprise), text (max 30 chars), description (max 80 chars).`
            })
        })

        const data = await response.json()
        let aiTips: SupportSuggestion[] = []

        if (data.text) {
            const cleanText = data.text.replace(/```json|```/g, '').trim()
            aiTips = JSON.parse(cleanText)
        } else {
            throw new Error("Missing AI response")
        }

        localStorage.setItem(cacheKey, JSON.stringify(aiTips))
        return aiTips
    } catch (error) {
        console.error("AI Fetch error:", error)
        const fallbacks: Record<string, SupportSuggestion[]> = {
            'The Winter': [
                { id: 'w1', type: 'physical', text: `Heat Pad for ${partnerName}`, description: `Help soothe ${partnerName}'s cramps with something warm.` },
                { id: 'w2', type: 'logistical', text: `Handle ${partnerName}'s Tasks`, description: `Give ${partnerName} room to rest by handling the household chores.` },
                { id: 'w3', type: 'emotional', text: `Listen to ${partnerName}`, description: `A safe space for ${partnerName} to share feelings is vital right now.` }
            ],
            'The Spring': [
                { id: 's1', type: 'surprise', text: `Date with ${partnerName}`, description: `${partnerName} has rising energy! A hike or a walk would be great.` },
                { id: 's2', type: 'emotional', text: `Support ${partnerName}'s Win`, description: `Be ${partnerName}'s biggest cheerleader as a new journey begins.` },
                { id: 's3', type: 'surprise', text: `New Recipe for ${partnerName}`, description: `Match ${partnerName}'s optimism with a fresh culinary adventure.` }
            ],
            'The Summer': [
                { id: 'su1', type: 'surprise', text: `Romance ${partnerName}`, description: `${partnerName} is feeling magnetic. Plan something extra special.` },
                { id: 'su2', type: 'physical', text: `Massage ${partnerName}`, description: `Physical touch is extra high on ${partnerName}'s list right now.` },
                { id: 'su3', type: 'emotional', text: `Praise ${partnerName}`, description: `Make sure ${partnerName} knows exactly how amazing ${partnerName} looks.` }
            ],
            'The Autumn': [
                { id: 'a1', type: 'logistical', text: `Snacks for ${partnerName}`, description: `Stock up on ${partnerName}'s favorite snacks before the energy dip.` },
                { id: 'a2', type: 'physical', text: `Treat ${partnerName}'s Feet`, description: `Help ${partnerName} ground and relax before sleep.` },
                { id: 'a3', type: 'emotional', text: `Patience for ${partnerName}`, description: `Provide a steady, grounding presence as ${partnerName}'s energy shifts.` }
            ]
        }
        return fallbacks[phase] || fallbacks['The Autumn']
    }
}
