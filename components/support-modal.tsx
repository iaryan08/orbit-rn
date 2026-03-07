'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
    Heart,
    Sparkles,
    MessageSquare,
    Coffee,
    Utensils,
    Check,
    Loader2,
    X,
    ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { logSupportAction } from '@/lib/client/auth'
import { cn } from '@/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { useViewport } from "@/contexts/viewport-context"

import { fetchSupportSuggestions, type SupportSuggestion } from '@/lib/client/ai-support'

interface SupportModalProps {
    isOpen: boolean
    onClose: () => void
    phase: string
    day: number
    partnerName: string
    partnerAvatar?: string
    partnerId: string
}


export function SupportModal({ isOpen, onClose, phase, day, partnerName, partnerAvatar, partnerId }: SupportModalProps) {
    const [suggestions, setSuggestions] = useState<SupportSuggestion[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [customAction, setCustomAction] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSynced, setIsSynced] = useState(false)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const { isKeyboardVisible: isTyping } = useViewport()
    const scrollRef = useRef<HTMLDivElement>(null)
    const { toast } = useToast()


    const scrollToBottom = () => {
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                })
            }
        }, 300) // Delay to let keyboard transition finish
    }

    useEffect(() => {
        if (isOpen) {
            fetchSuggestions()
        }
    }, [isOpen, phase, day, partnerName])

    const fetchSuggestions = async () => {
        setLoading(true)
        const aiTips = await fetchSupportSuggestions(partnerId, partnerName, phase, day)
        setSuggestions(aiTips)
        setLoading(false)
    }

    const handleLog = async () => {
        let actionText = ''
        let category = 'emotional'

        if (selectedId) {
            const suggestion = suggestions.find(s => s.id === selectedId)
            actionText = suggestion?.text || ''
            category = suggestion?.type || 'emotional'
        } else if (customAction) {
            actionText = customAction
            category = 'emotional'
        } else {
            console.log("[SupportModal] No action selected or entered.")
            return
        }

        console.log("[SupportModal] Attempting to log action:", { partnerId, actionText, category })

        if (!partnerId) {
            console.error("[SupportModal] Missing partnerId. Aborting save.")
            toast({
                title: "Partner not identified",
                variant: "destructive"
            })
            return
        }

        setIsSubmitting(true)
        const result = await logSupportAction(partnerId, actionText, category)
        setIsSubmitting(false)

        if (result.success) {
            setIsSynced(true)
            setTimeout(() => {
                setIsSynced(false)
                onClose()
            }, 1000)
        } else {
            toast({
                title: "Failed to log action",
                variant: "destructive"
            })
        }
    }

    const typeIcons = {
        physical: Coffee,
        emotional: MessageSquare,
        logistical: Utensils,
        surprise: Sparkles
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                className={cn(
                    "max-w-[420px] w-[92vw] p-0 overflow-hidden border-white/5 bg-neutral-950/40 backdrop-blur-3xl rounded-3xl shadow-[0_48px_100px_-20px_rgba(0,0,0,0.8)] flex flex-col transition-all duration-300",
                    isTyping ? "shadow-[0_0_120px_-20px_rgba(150,0,255,0.2)]" : ""
                )}
                style={{
                    height: 'calc(var(--app-height, 100vh) * 0.9)',
                    maxHeight: 'calc(var(--app-height, 100vh) * 0.9)'
                }}
            >
                <DialogHeader className="p-6 pb-3 bg-black/10 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-full border border-purple-500/20 overflow-hidden bg-white/5">
                                {partnerAvatar ? (
                                    <img src={partnerAvatar} alt={partnerName} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-purple-400 font-serif text-lg">
                                        {partnerName[0]}
                                    </div>
                                )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-purple-600 border-2 border-neutral-950 flex items-center justify-center">
                                <Sparkles className="w-2 h-2 text-white" />
                            </div>
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-xl font-serif text-white truncate">
                                Support {partnerName}
                            </DialogTitle>
                            <DialogDescription className="text-[10px] text-rose-400/60 mt-0.5 uppercase tracking-[0.4em] font-black">
                                {phase}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Sticky Quote / Tip */}
                <div className="px-6 pt-5 pb-0 shrink-0">
                    <p className="text-[12px] text-zinc-300 leading-relaxed font-serif italic border-l border-purple-500/40 pl-4 py-0.5 shadow-sm">
                        "{partnerName} might feel more inward today. Your gentle presence is the greatest gift."
                    </p>
                </div>

                <div
                    ref={scrollRef}
                    className={cn(
                        "px-6 py-5 flex-1 overflow-y-auto minimal-scrollbar scroll-smooth transition-all duration-300",
                        isTyping || isInputFocused ? "pb-[350px] space-y-5" : "space-y-5"
                    )}
                    onTouchMove={() => (document.activeElement as HTMLElement)?.blur()}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <Loader2 className="w-8 h-8 text-purple-500/50 animate-spin" />
                            <p className="text-[9px] uppercase tracking-[0.4em] text-white/20 font-black">Refining suggestions...</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {suggestions.map((suggestion) => {
                                const Icon = typeIcons[suggestion.type]
                                return (
                                    <button
                                        key={suggestion.id}
                                        onClick={() => {
                                            setSelectedId(suggestion.id)
                                            setCustomAction('')
                                        }}
                                        className={cn(
                                            "w-full p-4 rounded-[1.25rem] border transition-all relative overflow-hidden group text-left",
                                            selectedId === suggestion.id
                                                ? "bg-purple-500/[0.08] border-purple-500/40"
                                                : "bg-white/[0.01] border-white/[0.03] hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex gap-3 items-center">
                                            <div className={cn(
                                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                                                selectedId === suggestion.id ? "bg-purple-500 text-white shadow-lg shadow-purple-500/20" : "bg-white/5 text-zinc-500"
                                            )}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className={cn("font-bold tracking-tight text-[13px] truncate", selectedId === suggestion.id ? "text-white" : "text-zinc-300")}>
                                                    {suggestion.text}
                                                </p>
                                                <p className="text-[10px] text-zinc-400 leading-tight truncate opacity-70">
                                                    {suggestion.description}
                                                </p>
                                            </div>
                                            {selectedId === suggestion.id && (
                                                <div className="shrink-0 animate-in fade-in zoom-in">
                                                    <Check className="w-4 h-4 text-purple-400 stroke-[3px]" />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    <div className="space-y-4 px-0.5 pb-2">
                        <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/30 block ml-1">Personal Intent</Label>
                        <Input
                            value={customAction}
                            onChange={(e) => {
                                setCustomAction(e.target.value)
                                setSelectedId(null)
                            }}
                            onFocus={(e) => {
                                setIsInputFocused(true)
                                setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
                            }}
                            onBlur={() => setIsInputFocused(false)}
                            placeholder="Write something heartfelt..."
                            className="h-10 bg-white/[0.01] border-white/10 rounded-lg text-white placeholder:text-white/30 px-4 focus:border-purple-500/40 transition-all text-[12px] focus:bg-white/[0.03]"
                            activeBorderClassName="bg-gradient-to-r from-purple-500 to-indigo-500"
                        />
                    </div>
                </div>

                <div className="p-6 pt-3 bg-black/20 border-t border-white/5 shrink-0">
                    <Button
                        disabled={isSubmitting || isSynced || (!selectedId && !customAction)}
                        onClick={handleLog}
                        variant="celestial"
                        className={cn(
                            "w-full h-14 border-none shadow-[0_0_20px_rgba(168,85,247,0.2)]",
                            isSynced && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-none"
                        )}
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isSynced ? (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1">
                                <Check className="w-4 h-4" />
                                HEART SYNCED
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-2.5">
                                <Sparkles className="w-4 h-4 mr-2" />
                                <span>LOG SUPPORT ACTION</span>
                            </div>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog >
    )
}
