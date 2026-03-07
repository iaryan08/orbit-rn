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

export const MOOD_COLORS: Record<string, string> = {
    happy: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    loved: 'bg-pink-100 border-pink-300 text-pink-800',
    excited: 'bg-orange-100 border-orange-300 text-orange-800',
    calm: 'bg-blue-100 border-blue-300 text-blue-800',
    sad: 'bg-slate-100 border-slate-300 text-slate-800',
    tired: 'bg-gray-100 border-gray-300 text-gray-800',
    grateful: 'bg-green-100 border-green-300 text-green-800',
    flirty: 'bg-pink-100 border-pink-300 text-pink-800',
    'missing you badly': 'bg-purple-100 border-purple-300 text-purple-800',
    cuddly: 'bg-pink-100 border-pink-300 text-pink-800',
    romantic: 'bg-red-100 border-red-300 text-red-800',
    passionate: 'bg-red-100 border-red-300 text-red-800',
    'craving you': 'bg-red-100 border-red-300 text-red-800',
    playful: 'bg-purple-100 border-purple-300 text-purple-800',
}
