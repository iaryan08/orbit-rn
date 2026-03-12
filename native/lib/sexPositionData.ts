export interface IntimacyInsight {
    name: string;
    description: string;
    keywords: string[]; // For Unsplash search
    type: 'position' | 'self-love' | 'coaching';
}

export const INTIMACY_INSIGHTS: Record<string, IntimacyInsight[]> = {
    Menstrual: [
        {
            name: "Spoons",
            description: "Deeply intimate and gentle. Perfect for days when you crave closeness without too much physical exertion.",
            keywords: ["gentle embrace", "sleeping couple", "soft intimacy"],
            type: 'position'
        },
        {
            name: "The Gazer",
            description: "Sit face-to-face in a comfortable embrace. This position focuses on eye contact and deep breathing, fostering emotional safety.",
            keywords: ["intimate gaze", "couple sitting", "closeness"],
            type: 'position'
        },
        {
            name: "Body Gratitude",
            description: "Your body is working hard. Spend 5 minutes today simply noticing the strength and resilience of your physical self. Self-love starts with acceptance.",
            keywords: ["body positive", "self care woman", "gratitude"],
            type: 'self-love'
        },
        {
            name: "Gentle Communication",
            description: "Managing your sexual life means knowing when to rest. Talk to your partner about how physical closeness can manifest as simple comfort right now.",
            keywords: ["communication", "holding hands", "emotional support"],
            type: 'coaching'
        }
    ],
    Follicular: [
        {
            name: "The Bridge",
            description: "Active and playful as your energy starts to rise. Great for experimenting with different depths.",
            keywords: ["playful passion", "sensual movement", "romantic spark"],
            type: 'position'
        },
        {
            name: "Side-by-Side Flex",
            description: "A dynamic position that allows for freedom of movement and varying levels of intensity as your confidence grows.",
            keywords: ["sensual movement", "couple intimacy", "energy"],
            type: 'position'
        },
        {
            name: "Mirror Affirmation",
            description: "Stand before a mirror and find three things you love about your reflection. Your confidence is blooming; let your self-love bloom with it.",
            keywords: ["confidence mirror", "smiling woman", "self love"],
            type: 'self-love'
        },
        {
            name: "New Energy",
            description: "As your drive returns, use this time to explore what feels new. Improving your sexual life involves staying curious about your evolving desires.",
            keywords: ["curiosity", "spark", "new beginnings"],
            type: 'coaching'
        }
    ],
    Ovulatory: [
        {
            name: "The Chandelier",
            description: "High energy and adventurous for your peak drive. Don't be afraid to be bold.",
            keywords: ["passionate embrace", "intense attraction", "sensual heat"],
            type: 'position'
        },
        {
            name: "The Throne",
            description: "An empowering position that allows for deep connection and eye contact during your most magnetic window.",
            keywords: ["passion", "intimacy couple", "connection"],
            type: 'position'
        },
        {
            name: "Radiant Presence",
            description: "You are at your peak radiance. Embrace the magnetic energy you feel. Your body is a vessel of power and creation.",
            keywords: ["radiant woman", "inner power", "sunlight beauty"],
            type: 'self-love'
        },
        {
            name: "Peak Connection",
            description: "This is the ideal time for deep physical exploration. Share your boldest desires with your partner to strengthen your sexual bond.",
            keywords: ["deep connection", "intense romance", "passion"],
            type: 'coaching'
        }
    ],
    Luteal: [
        {
            name: "Modified Missionary",
            description: "Familiar and comforting. Use pillows for extra support to keep things relaxed.",
            keywords: ["romantic intimacy", "tender touch", "loving connection"],
            type: 'position'
        },
        {
            name: "The Nest",
            description: "Focus on skin-to-skin contact in a protective, comforting embrace. Ideal for when you want to feel safe and held.",
            keywords: ["cuddling couple", "safety", "tender embrace"],
            type: 'position'
        },
        {
            name: "Soft Acceptance",
            description: "If you feel sensitive or bloated, remember that beauty exists in all states. Be soft with yourself. Your worth is not tied to your cycle day.",
            keywords: ["soft light", "gentle self care", "body kindness"],
            type: 'self-love'
        },
        {
            name: "Nurturing Intimacy",
            description: "When drive dips, focus on 'outercourse' and sensual touch. Managing your sexual life is about honoring your rhythm without pressure.",
            keywords: ["nurturing touch", "gentle massage", "caring couple"],
            type: 'coaching'
        }
    ]

};

