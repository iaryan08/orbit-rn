'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { submitMood } from '@/lib/client/mood'
import { type MoodType, MOOD_EMOJIS } from '@/lib/constants'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Loader2, Send, Heart, ChevronUp, Plus, Sparkles, Flame } from 'lucide-react'
import { useOrbitStore } from '@/lib/store/global-store'

const MOODS: MoodType[] = ['happy', 'loved', 'excited', 'calm', 'sad', 'tired', 'grateful', 'flirty', 'missing you badly', 'cuddly', 'romantic', 'passionate', 'craving you', 'playful']

interface MoodCheckInProps {
  hasPartner: boolean
  userMoods?: any[]
}

export function MoodCheckIn({ hasPartner, userMoods = [] }: MoodCheckInProps) {
  const latestMood = userMoods[0]
  const [selectedMood, setSelectedMood] = useState<MoodType | null>(null)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customEmoji, setCustomEmoji] = useState('')
  const { toast } = useToast()
  const { upsertMood, profile } = useOrbitStore()

  const hasSharedToday = userMoods.length > 0

  async function handleSubmit() {
    if (!selectedMood && !isCustomMode) return
    if (isCustomMode && (!customLabel || !customEmoji)) {
      toast({ title: 'Emoji & label required', variant: 'failed' })
      return
    }

    const moodToSubmit = isCustomMode ? `CUSTOM:${customEmoji}:${customLabel}` : selectedMood!
    setIsSubmitting(true)

    try {
      const result = await submitMood(moodToSubmit, note)
      setIsSubmitting(false)

      if (result.error) {
        toast({
          title: 'Mood Storage Failed',
          description: result.error,
          variant: 'failed',
        })
      } else {
        if (profile?.id) {
          upsertMood({
            id: result.id || `pending-${Date.now()}`,
            user_id: profile.id,
            mood: moodToSubmit,
            note: note,
            created_at: new Date().toISOString()
          })
        }

        setSubmitted(true)
        setCustomLabel('')
        setCustomEmoji('')
        setIsCustomMode(false)
      }
    } catch (err: any) {
      setIsSubmitting(false)
      toast({
        title: 'Connection Lost',
        description: 'Mood stored locally, but partner update failed. Retrying in background...',
        variant: 'failed',
      })
      // Fallback: Optimistic update even on throw
      if (profile?.id) {
        upsertMood({
          id: `opt-${Date.now()}`,
          user_id: profile.id,
          mood: moodToSubmit,
          note: note,
          created_at: new Date().toISOString()
        })
      }
    }
  }

  const parseMood = (moodStr: string) => {
    if (moodStr?.startsWith('CUSTOM:')) {
      const [, emoji, label] = moodStr.split(':')
      return { emoji, label }
    }
    return { emoji: MOOD_EMOJIS[moodStr as MoodType] || '', label: moodStr }
  }

  const moodComposer = (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
        {MOODS.map((mood) => (
          <button
            key={mood}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMood(mood);
              setIsCustomMode(false);
            }}
            className={cn(
              'flex flex-col items-center gap-1 p-1.5 rounded-xl border border-white/10 transition-all',
              selectedMood === mood && !isCustomMode
                ? 'bg-rose-500/20 border-rose-500'
                : 'bg-white/5 hover:bg-white/10'
            )}
          >
            <span className="text-2xl">{MOOD_EMOJIS[mood]}</span>
            <span className="text-[10px] capitalize text-white w-full truncate text-center font-medium opacity-90">{mood}</span>
          </button>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); setIsCustomMode(true); setSelectedMood(null); }}
          className={cn(
            'flex flex-col items-center gap-1 p-1.5 rounded-xl border border-white/10 transition-all',
            isCustomMode
              ? 'bg-rose-500/20 border-rose-500'
              : 'bg-white/5 hover:bg-white/10'
          )}
        >
          <Plus className="w-5 h-5 mb-1 text-white/40" />
          <span className="text-[10px] capitalize text-white w-full truncate text-center font-medium opacity-90">Custom</span>
        </button>
      </div>

      {isCustomMode && (
        <div className="grid grid-cols-4 gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <input
            type="text"
            placeholder="😊"
            value={customEmoji}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCustomEmoji(e.target.value.split(/(\s+)/)[0])}
            className="col-span-1 h-10 bg-white/5 border border-white/10 rounded-xl text-center text-xl text-white outline-none focus:border-rose-500/40"
            maxLength={2}
          />
          <input
            type="text"
            placeholder="Mood ..."
            value={customLabel}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCustomLabel(e.target.value)}
            className="col-span-3 h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-rose-500/40"
            maxLength={20}
          />
        </div>
      )}

      {(selectedMood || isCustomMode) && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNote(e.target.value)}
            className="resize-none bg-white/5 border-white/10 text-white placeholder:text-white/20"
            rows={2}
          />
          <Button
            onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
            className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Share with Partner
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )

  if (!hasPartner) {
    return (
      <Card className="glass-card h-full min-h-[140px] rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center p-6">
          <Heart className="w-12 h-12 text-rose-500/40 mb-4" />
          <h3 className="text-xl font-serif text-white mb-2 tracking-tight">Connect with Partner</h3>
          <p className="text-sm text-white/50 max-w-xs italic font-serif">
            Connect to start sharing moods and see how they are feeling today.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (submitted || (hasSharedToday && !isExpanded)) {
    const { emoji: moodEmoji, label: moodLabel } = parseMood(submitted ? (isCustomMode ? `CUSTOM:${customEmoji}:${customLabel}` : selectedMood!) : latestMood.mood)

    return (
      <Card
        className="glass-card h-full min-h-[140px] rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden cursor-pointer"
        onClick={() => { setIsExpanded(true); setSubmitted(false); }}
      >
        <CardHeader className="px-6 pt-6 pb-2 border-none">
          <div className="flex items-center justify-between w-full">
            <CardTitle className="text-xl font-serif text-white flex items-center gap-3 tracking-tight">
              <Sparkles className="h-5 w-5 text-amber-300" />
              Current Status
            </CardTitle>
            <span className="text-[8px] font-black text-rose-300/40 uppercase tracking-widest">{hasSharedToday ? 'Shared' : 'Update'}</span>
          </div>
          <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
            Orbit Visibility
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-6 pt-4 relative overflow-hidden h-full flex items-center">
          <div className="flex items-center gap-5 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div className="text-4xl animate-in zoom-in duration-500 relative z-10 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                {moodEmoji}
              </div>
              <div className="absolute -top-1 -right-1">
                <Heart className="w-3.5 h-3.5 text-rose-500/60 fill-rose-500/20" />
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <p className="font-serif italic text-[24px] text-white leading-tight mb-1 capitalize drop-shadow-sm">
                {moodLabel}
              </p>
              {(submitted ? note : latestMood.note) && (
                <p className="text-[12px] text-white/50 italic leading-relaxed line-clamp-2">
                  "{submitted ? note : latestMood.note}"
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        "glass-card h-full rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden transition-all",
        !isExpanded && "cursor-pointer hover:bg-white/5"
      )}
      onClick={() => {
        setIsExpanded(!isExpanded)
      }}
    >
      <CardHeader className="px-6 pt-6 pb-4 border-none">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-serif text-white flex items-center gap-3 tracking-tight">
              <Flame className="h-5 w-5 text-rose-400" />
              Mood Update
            </CardTitle>
            <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
              Update your presence
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="text-white hover:bg-transparent rounded-full w-8 h-8 p-0"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5 opacity-40" /> : <Plus className="w-5 h-5 opacity-40" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className={cn(
        "px-6 pb-6 pt-2 space-y-4 transition-all duration-300 overflow-hidden",
        isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0 p-0"
      )}>
        {moodComposer}
      </CardContent>
    </Card>
  )
}
