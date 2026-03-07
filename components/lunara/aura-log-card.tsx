'use client'

import React from 'react'
import { Activity, Loader2, Check, Plus, Bell, Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { logSymptoms } from '@/lib/client/auth'
import { useToast } from '@/hooks/use-toast'

interface AuraLogCardProps {
    isEditable: boolean
    isFemale: boolean // Still needed for specific cycle-based suggestions
    title?: string
    subtitle?: string
    initialSymptoms: string[]
    currentDay?: number | null
}

export function AuraLogCard({
    isEditable,
    isFemale,
    title,
    subtitle,
    initialSymptoms,
    currentDay,
}: AuraLogCardProps) {
    const [selectedSymptoms, setSelectedSymptoms] = React.useState<string[]>(initialSymptoms)
    const [isSavingSymptoms, setIsSavingSymptoms] = React.useState(false)
    const [syncedFlash, setSyncedFlash] = React.useState(false)
    const [showCustomInput, setShowCustomInput] = React.useState(false)
    const [customValue, setCustomValue] = React.useState('')
    const symptomsSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastLocalUpdateRef = React.useRef<number>(0)
    const { toast } = useToast()

    React.useEffect(() => {
        // Real-time synchronization:
        // 1. Never overwrite if we are currently saving
        // 2. Never overwrite if we just successfully saved locally (give time for prop to catch up)
        const justSaved = Date.now() - lastLocalUpdateRef.current < 4000

        if (!isSavingSymptoms && !syncedFlash && !justSaved) {
            // Only update if the prop is actually different to avoid unnecessary re-renders
            if (JSON.stringify([...initialSymptoms].sort()) !== JSON.stringify([...selectedSymptoms].sort())) {
                setSelectedSymptoms(initialSymptoms)
            }
        }
    }, [initialSymptoms, isSavingSymptoms, syncedFlash])

    React.useEffect(() => {
        return () => {
            if (symptomsSaveTimerRef.current) {
                clearTimeout(symptomsSaveTimerRef.current)
            }
        }
    }, [])

    const queueSymptomsSave = (nextSymptoms: string[]) => {
        if (symptomsSaveTimerRef.current) {
            clearTimeout(symptomsSaveTimerRef.current)
        }
        setIsSavingSymptoms(true)
        symptomsSaveTimerRef.current = setTimeout(async () => {
            try {
                // Ensure unique case-insensitive symptoms before saving
                const uniqueSymptoms = Array.from(new Set(nextSymptoms.map(s => s.trim())))
                const result = await logSymptoms(uniqueSymptoms, { customPrefix: 'is having' })
                if (!result.success) {
                    toast({ title: "Update failed", variant: "destructive" })
                } else {
                    // ONLY set synced flash after we get a success response from the DB
                    setSyncedFlash(true)
                    lastLocalUpdateRef.current = Date.now()
                    setTimeout(() => setSyncedFlash(false), 1500)
                }
            } catch (e) {
                console.error(e)
                toast({ title: "Update failed", variant: "destructive" })
            } finally {
                setIsSavingSymptoms(false)
                symptomsSaveTimerRef.current = null
            }
        }, 900)
    }

    const toggleSymptom = (s: string) => {
        if (!isEditable) return

        // Case-insensitive toggle
        const exists = selectedSymptoms.some(existing => existing.toLowerCase() === s.toLowerCase())
        let newSymptoms: string[]
        if (exists) {
            newSymptoms = selectedSymptoms.filter(existing => existing.toLowerCase() !== s.toLowerCase())
        } else {
            newSymptoms = [...selectedSymptoms, s]
        }

        setSelectedSymptoms(newSymptoms)
        queueSymptomsSave(newSymptoms)
    }

    const handleAddCustomSymptom = () => {
        if (!customValue.trim() || !isEditable) return
        const val = customValue.trim()
        const exists = selectedSymptoms.some(existing => existing.toLowerCase() === val.toLowerCase())
        if (!exists) {
            toggleSymptom(val)
        }
        setCustomValue('')
        setShowCustomInput(false)
    }

    const getSuggestedSymptoms = (day: number) => {
        if (!isFemale) return ["Stressed", "Happy", "Tired", "Energetic", "Calm", "Anxious", "Inspired"]
        if (day <= 5) return ["Cramps", "Fatigue", "Back pain", "Headache", "Mood swings"]
        if (day <= 13) return ["Energetic", "Positive", "Clean skin", "High libido", "Happy"]
        if (day === 14 || day === 15) return ["Ovulation pain", "Bloating", "Tender breasts", "Peak energy"]
        return ["Mood swings", "Cravings", "Bloating", "Anxiety", "Tiredness"]
    }

    const baseSuggestions = getSuggestedSymptoms(currentDay || 1)

    // Create a unique set of symptoms to display (base suggestions + any extras already selected)
    const displaySymptoms: string[] = [...baseSuggestions]

    selectedSymptoms.forEach(s => {
        const alreadyInSuggestions = baseSuggestions.some(suggestion => suggestion.toLowerCase() === s.toLowerCase())
        if (!alreadyInSuggestions) {
            displaySymptoms.push(s)
        }
    })

    const displayTitle = title || (isEditable ? "How are you feeling?" : (isFemale ? "Daily Log" : "Daily Vitality"))
    const displaySubtitle = subtitle || (isFemale ? "CORE VITALITY" : "VITALITY TRACKING")

    return (
        <div className="glass-card lunara-section-card p-6 md:p-10 border-t border-l border-purple-500/5 h-full flex flex-col rounded-3xl transition-all duration-500 relative overflow-hidden group">
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="flex items-center justify-between gap-6 mb-8">
                <div className="space-y-0.5">
                    <h4 className="text-base md:text-lg font-bold text-white tracking-wide">
                        {displayTitle}
                    </h4>
                    {!isEditable && (
                        <p className="text-[10px] text-white/30 uppercase tracking-[0.4em] font-black">
                            {displaySubtitle}
                        </p>
                    )}
                </div>
                <div className={cn(
                    "w-10 h-10 rounded-full border flex flex-shrink-0 items-center justify-center",
                    isEditable ? "bg-purple-500/20 border-purple-500/10" : "bg-purple-500/10 border-purple-500/5"
                )}>
                    <Heart className={cn("w-4 h-4", isEditable ? "text-purple-200" : "text-purple-300 opacity-70")} />
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-6">
                <div className="flex flex-wrap gap-2.5">
                    {displaySymptoms.map(s => {
                        const isSelected = selectedSymptoms.some(existing => existing.toLowerCase() === s.toLowerCase())

                        if (!isEditable && !isSelected) return null

                        return (
                            <motion.button
                                key={s}
                                layout
                                onClick={() => toggleSymptom(s)}
                                disabled={!isEditable}
                                whileHover={isEditable ? { scale: 1.02 } : {}}
                                whileTap={isEditable ? { scale: 0.98 } : {}}
                                className={cn(
                                    "px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 border",
                                    isSelected
                                        ? "bg-purple-500/10 text-purple-100 border-purple-500/40"
                                        : "bg-black/20 border-white/5 text-white/30 hover:border-white/20 hover:bg-white/5",
                                    !isEditable && isSelected && "cursor-default border-purple-500/20 bg-purple-500/5 text-purple-200/90"
                                )}
                            >
                                {s}
                            </motion.button>
                        )
                    })}
                    {(!isEditable && selectedSymptoms.length === 0) && (
                        <div className="w-full py-10 text-center border border-dashed border-white/5 rounded-3xl">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20"> No Symptoms Logged...</p>
                        </div>
                    )}
                </div>

                {isEditable && (
                    <div className="mt-4 pt-6 border-t border-white/5 overflow-hidden">
                        <AnimatePresence mode="wait">
                            {isSavingSymptoms ? (
                                <motion.div
                                    key="syncing"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex items-center gap-2 text-[10px] text-purple-400 uppercase font-black tracking-[0.4em]"
                                >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> SYNCING...
                                </motion.div>
                            ) : syncedFlash ? (
                                <motion.div
                                    key="synced"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex items-center gap-2 text-[10px] text-emerald-400 uppercase font-black tracking-[0.4em]"
                                >
                                    <Check className="w-3.5 h-3.5" /> SYNCED
                                </motion.div>
                            ) : showCustomInput ? (
                                <motion.div
                                    key="input"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="flex items-center gap-3"
                                >
                                    <input
                                        autoFocus
                                        type="text"
                                        value={customValue}
                                        onChange={(e) => setCustomValue(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSymptom()}
                                        className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 text-sm text-white outline-none focus:border-purple-500/40 h-10 transition-all"
                                        placeholder="Enter attribute..."
                                    />
                                    <button
                                        onClick={handleAddCustomSymptom}
                                        className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-500 transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.button
                                    key="add-btn"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    onClick={() => setShowCustomInput(true)}
                                    className="flex items-center gap-2 text-[8px] text-white/40 hover:text-white/70 transition-all uppercase font-black tracking-[0.4em] group"
                                >
                                    <div className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center group-hover:border-white/40 group-hover:scale-110 transition-all">
                                        <Plus className="w-3.5 h-3.5" />
                                    </div>
                                    ADD CUSTOM SYMPTOM
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div >
    )
}
