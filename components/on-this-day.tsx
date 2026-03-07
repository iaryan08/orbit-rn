'use client'
import { cn, normalizeDate } from "@/lib/utils"
import { useOrbitStore } from "@/lib/store/global-store"
import { useToast } from "@/hooks/use-toast"
import { deleteMemory as deleteMemoryApi } from "@/lib/client/memories"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Heart, MapPin, Sparkles, Flame } from "lucide-react"
import { format } from "date-fns"
import Image from "next/image"
import { useState, useCallback, useRef } from "react"
import Link from "next/link"
import { MemoryDetailDialog } from "./memory-detail-dialog"
import { DecryptedImage } from "./e2ee/decrypted-image"

interface Memory {
    id: string
    type: 'memory'
    title: string
    description: string
    image_urls: string[]
    location: string | null
    memory_date: string
    is_encrypted?: boolean
    iv?: string
}

interface Milestone {
    id: string
    type: 'milestone'
    category: string
    milestone_date: string
    content_user1: string | null
    content_user2: string | null
}

// Map category slugs to readable titles and styles
const CATEGORY_CONFIG: Record<string, { label: string, emoji: string, color: string, gradient: string, text: string }> = {
    first_talk: {
        label: "First Talk",
        emoji: "💬",
        color: "text-cyan-200",
        gradient: "from-cyan-900/80 via-blue-900/50 to-black/80",
        text: "The moment words started our story"
    },
    first_hug: {
        label: "First Hug",
        emoji: "🫂",
        color: "text-amber-200",
        gradient: "from-orange-900/80 via-amber-900/50 to-black/80",
        text: "The warmth that felt like home"
    },
    first_kiss: {
        label: "First Kiss",
        emoji: "😘",
        color: "text-rose-200",
        gradient: "from-rose-900/80 via-pink-900/50 to-black/80",
        text: "A spark that set souls on fire"
    },
    first_french_kiss: {
        label: "First French Kiss",
        emoji: "💋",
        color: "text-red-200",
        gradient: "from-red-900/80 via-rose-900/50 to-black/80",
        text: "Passion ignited, drifting away"
    },
    first_sex: {
        label: "First Intimacy",
        emoji: "💞",
        color: "text-fuchsia-200",
        gradient: "from-fuchsia-900/80 via-purple-900/50 to-black/80",
        text: "Two bodies, one soul, infinite love"
    },
    first_oral: {
        label: "Deep Intimacy",
        emoji: "🌊",
        color: "text-indigo-200",
        gradient: "from-indigo-900/80 via-blue-900/50 to-black/80",
        text: "Exploring the depths of desire"
    },
    first_time_together: {
        label: "First Night Together",
        emoji: "🌙",
        color: "text-amber-100",
        gradient: "from-indigo-900/80 via-violet-900/50 to-black/80",
        text: "Waking up next to you was a dream"
    },
    first_surprise: {
        label: "First Surprise",
        emoji: "🎁",
        color: "text-emerald-200",
        gradient: "from-emerald-900/80 via-teal-900/50 to-black/80",
        text: "Unexpected joy, forever cherished"
    },
    first_memory: {
        label: "First Memory",
        emoji: "",
        color: "text-yellow-200",
        gradient: "from-yellow-700/80 via-amber-900/50 to-black/80",
        text: "where it all began..."
    },
    first_confession: {
        label: "First Confession",
        emoji: "💌",
        color: "text-pink-200",
        gradient: "from-pink-900/80 via-rose-900/50 to-black/80",
        text: "Truth spoken from the heart"
    },
    confession: {
        label: "Confession",
        emoji: "💌",
        color: "text-pink-200",
        gradient: "from-pink-900/80 via-rose-900/50 to-black/80",
        text: "Truth spoken from the heart"
    },
    first_promise: {
        label: "First Promise",
        emoji: "🤞",
        color: "text-cyan-200",
        gradient: "from-cyan-900/80 via-teal-900/50 to-black/80",
        text: "A vow kept, a bond strengthened"
    },
    first_night_together: {
        label: "First Night Apart",
        emoji: "🛌",
        color: "text-blue-200",
        gradient: "from-slate-800/80 via-blue-950/50 to-black/80",
        text: "Missing you was the only feeling"
    },
    first_time_alone: {
        label: "First Time Alone",
        emoji: "🤫",
        color: "text-violet-200",
        gradient: "from-violet-900/80 via-purple-900/50 to-black/80",
        text: "Just us, against the world"
    },
    first_movie_date: {
        label: "First Movie Date",
        emoji: "🎬",
        color: "text-orange-200",
        gradient: "from-orange-900/80 via-red-900/50 to-black/80",
        text: "Cinema lights and holding hands"
    },
    first_intimate_moment: {
        label: "First Intimate Moment",
        emoji: "🌹",
        color: "text-rose-200",
        gradient: "from-rose-800/80 via-red-950/50 to-black/80",
        text: "Closer than ever before"
    }
}

export function OnThisDay({ memories, milestones, partnerName = "Partner", daysTogether = 0, coupleId }: { memories: any[], milestones: any[], partnerName?: string, daysTogether?: number, coupleId?: string }) {
    // Combine and normalize items
    const normalizedMemories = memories.map(m => ({ ...m, type: 'memory' as const }))
    const normalizedMilestones = milestones.map(m => ({ ...m, type: 'milestone' as const }))

    // Sort by type? Or random? Mixing them is fine.
    const items = [...normalizedMilestones, ...normalizedMemories]

    const [currentIndex, setCurrentIndex] = useState(0)
    const [selectedMemory, setSelectedMemory] = useState<any | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const isDraggingRef = useRef(false)
    const { toast } = useToast()
    const removeFromStore = useOrbitStore(state => state.deleteMemory)

    const handleItemDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this memory?")) return;
        const res = await deleteMemoryApi(id);
        if (res.success) {
            removeFromStore(id);
            setIsDetailOpen(false);
            toast({ title: "Memory deleted" });
        } else {
            toast({ title: "Failed to delete", variant: "destructive" });
        }
    }

    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchEnd, setTouchEnd] = useState<number | null>(null)

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null)
        setTouchStart(e.targetTouches[0].clientX)
        isDraggingRef.current = false
    }

    const onTouchMove = (e: React.TouchEvent) => {
        const currentX = e.targetTouches[0].clientX
        setTouchEnd(currentX)
        if (touchStart && Math.abs(touchStart - currentX) > 10) {
            isDraggingRef.current = true
        }
    }

    const onTouchEndEvent = () => {
        setTimeout(() => { isDraggingRef.current = false }, 50)
        if (!touchStart || !touchEnd) return
        const distance = touchStart - touchEnd
        if (distance > 50) {
            nextItem()
        } else if (distance < -50) {
            prevItem()
        }
    }

    // Handle empty items with specialized view
    if (items.length === 0) {
        let emptyMessage = "Orbit established. Capture your first shared moment today."
        if (daysTogether >= 7) emptyMessage = `One week in orbit. Has anything memorable happened with ${partnerName}?`
        if (daysTogether >= 30) emptyMessage = `${daysTogether} days together. Your gallery is waiting for your story.`
        if (daysTogether >= 365) emptyMessage = `Over a year in orbit! Don't let these moments slip away.`

        return (
            <Card className="glass-card on-this-day-card overflow-hidden min-h-[240px] relative group border-white/10 shadow-2xl rounded-3xl flex flex-col items-center justify-center text-center px-6 py-10 bg-black/40">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/20 flex items-center justify-center mb-4 relative z-10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                    <Sparkles className="w-6 h-6 text-amber-300" />
                </div>
                <h3 className="text-xl font-serif text-white mb-2 relative z-10 tracking-tight">Daily Mission</h3>
                <p className="text-white/70 text-sm leading-relaxed max-w-[260px] italic relative z-10">
                    "{emptyMessage}"
                </p>
                <div className="absolute top-5 left-6 right-6 flex items-center justify-between pb-2 border-b border-white/5">
                    <CardTitle className="text-xl font-serif text-white/40 flex items-center gap-3 tracking-tight">
                        <Calendar className="h-5 w-5 text-amber-400/40" />
                        On This Day
                    </CardTitle>
                </div>
            </Card>
        )
    }

    const currentItem = items[currentIndex]
    // Get config for milestones, or default
    const config = currentItem.type === 'milestone' ? (CATEGORY_CONFIG[currentItem.category] || {
        label: "Special Moment",
        emoji: "💖",
        color: "text-rose-300",
        gradient: "from-rose-900/40 to-black/60",
        text: "A beautiful memory in our journey"
    }) : null

    const nextItem = () => {
        setCurrentIndex(prev => (prev === items.length - 1 ? 0 : prev + 1))
    }
    const prevItem = () => {
        setCurrentIndex(prev => (prev === 0 ? items.length - 1 : prev - 1))
    }

    const handleItemClick = () => {
        if (!isDraggingRef.current && currentItem.type === 'memory') {
            setSelectedMemory(currentItem)
            setIsDetailOpen(true)
        }
    }

    return (
        <Card className="glass-card event-gradient-card on-this-day-card overflow-hidden min-h-[320px] relative group border-white/5 shadow-2xl rounded-3xl">
            {/* Sliding Layer (Lightweight fast swap) */}
            <div
                className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-pan-y"
                onTouchStart={items.length > 1 ? onTouchStart : undefined}
                onTouchMove={items.length > 1 ? onTouchMove : undefined}
                onTouchEnd={items.length > 1 ? onTouchEndEvent : undefined}
            >
                {currentItem.type === 'memory' ? (
                    // MEMORY CARD VIEW
                    <div
                        className="w-full h-full relative cursor-pointer group/item pointer-events-auto"
                        onClick={handleItemClick}
                    >
                        <DecryptedImage
                            src={currentItem.image_urls[0] || "/placeholder.svg"}
                            alt={currentItem.title}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover/item:scale-110"
                            draggable={false}
                            priority={currentIndex === 0}
                            isEncrypted={currentItem.is_encrypted}
                            iv={currentItem.iv}
                            prefix={coupleId}
                        />
                        {/* Gradients to ensure text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-black/60 group-hover/item:bg-black/60 transition-[background-color] duration-500" />

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <div className="px-4 py-2 rounded-full bg-black/80 border border-white/20 text-white text-[10px] font-bold uppercase tracking-widest shadow-xl">
                                View Story
                            </div>
                        </div>

                        <div className="absolute bottom-6 left-14 right-14 pointer-events-none">
                            <h3 className="text-xl font-bold text-white leading-tight drop-shadow-md">{currentItem.title}</h3>
                            <div className="flex items-center gap-3 mt-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-white/70 overflow-hidden">
                                <span className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                                    <Calendar className="h-3 w-3 text-white/40" />
                                    {currentItem.memory_date ? (() => {
                                        try {
                                            return format(normalizeDate(currentItem.memory_date + "T12:00:00"), "MMM d, yyyy");
                                        } catch { return ""; }
                                    })() : ""}
                                </span>
                                {currentItem.location && (
                                    <span className="flex items-center gap-1 text-white/50 whitespace-nowrap overflow-hidden text-ellipsis">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        {currentItem.location}
                                    </span>
                                )}
                            </div>
                            {currentItem.description && (
                                <p className="text-xs text-white/80 mt-2.5 line-clamp-2 italic drop-shadow-sm">
                                    "{currentItem.description}"
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    // MILESTONE CARD VIEW
                    <div className={`w-full h-full relative flex flex-col items-center justify-center px-14 py-8 text-center bg-gradient-to-br ${config?.gradient}`}>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />

                        <div className="relative z-10 space-y-3 select-none mt-4 max-w-[280px]">
                            <div className={cn("mx-auto select-none pt-2", config?.color, "text-5xl")}>
                                {config?.emoji}
                            </div>

                            <div className="space-y-1.5 pt-1">
                                <h3 className={`text-xl md:text-2xl font-serif font-bold text-white leading-tight ${config?.color} drop-shadow-sm`}>
                                    {config?.label}
                                </h3>
                                <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed">
                                    {config?.text}
                                </p>
                                {/* Personalized date context for dual-date milestones */}
                                {currentItem.isOwnDate !== undefined && (
                                    <p className="text-xs text-amber-200/80 font-medium mt-2">
                                        {currentItem.category === 'first_kiss' && (
                                            currentItem.isOwnDate ? `You kissed ${partnerName}` : `${partnerName} kissed you`
                                        )}
                                        {currentItem.category === 'first_surprise' && (
                                            currentItem.isOwnDate ? "You received this surprise" : `You surprised ${partnerName}`
                                        )}
                                        {currentItem.category === 'first_memory' && (
                                            currentItem.isOwnDate ? " Your special memory" : ` ${partnerName}'s special memory`
                                        )}
                                    </p>
                                )}
                            </div>

                            <div className="pt-2 flex flex-col items-center gap-2">
                                <span className="px-3 py-1 rounded-full bg-black/60 border border-amber-500/30 text-[10px] uppercase font-bold text-amber-200/90 tracking-widest shadow-2xl">
                                    {format(normalizeDate(currentItem.milestone_date + "T12:00:00"), "MMMM do, yyyy")}
                                </span>
                            </div>

                            <div className="pointer-events-auto pt-2">
                                <Link
                                    href={`/intimacy?q=${currentItem.category}`}
                                    className="inline-flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors mt-2"
                                >
                                    <Sparkles className="w-3 h-3" />
                                    Relive This Memory
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Static Header Layered Over Content */}
            <CardHeader className="absolute top-0 left-0 right-0 z-20 pb-2 pt-6 px-6 pointer-events-none border-none">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-serif text-white flex items-center gap-3 drop-shadow-xl tracking-tight">
                        <Calendar className="h-5 w-5 text-amber-200" />
                        On This Day
                    </CardTitle>
                    <div className="px-2.5 py-1 rounded-full bg-black/80 border border-white/20 text-[10px] uppercase tracking-widest text-white font-bold shadow-2xl">
                        {currentIndex + 1} / {items.length}
                    </div>
                </div>
            </CardHeader>

            {/* Navigation Buttons Layered Over */}
            {items.length > 1 && (
                <>
                    <div className="hidden md:flex absolute top-1/2 left-3 -translate-y-1/2 z-20">
                        <button
                            onClick={prevItem}
                            className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/90 transition-[color,background-color] cursor-pointer border border-white/20 shadow-xl"
                        >
                            <Heart className="h-4 w-4 -rotate-90" />
                        </button>
                    </div>
                    <div className="hidden md:flex absolute top-1/2 right-3 -translate-y-1/2 z-20">
                        <button
                            onClick={nextItem}
                            className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/90 transition-[color,background-color] cursor-pointer border border-white/20 shadow-xl"
                        >
                            <Heart className="h-4 w-4 rotate-90" />
                        </button>
                    </div>
                </>
            )}

            <MemoryDetailDialog
                isOpen={isDetailOpen}
                memory={selectedMemory}
                onClose={() => setIsDetailOpen(false)}
                onDelete={handleItemDelete}
            />
        </Card>
    )
}
