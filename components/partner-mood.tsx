'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { getPublicStorageUrl } from '@/lib/storage'
import { MOOD_EMOJIS, type MoodType } from '@/lib/constants'
import { Clock, Heart, Plus, ChevronUp } from 'lucide-react'
import { useOrbitStore } from '@/lib/store/global-store'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface PartnerMoodProps {
  partnerName: string
  partnerAvatar?: string | null
  coupleId?: string | null
  moods: Array<{
    id: string
    mood: MoodType
    note: string | null
    created_at: string
  }>
}

export function PartnerMood({ partnerName: initialPartnerName, partnerAvatar, moods, coupleId }: PartnerMoodProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const getPartnerDisplayName = useOrbitStore(state => state.getPartnerDisplayName)
  const partnerName = getPartnerDisplayName() || initialPartnerName

  useEffect(() => {
    // Redundant sync removed: handled globally by SyncEngine
  }, [coupleId])

  const formatTime = (timeString: string) => {
    const date = new Date(timeString)
    const isUTC = date.getTimezoneOffset() === 0
    if (isUTC) {
      date.setHours(date.getHours() + 5)
      date.setMinutes(date.getMinutes() + 30)
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const parseMood = (moodStr: string) => {
    if (moodStr?.startsWith('CUSTOM:')) {
      const [, emoji, label] = moodStr.split(':')
      return { emoji, label }
    }
    return { emoji: MOOD_EMOJIS[moodStr as MoodType] || '', label: moodStr }
  }

  if (moods.length === 0) {
    return (
      <Card className="glass-card h-full min-h-[140px] rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden">
        <CardHeader className="px-6 pt-6 pb-2 border-none">
          <CardTitle className="text-xl font-serif text-white flex items-center gap-3 tracking-tight">
            <Heart className="h-5 w-5 text-rose-400" />
            {partnerName}&apos;s Status
          </CardTitle>
          <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
            Connection & Vibes
          </p>
        </CardHeader>

        <CardContent className="px-6 pb-6 pt-2 flex flex-col items-center justify-center text-center">
          <Avatar className="w-12 h-12 mb-3 ring-2 ring-white/5">
            <AvatarImage src={partnerAvatar || undefined} />
            <AvatarFallback className="bg-white/5 text-rose-200 text-lg font-serif">
              {partnerName?.charAt(0) || '?'}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm text-white/50 italic font-serif">{"Nothing shared today"}</p>
        </CardContent>
      </Card>
    )
  }

  const latestMood = moods[0]
  const { emoji: moodEmoji, label: moodLabel } = parseMood(latestMood.mood)
  const moodTitle = `${moodLabel || ''}`.trim()

  return (
    <Card
      className={cn(
        "glass-card h-full min-h-[140px] rounded-[1.5rem] border-white/5 flex flex-col p-0 overflow-hidden text-left transition-all duration-300",
        moods.length > 1 && "cursor-pointer hover:bg-white/5"
      )}
      onClick={() => {
        if (moods.length > 1) setIsExpanded(!isExpanded)
      }}
    >
      <CardHeader className="px-6 pt-6 pb-2 border-none">
        <div className="flex items-center justify-between w-full">
          <CardTitle className="text-xl font-serif text-white flex items-center gap-3 tracking-tight">
            <Heart className="h-5 w-5 text-rose-400" />
            {partnerName}&apos;s Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[8px] font-black text-rose-300/40 uppercase tracking-widest" suppressHydrationWarning>
              <Clock className="w-2.5 h-2.5" />
              {formatTime(latestMood.created_at)}
            </div>
            {moods.length > 1 && (
              <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
                {isExpanded ? <ChevronUp className="w-3 h-3 text-white/40" /> : <Plus className="w-3 h-3 text-white/40" />}
              </div>
            )}
          </div>
        </div>
        <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
          Feeling {moodLabel}
        </p>
      </CardHeader>

      <CardContent className="px-6 pb-6 pt-4 relative overflow-hidden flex flex-col transition-all duration-500">
        <div className="flex items-center gap-4 w-full min-w-0">
          <div className="relative shrink-0">
            <Avatar className="w-12 h-12 ring-2 ring-white/5">
              <AvatarImage src={getPublicStorageUrl(partnerAvatar, 'avatars') || undefined} />
              <AvatarFallback className="bg-white/10 text-rose-200 text-sm font-serif">
                {partnerName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 text-lg bg-black/80 rounded-full w-6 h-6 flex items-center justify-center border border-white/10 shadow-lg">
              {moodEmoji}
            </div>
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <p className="font-serif italic text-[24px] text-white leading-tight mb-1 capitalize drop-shadow-sm">
              {moodTitle}
            </p>
            {latestMood.note && (
              <p className={cn(
                "text-[12px] text-white/50 italic leading-relaxed transition-all",
                isExpanded ? "line-clamp-none" : "line-clamp-2"
              )}>
                "{latestMood.note}"
              </p>
            )}
          </div>

          {!isExpanded && moods.length > 1 && (
            <div className="hidden sm:flex flex-col items-end gap-1.5 pl-4 ml-auto shrink-0">
              <div className="flex gap-1 items-center">
                {moods.slice(1, 4).map((m, i) => (
                  <div key={i} className="text-[10px] opacity-30 hover:opacity-100 transition-opacity">
                    {parseMood(m.mood).emoji}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* --- History Section --- */}
        <AnimatePresence>
          {isExpanded && moods.length > 1 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-6 pt-6 border-t border-white/5 space-y-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">Today's History</span>
                <span className="text-[9px] font-medium text-white/10 italic">{moods.length} logs</span>
              </div>
              {moods.slice(1).map((m) => {
                const { emoji: mEmoji, label: mLabel } = parseMood(m.mood)
                return (
                  <div key={m.id || m.created_at} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
                    <span className="text-xl shrink-0">{mEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] font-bold text-white/90 capitalize">{mLabel}</span>
                        <span className="text-[9px] font-mono text-white/20">{formatTime(m.created_at)}</span>
                      </div>
                      {m.note && (
                        <p className="text-[10px] text-white/40 italic leading-relaxed">"{m.note}"</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
