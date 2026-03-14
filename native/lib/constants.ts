export type MoodType = 'happy' | 'loved' | 'excited' | 'calm' | 'sad' | 'tired' | 'grateful' | 'flirty' | 'missing you badly' | 'cuddly' | 'romantic' | 'passionate' | 'craving you' | 'playful' | (string & {})

export const MOOD_EMOJIS: Record<string, string> = {
    happy: '😊',
    loved: '🥰',
    excited: '🤩',
    calm: '😌',
    sad: '😢',
    tired: '😴',
    grateful: '🙏',
    flirty: '😉',
    'missing you badly': '🥹',
    cuddly: '🫂',
    romantic: '🌹',
    passionate: '❤️‍🔥',
    'craving you': '🔥',
    playful: '😈'
}

// Adapted from root lib/constants.ts Tailwind classes to Hex/RGBA for Native
export const MOOD_COLORS: Record<string, { bg: string, border: string, text: string }> = {
    happy: { bg: '#FEF9C3', border: '#FDE047', text: '#854D0E' },
    loved: { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D' },
    excited: { bg: '#FFEDD5', border: '#FDBA8C', text: '#9A3412' },
    calm: { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' },
    sad: { bg: '#F1F5F9', border: '#CBD5E1', text: '#1E293B' },
    tired: { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
    grateful: { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' },
    flirty: { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D' },
    'missing you badly': { bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8' },
    cuddly: { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D' },
    romantic: { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' },
    passionate: { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' },
    'craving you': { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' },
    playful: { bg: '#F3E8FF', border: '#D8B4FE', text: '#6B21A8' },
}
