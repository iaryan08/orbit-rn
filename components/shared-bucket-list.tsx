'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Check, Sparkles, Target, Trophy, Lock, Unlock } from 'lucide-react'
import { cn, normalizeDate } from '@/lib/utils'
import { addBucketItem, toggleBucketItem, deleteBucketItem } from '@/lib/client/bucket'
import { useToast } from '@/hooks/use-toast'
import { useSearchParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function SharedBucketList({ initialItems = [] }: { initialItems: any[] }) {
    const [items, setItems] = useState<any[]>(initialItems)
    const [newItemTitle, setNewItemTitle] = useState('')
    const [isPrivate, setIsPrivate] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const { toast } = useToast()
    const inputRef = useRef<HTMLInputElement>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [itemToDelete, setItemToDelete] = useState<string | null>(null)
    const searchParams = useSearchParams()
    const processingIds = useRef(new Set<string>())

    // Sync with server state
    useEffect(() => {
        setItems(prev => {
            // Keep optimistic items that aren't yet in the server list
            const optimisticItems = prev.filter(item =>
                item.id.startsWith('optimistic-') &&
                !initialItems.some(i => i.title === item.title && !i.is_private === !item.is_private)
            )

            // Merge server items with any currently processing items to avoid UI jumps
            const mergedItems = initialItems.map(serverItem => {
                if (processingIds.current.has(serverItem.id)) {
                    const local = prev.find(i => i.id === serverItem.id)
                    return local || serverItem
                }
                return serverItem
            })

            return [...optimisticItems, ...mergedItems]
        })
    }, [initialItems])

    useEffect(() => {
        const bucketItemId = searchParams.get('bucketItemId')
        if (!bucketItemId) return
        const exists = items.some((item) => item.id === bucketItemId)
        if (!exists) return

        setSelectedItemId(bucketItemId)
        const el = document.getElementById(`bucket-item-${bucketItemId}`)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [searchParams, items])

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newItemTitle.trim()) return

        const title = newItemTitle.trim()
        const wasPrivate = isPrivate
        setNewItemTitle('')
        setIsAdding(true)

        // Optimistic Add
        const optimItem = {
            id: 'optimistic-' + Date.now(),
            title: title,
            is_completed: false,
            is_private: wasPrivate,
            created_at: new Date().toISOString()
        }
        setItems(prev => [optimItem, ...prev])

        const res = await addBucketItem(title, '', wasPrivate)

        setIsAdding(false)
        if (res.error) {
            toast({ title: "Failed to add dream", variant: "destructive" })
            setItems(initialItems)
        } else {
            toast({ title: wasPrivate ? "Private Dream Added! 🔒" : "Dream Added! 🚀", variant: "success" })
        }
    }

    const handleToggle = async (id: string, currentStatus: boolean) => {
        if (id.startsWith('optimistic-')) return
        const newStatus = !currentStatus
        processingIds.current.add(id)
        setItems(prev => prev.map(i => i.id === id ? { ...i, is_completed: newStatus, completed_at: newStatus ? new Date().toISOString() : null } : i))
        const res = await toggleBucketItem(id, newStatus)
        setTimeout(() => { processingIds.current.delete(id) }, 2000)
        if (res.error) toast({ title: "Failed to update item", variant: "destructive" })
    }

    const handleDelete = async (id: string) => {
        if (id.startsWith('optimistic-')) return
        processingIds.current.add(id)
        if (selectedItemId === id) setSelectedItemId(null)
        setItems(prev => prev.filter(i => i.id !== id))
        const res = await deleteBucketItem(id)
        setTimeout(() => { processingIds.current.delete(id) }, 2000)
        if (res.error) toast({ title: "Failed to remove item", variant: "destructive" })
    }

    const sortedItems = [...items].sort((a, b) => {
        if (a.is_completed === b.is_completed) {
            const dateA = normalizeDate(a.created_at).getTime()
            const dateB = normalizeDate(b.created_at).getTime()
            return dateB - dateA
        }
        return a.is_completed ? 1 : -1
    })

    const completedCount = items.filter(i => i.is_completed).length
    const totalCount = items.length
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount) * 100
    const [showAll, setShowAll] = useState(false)
    const displayItems = showAll ? sortedItems : sortedItems.slice(0, 15)

    return (
        <Card className="glass-card border-[1px] border-dashed border-rose-950/50 overflow-hidden relative group rounded-2xl">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />

            <CardHeader className="pt-6 pb-5 px-6 relative z-10">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-xl font-serif tracking-tight text-white flex items-center gap-3">
                            <Target className="h-5 w-5 text-rose-400" />
                            Our Bucket List
                        </CardTitle>
                        <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-black">
                            Dreams we'll chase together
                        </p>
                    </div>

                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            <path className="text-rose-500" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${progress}, 100`} style={{ filter: 'drop-shadow(0 0 5px rgba(244, 63, 94, 0.6))', transition: 'stroke-dasharray 0.5s ease' }} />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                            <span className="text-xs font-bold text-white leading-none">{completedCount}</span>
                            <div className="h-[1px] w-3 bg-white/20 my-0.5" />
                            <span className="text-[8px] font-bold text-white/30">{totalCount}</span>
                        </div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-6 px-4 sm:px-6 relative z-10">
                <form onSubmit={handleAdd} className="relative group/input">
                    <button
                        type="button"
                        onClick={() => setIsPrivate(!isPrivate)}
                        className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors z-20",
                            isPrivate ? "text-amber-400 bg-amber-400/10" : "text-white/20 hover:text-white/40"
                        )}
                        title={isPrivate ? "Private dream (Only you can see)" : "Shared dream (Partner can see)"}
                    >
                        {isPrivate ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder={isPrivate ? "Add a private dream..." : "Add a new shared dream..."}
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pl-12 pr-12 text-sm text-white focus:outline-none focus:bg-white/10 focus:border-rose-500/40 transition-[background-color,border-color] placeholder:text-white/30"
                    />
                    <button
                        type="submit"
                        disabled={!newItemTitle.trim() || isAdding}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-xl bg-rose-500/30 text-white opacity-0 group-focus-within/input:opacity-100 hover:bg-rose-500 transition-[opacity,background-color,color] disabled:opacity-0"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </form>

                <div className="flex flex-col gap-3.5 max-h-[450px] overflow-y-auto pr-2 minimal-scrollbar">
                    {sortedItems.length === 0 ? (
                        <div className="text-center py-10 text-rose-100/20 text-[10px] uppercase font-bold tracking-[0.2em]">No dreams yet. <br /> Start dreaming big!</div>
                    ) : (
                        <>
                            {displayItems.map((item) => (
                                <div
                                    key={item.id}
                                    id={`bucket-item-${item.id}`}
                                    className={cn(
                                        "group flex items-center gap-3 p-3.5 rounded-2xl border transition-[background-color,border-color,opacity,shadow,transform] duration-300 cursor-pointer active:scale-[0.99]",
                                        item.is_completed
                                            ? "bg-rose-500/5 border-rose-500/10 opacity-60"
                                            : item.id === selectedItemId
                                                ? "bg-white/5 border-rose-500/20 shadow-lg"
                                                : "bg-transparent border-white/5 hover:border-rose-500/20 shadow-sm"
                                    )}
                                    onClick={() => setSelectedItemId(prev => prev === item.id ? null : item.id)}
                                >
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggle(item.id, item.is_completed); }}
                                        className={cn(
                                            "w-6 h-6 rounded-full border flex items-center justify-center transition-[background-color,border-color,box-shadow,color] duration-300 flex-shrink-0",
                                            item.is_completed
                                                ? "bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]"
                                                : "border-white/20 text-transparent hover:border-rose-400/50"
                                        )}
                                    >
                                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                    </button>

                                    <span className={cn(
                                        "flex-1 text-sm font-medium transition-[color,text-decoration-color] duration-300 flex items-center gap-2",
                                        item.is_completed
                                            ? "text-rose-100/40 line-through decoration-rose-500/40 decoration-2"
                                            : "text-white"
                                    )}>
                                        {item.title}
                                        {item.is_private && <Lock className="w-3 h-3 text-amber-400/50" />}
                                    </span>

                                    {item.is_completed && <Trophy className="w-4 h-4 text-amber-400/50 animate-pulse" />}

                                    <button
                                        onClick={(e) => {
                                            if (item.id !== selectedItemId) return;
                                            e.stopPropagation();
                                            setItemToDelete(item.id);
                                        }}
                                        className={cn(
                                            "p-2 rounded-xl text-rose-100/40 hover:text-red-400 hover:bg-red-500/10 transition-[opacity,transform,color,background-color] ml-1 shrink-0 duration-200",
                                            item.id === selectedItemId ? "opacity-100 scale-100 cursor-pointer" : "opacity-0 scale-90 pointer-events-none"
                                        )}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {sortedItems.length > 15 && (
                                <button onClick={() => setShowAll(!showAll)} className="w-full text-center py-4 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300/40 hover:text-rose-300 transition-colors">
                                    {showAll ? "Collapse List" : `Show all ${sortedItems.length} dreams →`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </CardContent>

            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Dream?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove this item from your shared bucket list. You can always add it back later.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { if (itemToDelete) { handleDelete(itemToDelete); setItemToDelete(null); } }}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
