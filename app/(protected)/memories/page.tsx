"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { MemoryDetailDialog } from "@/components/memory-detail-dialog";
import { Camera, Plus, Calendar, MapPin, ImageIcon, Trash2, Edit2, Sparkles, Pin, Volume2, VolumeX, Layers, Maximize2, Shield, Lock, ShieldCheck } from "lucide-react";
import { AddMemoryDialog } from "@/components/dialogs/add-memory-dialog";
// import { createClient } from "@/lib/supabase/client"; // REPLACING WITH FIREBASE
import { markAsViewed } from "@/lib/client/auth";
import { deleteMemory } from "@/lib/client/memories";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import Image from "next/image";
import { motion } from "framer-motion";
import { useAppMode } from "@/components/app-mode-context";
import { getPublicStorageUrl, isVideoUrl } from "@/lib/storage";
import { cn, normalizeDate } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import { useBackHandler } from "@/components/global-back-handler";
import { useOrbitStore } from "@/lib/store/global-store";
import { SoftPageLoader } from "@/components/soft-page-loader";
import { fetchPinnedIds, pinContentItem, subscribeToPins, unpinContentItem, type PinDurationOption } from "@/lib/client/pins";
import { Checkbox } from "@/components/ui/checkbox";
import { DecryptedImage } from "@/components/e2ee/decrypted-image";
import { hasStoredMediaPassphrase } from "@/lib/client/crypto-e2ee";
import { EncryptedLockedCard } from "@/components/e2ee/encrypted-locked-card";
import { SectionHeader } from "@/components/section-header";
import { useMediaWarmup } from "@/lib/client/media-cache/warmup";

interface Memory {
    id: string;
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
    created_at: string;
    user_id: string;
    is_encrypted?: boolean;
    iv?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string | null | undefined): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());



export default function MemoriesPage() {
    return (
        <Suspense fallback={<SoftPageLoader className="pt-24 pb-12" />}>
            <MemoriesContent />
        </Suspense>
    );
}

function MemoriesContent() {
    const { coupleId, mode } = useAppMode();
    const { memories, isInitialized, couple, pinnedMemoryIds, setPinnedIds, memoriesCount } = useOrbitStore();
    const partnerProfile = useOrbitStore(state => state.partnerProfile);
    const hasE2EEKey = useOrbitStore(state => state.hasE2EEKey);
    const profile = useOrbitStore(state => state.profile);
    const loading = !isInitialized;
    const [isAdding, setIsAdding] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
    const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
    const userId = profile?.id;
    const [viewedMemoryIds, setViewedMemoryIds] = useState<Set<string>>(new Set());
    const [renderLimit, setRenderLimit] = useState(Capacitor.isNativePlatform() ? 12 : 36);
    const { toast } = useToast();
    // const supabase = createClient(); // REPLACING WITH FIREBASE
    const searchParams = useSearchParams();
    const [memoryToDelete, setMemoryToDelete] = useState<string | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [activeActionCardId, setActiveActionCardId] = useState<string | null>(null);
    const [pinCandidateMemoryId, setPinCandidateMemoryId] = useState<string | null>(null);
    const [pinForPartner, setPinForPartner] = useState(true);
    const [pinDuration, setPinDuration] = useState<PinDurationOption>("forever");
    const [unmutedVideoId, setUnmutedVideoId] = useState<string | null>(null);
    const [isMobileFabVisible, setIsMobileFabVisible] = useState(true);
    const isNative = Capacitor.isNativePlatform();

    const isSecureMediaRoute = (url: string | null | undefined) => !!url && url.startsWith('/api/media/view');

    const daysTogether = useMemo(() => {
        if (!couple?.created_at) return 0;
        const diffTime = Math.abs(new Date().getTime() - new Date(couple.created_at).getTime());
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }, [couple?.created_at]);

    const getViewedMemoriesKey = (uid: string) => `orbit:viewed_memories:${uid}`;

    const markMemoryViewed = (memoryId: string) => {
        if (!userId) return;
        setViewedMemoryIds(prev => {
            if (prev.has(memoryId)) return prev;
            const next = new Set(prev);
            next.add(memoryId);
            if (typeof window !== 'undefined') {
                localStorage.setItem(
                    getViewedMemoriesKey(userId),
                    JSON.stringify(Array.from(next))
                );
            }
            return next;
        });
        // Keep server-side "viewed memories" marker updated for unread counters.
        void markAsViewed('memories', profile);
    };

    const { deleteMemory: removeFromStore } = useOrbitStore();

    const removeMemoryLocally = (memoryId: string) => {
        removeFromStore(memoryId);
        setSelectedMemory(prev => (prev?.id === memoryId ? null : prev));
        setEditingMemory(prev => (prev?.id === memoryId ? null : prev));
        setMemoryToDelete(prev => (prev === memoryId ? null : prev));
        setActiveActionCardId(prev => (prev === memoryId ? null : prev));
    };

    const deleteMemoryInstant = async (memoryId: string) => {
        const result = await deleteMemory(memoryId);
        if ((result as any)?.error) {
            toast({
                title: "Failed to delete memory",
                description: (result as any)?.error || "Please try again.",
                variant: "destructive",
            });
            return false;
        }
        removeMemoryLocally(memoryId);
        toast({ title: "Memory deleted" });
        return true;
    };

    const openMemoryFromImage = (memory: Memory, isUnread: boolean, canManage: boolean) => {
        setSelectedMemory(memory);
        if (isUnread) {
            markMemoryViewed(memory.id);
        }
    };

    // Deep linking for notifications
    useEffect(() => {
        const openId = searchParams.get('open');
        if (openId && memories.length > 0) {
            const memoryToOpen = memories.find(m => m.id === openId);
            if (memoryToOpen) {
                setSelectedMemory(memoryToOpen);
                if (memoryToOpen.user_id !== userId) {
                    markMemoryViewed(memoryToOpen.id);
                }
            }
        }
    }, [searchParams, memories, userId]);

    useEffect(() => {
        // Clear unread dot instantly in UI
        useOrbitStore.getState().setCoreData({ unreadMemoriesCount: 0 });
        // Mark as viewed on server to sync global variable
        void markAsViewed('memories');

        if (typeof window === 'undefined') return;
        const mediaQuery = window.matchMedia('(hover: none), (pointer: coarse)');
        const sync = () => setIsTouchDevice(mediaQuery.matches);
        sync();
        mediaQuery.addEventListener('change', sync);
        return () => mediaQuery.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let lastY = window.scrollY;
        let ticking = false;

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(() => {
                const currentY = window.scrollY;
                const delta = currentY - lastY;
                const absDelta = Math.abs(delta);

                if (absDelta < 8) {
                    ticking = false;
                    return;
                }

                if (currentY < 64) {
                    setIsMobileFabVisible(true);
                } else if (delta > 0) {
                    setIsMobileFabVisible(false);
                } else {
                    setIsMobileFabVisible(true);
                }

                lastY = currentY;
                ticking = false;
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Unified under SyncEngine/GlobalStore
    // Removing redundant supabase.auth.getUser() effect

    useEffect(() => {
        if (!userId || typeof window === 'undefined') return;
        try {
            const raw = localStorage.getItem(getViewedMemoriesKey(userId));
            if (!raw) {
                setViewedMemoryIds(new Set());
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setViewedMemoryIds(new Set(parsed.filter((id) => typeof id === 'string')));
            }
        } catch {
            setViewedMemoryIds(new Set());
        }
    }, [userId]);

    // Pinned IDs handled by SyncEngine/GlobalStore
    // Removing redundant pinned loading and subscription useEffect

    const toggleMemoryPin = async (memoryId: string, shareWithPartner: boolean, duration: PinDurationOption = "forever") => {
        if (!coupleId) return;
        // if (!isUuid(memoryId)) { // FIRESTORE IDS ARE NOT UUIDS
        //     toast({ title: "Memory is syncing, pin will be available shortly." });
        //     return;
        // }
        const alreadyPinned = pinnedMemoryIds.includes(memoryId);
        if (alreadyPinned) {
            const res = await unpinContentItem(coupleId, "memory", memoryId);
            if (res.error) {
                toast({ title: res.error, variant: "destructive" });
                return;
            }
            if (res.data) setPinnedIds("memory", res.data);
            return;
        }

        const res = await pinContentItem(coupleId, "memory", memoryId, shareWithPartner, duration);
        if (res.error) {
            toast({ title: res.error, variant: "destructive" });
            return;
        }
        if (res.data) setPinnedIds("memory", res.data);
    };

    const requestMemoryPin = async (memoryId: string) => {
        if (pinnedMemoryIds.includes(memoryId)) {
            await toggleMemoryPin(memoryId, true);
            return;
        }
        setPinForPartner(true);
        setPinDuration("forever");
        setPinCandidateMemoryId(memoryId);
    };

    const sortedMemories = useMemo(() => {
        if (!pinnedMemoryIds.length) return memories;

        const memoryMap = new Map(memories.map((memory) => [memory.id, memory]));
        const pinned = pinnedMemoryIds
            .map((id) => memoryMap.get(id))
            .filter(Boolean) as Memory[];

        const unpinned = memories.filter((memory) => !pinnedMemoryIds.includes(memory.id));

        // Remove duplicates if any pinned items are also in the main list
        const uniqueUnpinned = unpinned.filter(u => !pinned.some(p => p.id === u.id));

        return [...pinned, ...uniqueUnpinned];
    }, [memories, pinnedMemoryIds]);

    const renderedMemories = useMemo(() => {
        return sortedMemories.slice(0, renderLimit);
    }, [sortedMemories, renderLimit]);

    useMediaWarmup(renderedMemories);

    const handleLoadMore = () => {
        if (renderLimit < sortedMemories.length) {
            setRenderLimit(prev => prev + (isNative ? 12 : 36));
            return;
        }

        if (isFetchingMore || memories.length >= (memoriesCount || 0)) return;
        setIsFetchingMore(true);
        const lastMemory = memories[memories.length - 1];
        const lastDate = lastMemory ? (lastMemory.memory_date || lastMemory.created_at) : null;

        window.dispatchEvent(new CustomEvent('orbit:tab-load-more', {
            detail: {
                pathname: '/memories',
                cursor: lastDate,
                done: () => setIsFetchingMore(false)
            }
        }));
    };


    return (
        <div
            className={cn(
                "max-w-7xl mx-auto space-y-3 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12",
                isNative ? "pt-16" : ""
            )}
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
                <SectionHeader
                    title="Memories"
                    label="Eternal Gallery"
                    count={memories.length}
                    suffix="items"
                    className="mb-0"
                />

                {memories.length > 0 && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden md:flex justify-end mb-1">
                        <Button
                            className="btn-fab-rose-pill w-12 h-12 rounded-full"
                            onClick={() => {
                                setEditingMemory(null);
                                setIsAdding(true);
                            }}
                        >
                            <Plus className="w-6 h-6" strokeWidth={2.4} />
                        </Button>
                    </motion.div>
                )}
            </div>

            {/* Back Handler integration for Android/Capacitor */}
            {(isAdding || selectedMemory) && (
                <MemoriesBackHandler
                    onClose={() => {
                        if (isAdding) setIsAdding(false);
                        else if (selectedMemory) setSelectedMemory(null);
                    }}
                />
            )}

            <AddMemoryDialog
                open={isAdding}
                onOpenChange={(open) => {
                    setIsAdding(open);
                    if (!open) setActiveActionCardId(null);
                }}
                editingMemory={editingMemory}
                onSuccess={() => {
                    // SyncEngine handles realtime updates automatically
                    setEditingMemory(null);
                }}
                onDelete={async (id) => {
                    await deleteMemoryInstant(id);
                    setEditingMemory(null);
                }}
            />


            {loading ? (
                <SoftPageLoader className="min-h-[56vh]" />
            ) : memories.length === 0 ? (
                <div className="pt-4 md:pt-12">
                    <div className="glass-card p-12 md:p-16 border-dashed border-white/10 bg-black/20 hover:bg-black/40 rounded-3xl flex flex-col items-center text-center group cursor-pointer transition-all duration-500" onClick={() => setIsAdding(true)}>
                        <div className="relative mb-8">
                            <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl group-hover:bg-rose-500/40 transition-all duration-700 animate-pulse" />
                            <ImageIcon className="h-14 w-14 text-rose-100/50 relative z-10 drop-shadow-[0_0_15px_rgba(251,113,133,0.5)] group-hover:scale-110 group-hover:text-rose-100 transition-all duration-500" />
                        </div>
                        <h3 className="text-2xl font-serif text-white mb-3 tracking-tight group-hover:text-rose-100 transition-colors">
                            {daysTogether === 0 ? "Orbit Established" : daysTogether < 7 ? "Growing Your Orbit" : `${daysTogether} Days Together`}
                        </h3>
                        <p className="text-white/40 text-[11px] max-w-sm mb-10 leading-loose uppercase tracking-[0.2em] font-black group-hover:text-white/60 transition-colors">
                            {daysTogether === 0
                                ? "Zero gravity. Your first shared memory awaits."
                                : daysTogether < 7
                                    ? "Has anything memorable happened this week? Add it to the gallery."
                                    : daysTogether < 30
                                        ? "Your gallery is waiting for its first story."
                                        : daysTogether < 365
                                            ? "Don't let these moments slip away. Capture a memory."
                                            : "Over a year in orbit! It's time to build your visual legacy."}
                        </p>
                        <Button variant="celestial-rose" onClick={(e) => { e.stopPropagation(); setIsAdding(true); }} className="h-14 px-10 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.15)] group-hover:shadow-[0_0_30px_rgba(244,63,94,0.3)] transition-all duration-300">
                            <Sparkles className="w-5 h-5 mr-2.5" />
                            INITIATE FIRST MEMORY
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="px-0 bg-[#0b0b10]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-4 md:gap-y-8 md:gap-x-6">
                        {renderedMemories.map((memory, index) => {
                            const isUnread = !!userId && memory.user_id !== userId && !viewedMemoryIds.has(memory.id);
                            const canManage = userId === memory.user_id;
                            const isPinned = pinnedMemoryIds.includes(memory.id);
                            const canPin = true; // FIRESTORE IDS ARE USABLE IMMEDIATELY

                            // Check explicit column or fallback to URL signature
                            const isMemoryEncrypted = memory.is_encrypted ||
                                (memory.image_urls && memory.image_urls.some((url: string) => typeof url === 'string' && (url.includes('enc=1') || url.includes('enc=') || /[?&]enc=1(?:&|$)/.test(url))));

                            const isE2EELocked = !!isMemoryEncrypted && !hasE2EEKey;

                            return (
                                <div key={memory.id} className="h-full">
                                    <div
                                        className={cn(
                                            "group relative overflow-hidden flex flex-col h-full rounded-none border border-white/10 bg-[linear-gradient(165deg,rgba(18,18,22,0.9),rgba(10,10,12,0.84))] shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20",
                                            isPinned && "ring-1 ring-amber-400/45",
                                            (isMemoryEncrypted && !hasE2EEKey) && "border-rose-500/35 [linear-gradient(165deg,rgba(23, 1, 1, 0.9),rgba(20, 4, 4, 0.84))]"
                                        )}
                                    >
                                        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.035] to-transparent" />

                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!canPin) return;
                                                void requestMemoryPin(memory.id);
                                            }}
                                            className={cn(
                                                "absolute top-4 right-4 z-20 h-8 w-8 rounded-full border flex items-center justify-center transition-colors",
                                                isPinned
                                                    ? "bg-amber-500/20 border-amber-400/50 text-amber-200"
                                                    : "bg-black/30 border-white/15 text-white/45 hover:text-white hover:border-white/35",
                                                !canPin && "opacity-40 cursor-not-allowed hover:text-white/45 hover:border-white/15"
                                            )}
                                            title={!canPin ? "Syncing..." : (isPinned ? "Unpin memory" : "Pin memory")}
                                            disabled={!canPin}
                                        >
                                            <Pin className="w-4 h-4" />
                                        </button>

                                        {/* Visual Area */}
                                        <div
                                            className="relative aspect-square w-full overflow-hidden flex-shrink-0 cursor-pointer bg-black/40"
                                            onClick={() => openMemoryFromImage(memory, isUnread, canManage)}
                                        >
                                            {memory.image_urls?.[0] ? (
                                                <>
                                                    <DecryptedImage
                                                        src={memory.image_urls[0] || "/placeholder.svg"}
                                                        alt={memory.title}
                                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                        priority={index < 6}
                                                        isEncrypted={memory.is_encrypted}
                                                        iv={memory.iv}
                                                        prefix={coupleId}
                                                        onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                                    />
                                                    {memory.image_urls.length > 1 && (
                                                        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/90">
                                                            <Layers className="w-3.5 h-3.5" />
                                                            <span className="text-[10px] font-bold tracking-wider">{memory.image_urls.length}</span>
                                                        </div>
                                                    )}
                                                    {isMemoryEncrypted && (
                                                        <div className="absolute top-4 right-14 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                                            <ShieldCheck className="w-3.5 h-3.5" />
                                                            <span className="text-[9px] font-black uppercase tracking-widest">Sealed</span>
                                                        </div>
                                                    )}
                                                    {!isVideoUrl(memory.image_urls[0]) && (
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
                                                    )}
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors duration-500">
                                                    <div className="w-16 h-16 rounded-full border border-white/5 flex items-center justify-center bg-white/[0.02] shadow-[inset_0_0_20px_rgba(255,255,255,0.02)] mb-4">
                                                        <Camera className="w-6 h-6 text-white/15" />
                                                    </div>
                                                    <p className="text-[10px] uppercase tracking-widest font-black text-white/20">No Media</p>
                                                </div>
                                            )}

                                            {/* Action Overlay */}
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-4">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openMemoryFromImage(memory, isUnread, canManage);
                                                    }}
                                                >
                                                    <Maximize2 className="w-5 h-5" />
                                                </Button>
                                                {canManage && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-12 w-12 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMemoryToDelete(memory.id);
                                                        }}
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </Button>
                                                )}
                                            </div>

                                            {/* Unread Indicator */}
                                            {isUnread && (
                                                <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                                                    <div className={cn(
                                                        "w-2.5 h-2.5 rounded-full animate-pulse",
                                                        mode === 'moon' ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]" : "bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.6)]"
                                                    )} />
                                                    <span className={cn(
                                                        "text-[10px] font-bold tracking-widest uppercase drop-shadow-md",
                                                        mode === 'moon' ? "text-rose-500" : "text-purple-400"
                                                    )}>New</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Text Content */}
                                        <div
                                            className="p-5 md:p-6 flex flex-col flex-grow bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent)] cursor-pointer"
                                            onClick={() => openMemoryFromImage(memory, isUnread, canManage)}
                                        >
                                            <div className="mb-4 space-y-2">
                                                <div className="flex items-start justify-between gap-3">
                                                    <h3 className="text-xl font-serif text-white tracking-tight line-clamp-1 group-hover:text-emerald-100 transition-colors">
                                                        {memory.title}
                                                    </h3>
                                                    {isMemoryEncrypted && (
                                                        <ShieldCheck className="w-4 h-4 text-emerald-400/80 shrink-0 mt-1.5" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-4 text-white/40">
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        <span className="text-[11px] font-mono tracking-wider">{format(normalizeDate(memory.memory_date), "MMM d, yyyy")}</span>
                                                    </div>
                                                    {memory.location && (
                                                        <div className="flex items-center gap-1.5">
                                                            <MapPin className="w-3.5 h-3.5" />
                                                            <span className="text-[11px] font-mono tracking-wider line-clamp-1">{memory.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {memory.description && (
                                                <div className="mb-6">
                                                    <p className="text-sm text-white/70 line-clamp-3 leading-relaxed font-serif italic">
                                                        "{memory.description}"
                                                    </p>
                                                </div>
                                            )}

                                            <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] uppercase tracking-widest font-black text-white/30">From</span>
                                                    <span className="text-xs font-serif text-white/80">
                                                        {memory.user_id === userId ? (profile?.display_name || "You") : (partnerProfile?.display_name || "Partner")}
                                                    </span>
                                                </div>
                                                {isMemoryEncrypted && (
                                                    <div className="flex items-center gap-1 text-emerald-400/70" title="End-to-End Encrypted">
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        <Lock className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {(memories.length > 0 && (renderLimit < sortedMemories.length || memories.length < (memoriesCount || 0))) && (
                        <div className="mt-12 flex justify-center pb-20">
                            <Button
                                variant="outline"
                                className="h-12 px-8 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                                onClick={handleLoadMore}
                                disabled={isFetchingMore}
                            >
                                {isFetchingMore ? "Retrieving..." : "Load Older Moments"}
                            </Button>
                        </div>
                    )}
                </div>
            )}



            <MemoryDetailDialog
                isOpen={!!selectedMemory}
                memory={selectedMemory}
                onClose={() => setSelectedMemory(null)}
                onDelete={(id) => {
                    setSelectedMemory(null);
                    setMemoryToDelete(id);
                }}
            />

            <AlertDialog open={!!memoryToDelete} onOpenChange={(open: boolean) => !open && setMemoryToDelete(null)}>
                <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2.5rem] p-10">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-serif text-white">Remove Memory?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/40 text-sm italic font-serif">
                            This will permanently delete this memory and all its photos from our visual legacy.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-4">
                        <AlertDialogCancel className="bg-transparent border-white/10 text-white rounded-2xl h-12 px-8">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-500 text-white rounded-2xl h-12 px-8"
                            onClick={async () => {
                                if (memoryToDelete) {
                                    await deleteMemoryInstant(memoryToDelete);
                                }
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!pinCandidateMemoryId} onOpenChange={(open: boolean) => !open && setPinCandidateMemoryId(null)}>
                <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2rem]">
                    <AlertDialogHeader className="pb-1">
                        <AlertDialogTitle className="text-white">Pin this memory?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            {pinnedMemoryIds.length >= 3
                                ? "It will move to the top. The oldest pin will be auto-unpinned."
                                : "It will move to the top."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4">
                        <div className="px-1 py-1.5">
                            <p className="text-[10px] uppercase tracking-[0.16em] font-black text-white/45 mb-2">Pin duration</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(["24h", "7d", "30d", "forever"] as PinDurationOption[]).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setPinDuration(option)}
                                        className={cn(
                                            "h-9 rounded-lg border text-xs font-bold uppercase tracking-[0.12em] transition-colors",
                                            pinDuration === option
                                                ? "border-rose-400/60 bg-rose-500/20 text-rose-100"
                                                : "border-white/15 bg-black/20 text-white/65 hover:border-white/25"
                                        )}
                                    >
                                        {option === "forever" ? "Forever" : option}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="flex items-center gap-3 px-1 py-2">
                            <Checkbox
                                checked={pinForPartner}
                                onCheckedChange={(checked) => setPinForPartner(checked === true)}
                                className="border-white/30 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-400"
                            />
                            <span className="text-sm text-white/80">Pin for partner too</span>
                        </label>
                    </div>
                    <AlertDialogFooter className="mt-2">
                        <AlertDialogCancel className="bg-transparent border-white/10 text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-500 text-white"
                            onClick={async (e) => {
                                e.preventDefault();
                                if (!pinCandidateMemoryId) return;
                                await toggleMemoryPin(pinCandidateMemoryId, pinForPartner, pinDuration);
                                setPinCandidateMemoryId(null);
                            }}
                        >
                            Pin Memory
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {memories.length > 0 && (
                <div
                    className={cn(
                        "md:hidden fixed bottom-24 right-6 z-[2000] transition-all duration-200 ease-out",
                        isMobileFabVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-4 pointer-events-none"
                    )}
                >
                    <Button
                        onClick={() => {
                            setEditingMemory(null);
                            setIsAdding(true);
                        }}
                        className="btn-fab-rose-pill w-14 h-14 rounded-full"
                    >
                        <Plus className="w-7 h-7" strokeWidth={2.4} />
                    </Button>
                </div>
            )}
        </div>
    );
}

function MemoriesBackHandler({ onClose }: { onClose: () => void }) {
    useBackHandler(() => {
        onClose();
        return true;
    }, true);
    return null;
}
