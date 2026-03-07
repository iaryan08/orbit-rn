'use client'

import { useEffect, useState } from 'react'
import { getDailyInsights } from '@/lib/client/insights'
import { Loader2, AlertCircle, X, RefreshCcw, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"

interface Insight {
    category: string
    title: string
    content: string
    image_url: string
    source: string
}

const ResponsiveImage = ({ src, alt, fill, className, sizes }: { src: string, alt: string, fill?: boolean, className?: string, sizes?: string }) => {
    const isSpecialId = ["1", "2", "3", "4"].includes(src)

    if (isSpecialId) {
        return (
            <>
                <div className={cn("md:hidden absolute inset-0", className)}>
                    <Image
                        src={`/images/${src}-m.jpg`}
                        alt={alt}
                        fill={fill}
                        sizes={sizes || "(max-width: 768px) 100vw, 33vw"}
                        className="object-cover"
                    />
                </div>
                <div className={cn("hidden md:block absolute inset-0", className)}>
                    <Image
                        src={`/images/${src}.jpg`}
                        alt={alt}
                        fill={fill}
                        sizes={sizes || "(max-width: 768px) 100vw, 33vw"}
                        className="object-cover"
                    />
                </div>
            </>
        )
    }

    return (
        <Image
            src={src}
            alt={alt}
            fill={fill}
            sizes={sizes || "(max-width: 768px) 100vw, 33vw"}
            className={className}
        />
    )
}

export function LunaraTabInsights({ coupleId }: { coupleId: string }) {
    const [insights, setInsights] = useState<Insight[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null)

    const fetchInsights = async (force: boolean = false) => {
        try {
            const result = await getDailyInsights(coupleId, force)
            if (result.success && result.data) {
                setInsights(result.data as Insight[])
            }
        } catch (error) {
            console.error("Failed to fetch insights", error)
        } finally {
            setLoading(false)
            setSyncing(false)
        }
    }

    useEffect(() => {
        if (!coupleId) return
        const timer = setTimeout(() => {
            fetchInsights(false)
        }, 800)
        return () => clearTimeout(timer)
    }, [coupleId])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const onDeltaRefresh = () => {
            setSyncing(true)
            fetchInsights(true)
        }
        window.addEventListener('orbit:insights-delta-refresh', onDeltaRefresh)
        return () => window.removeEventListener('orbit:insights-delta-refresh', onDeltaRefresh)
    }, [coupleId])

    const handleManualSync = () => {
        setSyncing(true)
        fetchInsights(true)
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6">
                <div className="relative">
                    <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                    <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-purple-300 animate-pulse" />
                </div>
                <p className="text-purple-200/40 uppercase tracking-[0.3em] text-[10px] font-black">Curating Discovery...</p>
            </div>
        )
    }

    if (insights.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] glass-card border-dashed border-white/5 rounded-2xl">
                <AlertCircle className="w-10 h-10 text-white/10 mb-6" />
                <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">No discovery content today.</p>
            </div>
        )
    }

    const categories = [
        { id: "Just For You", label: "Just For You" },
        { id: "Sex Tips", label: "Intimacy" },
        { id: "Reproductive Health", label: "Cycle Health" },
        { id: "Orgasm & Pleasure", label: "Pleasure" },
        { id: "Latest News", label: "Latest News" },
        { id: "Common Worries", label: "Inner Peace" },
        { id: "Safe Sex", label: "Connection" },
        { id: "Let's Talk", label: "Dialogue" },
    ]

    return (
        <div className="space-y-12 pb-24">
            <div className="flex items-center justify-between px-2 mb-4 md:mb-0">
                <div className="space-y-1 hidden md:block">
                    <h2 className="text-3xl md:text-[40px] font-serif font-light text-white tracking-wide">Discovery</h2>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualSync}
                    disabled={syncing}
                    className="ml-auto text-purple-200/60 hover:text-white hover:bg-white/5 transition-all gap-2 h-10 px-4 rounded-2xl border border-white/5"
                >
                    <RefreshCcw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                    <span className="hidden md:inline text-[10px] uppercase font-black tracking-widest">{syncing ? "Syncing..." : "Refresh"}</span>
                </Button>
            </div>

            {categories.map((cat, catIdx) => {
                const categoryItems = insights.filter(i => i.category === cat.id)
                if (categoryItems.length === 0) return null

                return (
                    <div key={cat.id} className="space-y-6">
                        <div >
                            <h3 className="text-xl font-bold text-white px-2 tracking-tight">{cat.label}</h3>
                        </div>

                        <div className="flex overflow-x-auto gap-0 md:gap-6 pb-6 px-2 snap-x snap-mandatory scrollbar-hide -mx-6 md:mx-0 md:px-0 px-8">
                            {categoryItems.map((insight, idx) => (
                                <div
                                    key={`${cat.id}-${idx}`}
                                    className="min-w-[280px] w-[280px] h-[360px] relative rounded-none md:rounded-2xl overflow-hidden snap-center cursor-pointer group flex-shrink-0 bg-black/20 border border-white/5 shadow-xl hover:border-purple-500/30 hover:-translate-y-1 transition-all duration-300"
                                    onClick={() => setSelectedInsight(insight)}
                                >
                                    <ResponsiveImage
                                        src={insight.image_url}
                                        alt={insight.title}
                                        fill
                                        className="object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                                    <div className="absolute top-6 left-6">
                                        <span className="px-3 py-1.5 rounded-xl bg-black/60 text-[8px] uppercase font-black tracking-widest text-white/50 border border-white/5">
                                            {insight.source}
                                        </span>
                                    </div>

                                    <div className="absolute bottom-0 left-0 w-full p-8">
                                        <p className="text-xl font-bold text-white leading-snug tracking-tight">
                                            {insight.title}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}

            <Drawer open={!!selectedInsight} onOpenChange={(open) => !open && setSelectedInsight(null)} duration={250}>
                <DrawerContent className="bg-zinc-950 border-white/5 text-white h-[90vh] rounded-t-[3rem] focus:outline-none">
                    <div className="relative h-full overflow-y-auto minimal-scrollbar">
                        <div className="absolute top-6 right-6 z-50">
                            <DrawerClose asChild>
                                <Button size="icon" variant="ghost" className="rounded-2xl bg-black/40 text-white hover:bg-black/60 border border-white/5">
                                    <X className="w-5 h-5" />
                                </Button>
                            </DrawerClose>
                        </div>

                        {selectedInsight && (
                            <>
                                <div className="relative h-80 w-full shrink-0">
                                    <ResponsiveImage
                                        src={selectedInsight.image_url}
                                        alt={selectedInsight.title}
                                        fill
                                        className="object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                                    <div className="absolute bottom-10 left-8 right-8">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-[10px] uppercase font-black tracking-widest text-purple-200 border border-purple-500/20">
                                                {selectedInsight.category}
                                            </span>
                                            <span className="px-3 py-1.5 rounded-xl bg-white/5 text-[10px] uppercase font-black tracking-widest text-white/40 border border-white/5">
                                                From {selectedInsight.source}
                                            </span>
                                        </div>
                                        <DrawerTitle className="text-4xl md:text-5xl font-serif font-bold leading-tight tracking-tight">
                                            {selectedInsight.title}
                                        </DrawerTitle>
                                    </div>
                                </div>
                                <div className="p-10 md:p-14 max-w-3xl mx-auto space-y-10">
                                    <DrawerDescription className="text-xl text-zinc-300 leading-relaxed font-light">
                                        {selectedInsight.content}
                                    </DrawerDescription>

                                </div>
                            </>
                        )}
                    </div>
                </DrawerContent>
            </Drawer>
        </div>
    )
}

