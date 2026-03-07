'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { db } from "@/lib/firebase/client"
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore"
import { useViewport } from "@/contexts/viewport-context"
import { format } from "date-fns"
import { Heart, Calendar, Trash2, ShieldCheck } from "lucide-react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { deleteMemory } from "@/lib/actions/memories";
// Removed legacy Supabase
import { App } from '@capacitor/app'
import { FullScreenImageModal } from "./full-screen-image-modal"
import { useAppMode } from "@/components/app-mode-context"
import { useAuth } from "./auth-provider"
import {
    getMemoryComments,
    addMemoryComment,
    updateMemoryComment,
    deleteMemoryComment
} from "@/lib/client/reactions-comments"
import { CommentsDisplay } from "./comments-display"
import { useToast } from "@/hooks/use-toast"
import { cn, normalizeDate } from "@/lib/utils"
import { getPublicStorageUrl } from "@/lib/storage"
import { ImageWithLoader } from "./ui/image-with-loader"
import { DecryptedImage } from "./e2ee/decrypted-image"
import { DecryptedText } from "./e2ee/decrypted-text"
import { hasStoredMediaPassphrase } from "@/lib/client/crypto-e2ee"
import { EncryptedLockedCard } from "@/components/e2ee/encrypted-locked-card"
import { BlurredText, BlurredTitle } from "./e2ee/blurred-text"
import { useOrbitStore } from "@/lib/store/global-store"
import { downloadMedia } from "@/lib/client/crypto-e2ee"
import { Download } from "lucide-react"

interface Memory {
    id: string
    title: string
    description: string
    image_urls: string[]
    location: string | null
    memory_date: string
    user_id?: string
    is_encrypted?: boolean
    iv?: string
}

interface MemoryDetailDialogProps {
    memory: Memory | null
    isOpen: boolean
    onClose: () => void
    onDelete?: (id: string) => void
}

interface CommentData {
    id: string
    content: string
    user_id: string
    created_at: string
    updated_at?: string
    profiles?: {
        display_name: string | null
        avatar_url: string | null
    }
}

export function MemoryDetailDialog({ memory, isOpen, onClose, onDelete }: MemoryDetailDialogProps) {
    const [comments, setComments] = useState<CommentData[]>([])
    const [isLoadingComments, setIsLoadingComments] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string>('')
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [mediaAccessLocked, setMediaAccessLocked] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const isMediaEncrypted = useMemo(() => {
        if (!memory) return false;
        if (memory.is_encrypted) return true;
        return (memory.image_urls || []).some(url => /[?&]enc=1(?:&|$)/.test(url));
    }, [memory]);

    const isE2EE = memory?.is_encrypted || isMediaEncrypted;
    const { isKeyboardVisible: isTyping } = useViewport()
    const { toast } = useToast()
    const isDraggingRef = useRef(false)
    const { coupleId } = useAppMode()
    const [hasE2EEKey, setHasE2EEKey] = useState<boolean>(() => {
        try {
            return hasStoredMediaPassphrase();
        } catch {
            return false;
        }
    });

    // Touch logic for lightweight swipe
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchEnd, setTouchEnd] = useState<number | null>(null)
    const [keyboardHeight, setKeyboardHeight] = useState(0)
    const [modalHeight, setModalHeight] = useState<string | number>('auto')

    // Supabase removed
    const { profile, partnerProfile } = useOrbitStore()

    // Build avatarMap from globally-cached profiles (already proxy-resolved)
    const avatarMap: Record<string, string | null> = {}
    if (profile?.id && profile.avatar_url) {
        avatarMap[profile.id] = getPublicStorageUrl(profile.avatar_url, 'avatars')
    }
    if (partnerProfile?.id && partnerProfile.avatar_url) {
        avatarMap[partnerProfile.id] = getPublicStorageUrl(partnerProfile.avatar_url, 'avatars')
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // ANDROID OPTIMIZATION: Keyboard Awareness (Visual Viewport)
    // ─────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || typeof window === "undefined") return;
        const vv = window.visualViewport;
        const update = () => {
            if (!vv) return;
            const keyboard = window.innerHeight - vv.height - vv.offsetTop;
            setKeyboardHeight(Math.max(0, keyboard));
        };
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        update();
        return () => {
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
        };
    }, [isOpen]);

    // Get current user
    const { user } = useAuth()
    useEffect(() => {
        if (user) setCurrentUserId(user.uid)
    }, [user])

    // Real-time comments handled via onSnapshot listener below

    // Load comments and handle real-time updates via Firestore
    useEffect(() => {
        if (!coupleId || !memory?.id || !isOpen) return

        const q = query(
            collection(db, "couples", coupleId, "memory_comments"),
            where("memory_id", "==", memory.id),
            orderBy("created_at", "desc")
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommentData));

            // Client-side sort by created_at - Removed as orderBy is now in query
            const sorted = commentsData.sort((a: any, b: any) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )// );

            // Map profiles (this is slightly inefficient to do every time but works for now)
            // In a more complex app, we'd use a global user cache or join in a function
            const userIds = [...new Set(commentsData.map(c => c.user_id))]; // Used commentsData directly
            const profiles: Record<string, any> = {};

            for (const uid of userIds) {
                const userDoc = await getDoc(doc(db, 'users', uid));
                if (userDoc.exists()) {
                    profiles[uid] = userDoc.data();
                }
            }

            const formatted = commentsData.map(c => ({ // Used commentsData directly
                ...c,
                profiles: profiles[c.user_id] || { display_name: 'User', avatar_url: null }
            }));

            setComments(formatted as any);
        });

        return () => unsubscribe();
    }, [memory?.id, isOpen]);

    // Reset image index and full screen state when memory changes or modal closes
    useEffect(() => {
        setCurrentImageIndex(0)
        setFullScreenImage(null)
        setMediaAccessLocked(false)
    }, [memory?.id, isOpen])

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const syncKeyState = () => {
            try {
                setHasE2EEKey(hasStoredMediaPassphrase());
            } catch {
                setHasE2EEKey(false);
            }
        };
        window.addEventListener('orbit:restore-key-success', syncKeyState);
        window.addEventListener('storage', syncKeyState);
        syncKeyState();
        return () => {
            window.removeEventListener('orbit:restore-key-success', syncKeyState);
            window.removeEventListener('storage', syncKeyState);
        };
    }, []);

    // Intercept Android Hardware Back Button
    // When fullscreen IS open → FullScreenImageModal owns the back button listener
    // When fullscreen is NOT open → this dialog owns it
    // Intercept Back Button via Global Dispatch
    useEffect(() => {
        if (!isOpen || fullScreenImage) return

        const handleBack = (e: Event) => {
            e.preventDefault()
            onClose()
        }
        window.addEventListener('capacitor:back', handleBack)
        return () => window.removeEventListener('capacitor:back', handleBack)
    }, [isOpen, fullScreenImage, onClose]);



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
        if (!touchStart || !touchEnd || !memory) return
        const distance = touchStart - touchEnd

        if (distance > 50) {
            // Swipe Left (Next)
            setCurrentImageIndex(prev => prev < memory.image_urls.length - 1 ? prev + 1 : 0)
        } else if (distance < -50) {
            // Swipe Right (Prev)
            setCurrentImageIndex(prev => prev > 0 ? prev - 1 : memory.image_urls.length - 1)
        }
    }

    const handleAddComment = async (content: string) => {
        if (!content.trim()) return

        const optimisticId = 'temp-' + Date.now()
        const optimisticComment: CommentData = {
            id: optimisticId,
            content: content.trim(),
            user_id: currentUserId,
            created_at: new Date().toISOString(),
            profiles: {
                display_name: 'You',
                avatar_url: null
            }
        }

        setComments(prev => [...prev, optimisticComment])

        const res = await addMemoryComment(memory!.id, content)
        if (res.error) {
            setComments(prev => prev.filter(c => c.id !== optimisticId))
            toast({
                title: "Failed to post comment",
                variant: "destructive"
            })
        } else {
            // Force a refresh to get server-sanctified IDs and official profiles
            const loadRes = await getMemoryComments(memory!.id)
            if (loadRes.data) {
                const formatted = loadRes.data.map((c: any) => ({
                    ...c,
                    profiles: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) || { display_name: 'User', avatar_url: null }
                }))
                setComments(formatted as any)
            }
        }
    }

    const handleEditComment = async (commentId: string, content: string) => {
        const result = await updateMemoryComment(commentId, content)
        if (result.success) {
            // Updated automatically via onSnapshot
            toast({
                title: "Comment Updated ",
                variant: "success",
            })
        } else {
            toast({
                title: "Failed to update comment",
                variant: "destructive"
            })
        }
    }

    const handleDeleteComment = async (commentId: string) => {
        const result = await deleteMemoryComment(commentId)
        if (result.success) {
            setComments(prev => prev.filter(c => c.id !== commentId))
            toast({
                title: "Comment Removed",
                variant: "default",
            })
        } else {
            toast({
                title: "Failed to delete comment",
                variant: "destructive"
            })
        }
    }

    const lockedByMissingKey = !!isE2EE && !hasE2EEKey;
    const effectiveLockedState = !!isE2EE && (mediaAccessLocked || lockedByMissingKey);

    const handleImageClick = () => {
        if (effectiveLockedState) return;
        if (isDraggingRef.current) return;
        setFullScreenImage(memory!.image_urls[currentImageIndex])
    }

    const handleDownload = async () => {
        const url = memory?.image_urls[currentImageIndex];
        if (!url) return;
        setIsDownloading(true);
        try {
            const resolved = getPublicStorageUrl(url, 'memories') || url;
            await downloadMedia(resolved, `orbit-memory-${Date.now()}.jpg`);
            toast({ title: "Saved to gallery" });
        } catch (e) {
            toast({ title: "Download failed", variant: "destructive" });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDelete = async () => {
        if (!memory?.id) return
        try {
            setIsDeleting(true)
            const res = await deleteMemory(memory.id)
            if (res.error) throw new Error(res.error)

            toast({
                title: "Memory deleted",
                description: "The memory has been removed from your gallery."
            })
            window.dispatchEvent(new CustomEvent('orbit:dashboard-refresh'))
            onClose()
        } catch (error: any) {
            toast({
                title: "Error deleting memory",
                description: error.message || "Something went wrong",
                variant: "destructive"
            })
        } finally {
            setIsDeleting(false)
        }
    }

    if (!memory) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className={cn(
                    "p-0 overflow-hidden border border-white/20 bg-neutral-950/98 backdrop-blur-xl sm:max-w-[420px] lg:max-w-[520px] w-[90vw] lg:w-[50vw] h-auto flex flex-col transition-all duration-300 rounded-3xl shadow-[0_0_80px_-12px_rgba(0,0,0,1)] outline-none focus:outline-none focus-visible:outline-none translate-x-[-50%] transform-gpu origin-center",
                    "-translate-y-1/2"
                )}
                style={{
                    maxHeight: 'calc(var(--app-height, 100vh) - env(safe-area-inset-top, 24px) - env(safe-area-inset-bottom, 16px) - 60px)',
                    transform: keyboardHeight > 0
                        ? `translate(-50%, calc(-50% - ${keyboardHeight / 2}px))`
                        : 'translate(-50%, -50%)',
                    transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
                }}
                onOpenAutoFocus={(e) => {
                    // Prevent keyboard from opening automatically on dialog show
                    e.preventDefault();
                    (document.activeElement as HTMLElement)?.blur();
                }}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => {
                    if (fullScreenImage) e.preventDefault()
                }}
            >
                <DialogTitle className="sr-only">Memory Details</DialogTitle>
                <DialogDescription className="sr-only">
                    View and comment on this shared memory.
                </DialogDescription>

                {/* Fixed Image Area */}
                <div className="relative aspect-square md:aspect-[4/5] max-h-[50vh] w-full flex-shrink-0 flex items-center justify-center overflow-hidden bg-neutral-900/50 border-b border-white/5 z-30">
                    {/* Static Single Image View instead of heavy mapping & AnimatePresence */}
                    <div
                        className="absolute inset-0 w-full h-full cursor-pointer touch-pan-y"
                        onClick={handleImageClick}
                        onTouchStart={!effectiveLockedState && memory.image_urls.length > 1 ? onTouchStart : undefined}
                        onTouchMove={!effectiveLockedState && memory.image_urls.length > 1 ? onTouchMove : undefined}
                        onTouchEnd={!effectiveLockedState && memory.image_urls.length > 1 ? onTouchEndEvent : undefined}
                    >
                        {effectiveLockedState ? (
                            <EncryptedLockedCard
                                className="w-full h-full border-none shadow-none bg-transparent"
                                label="Encrypted Content"
                                onClick={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                            />
                        ) : (
                            <DecryptedImage
                                src={memory.image_urls[currentImageIndex] || "/placeholder.svg"}
                                alt={`${memory.title} ${currentImageIndex + 1}`}
                                className="object-cover w-full h-full"
                                isEncrypted={memory.is_encrypted}
                                iv={memory.iv}
                                prefix={coupleId}
                                onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                onStatusChange={(status) => {
                                    if (!memory?.is_encrypted) {
                                        setMediaAccessLocked(false);
                                        return;
                                    }
                                    setMediaAccessLocked(status === 'locked' || status === 'decrypt_error' || status === 'fetch_error');
                                }}
                            />
                        )}
                        {!effectiveLockedState && memory.image_urls.length > 1 && (
                            <div className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md text-white text-[10px] px-3 py-1.5 rounded-full font-black uppercase tracking-[0.2em] shadow-lg pointer-events-none border border-white/5">
                                {currentImageIndex + 1} / {memory.image_urls.length}
                            </div>
                        )}
                    </div>

                    {!effectiveLockedState && memory.image_urls.length > 1 && (
                        <>
                            <div className="hidden md:flex absolute top-1/2 left-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60"
                                    onClick={() => setCurrentImageIndex(prev => (prev === 0 ? memory.image_urls.length - 1 : prev - 1))}
                                >
                                    <Heart className="h-4 w-4 -rotate-90 text-rose-300" />
                                </Button>
                            </div>
                            <div className="hidden md:flex absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60"
                                    onClick={() => setCurrentImageIndex(prev => (prev === memory.image_urls.length - 1 ? 0 : prev + 1))}
                                >
                                    <Heart className="h-4 w-4 rotate-90 text-rose-300" />
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Scrollable Content Area */}
                <div
                    className="relative w-full flex-1 overflow-y-auto minimal-scrollbar bg-neutral-950/50 group flex flex-col z-20"
                    onTouchMove={() => (document.activeElement as HTMLElement)?.blur()}
                >
                    <div className="flex-1 flex flex-col z-20">
                        {/* Metadata Header */}
                        <div className="px-5 pt-5 pb-0">
                            <div className="space-y-2.5">
                                {effectiveLockedState ? (
                                    <BlurredTitle className="mb-4" />
                                ) : (
                                    memory.title && (
                                        <h2 className="text-xl lg:text-2xl font-serif font-bold text-white tracking-tight leading-loose">
                                            {memory.title}
                                        </h2>
                                    )
                                )}
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                        <Calendar className="h-3 w-3 text-rose-300/40" />
                                        <span className="text-[9px] lg:text-[10px] text-rose-300/80 uppercase tracking-[0.1em] font-black">
                                            {(() => {
                                                try {
                                                    return format(normalizeDate(memory.memory_date), "MMM d, yyyy");
                                                } catch {
                                                    return "Unknown Date";
                                                }
                                            })()}
                                        </span>
                                    </div>
                                    {memory.location && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-white/20" />
                                            {effectiveLockedState ? (
                                                <BlurredText rows={1} maxWidth="80px" className="inline-block" />
                                            ) : (
                                                <span className="text-[9px] lg:text-[10px] text-rose-100/60 font-medium tracking-wide">
                                                    {memory.location}
                                                </span>
                                            )}
                                        </>
                                    )}
                                    {isE2EE && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                                            <ShieldCheck className="h-3 w-3 text-emerald-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">E2EE Sealed</span>
                                        </div>
                                    )}

                                    {!effectiveLockedState && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                                            disabled={isDownloading}
                                            className={cn(
                                                "ml-auto p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90",
                                                isDownloading && "animate-pulse"
                                            )}
                                            title="Download current image"
                                        >
                                            <Download className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {isE2EE && !effectiveLockedState && (
                            <div className="px-6 pt-4 pb-0">
                                <div className="flex items-center gap-2 text-[10px] text-emerald-400/60 font-medium bg-emerald-500/5 w-fit px-3 py-1 rounded-lg border border-emerald-500/10 mb-1">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    This memory is protected by your Privacy Key
                                </div>
                            </div>
                        )}

                        {(memory.description || effectiveLockedState) && (
                            <div
                                className="px-6 py-2 cursor-pointer group/desc relative"
                                onClick={() => !effectiveLockedState && setIsExpanded(!isExpanded)}
                            >
                                <motion.div
                                    initial={false}
                                    animate={{ maxHeight: isExpanded ? "1000px" : "3.6rem" }}
                                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                                    className="relative overflow-hidden pl-4"
                                >
                                    {effectiveLockedState ? (
                                        <BlurredText rows={3} className="opacity-60" />
                                    ) : (
                                        <p className={cn(
                                            "text-xs lg:text-sm text-white/80 leading-relaxed font-medium",
                                            !isExpanded && "line-clamp-3"
                                        )}>
                                            {memory.is_encrypted ? (
                                                <DecryptedText
                                                    id={memory.id}
                                                    ciphertext={memory.description}
                                                    iv={memory.iv}
                                                    onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                                />
                                            ) : (
                                                memory.description
                                            )}
                                        </p>
                                    )}
                                </motion.div>
                            </div>
                        )}

                        {/* Comments Section */}
                        <div className="px-5 pb-5 mt-3">
                            <div className="space-y-2.5">
                                <h3 className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-bold">Comments</h3>
                                {effectiveLockedState ? (
                                    <div className="space-y-4 pt-2">
                                        <div className="flex gap-3">
                                            <div className="w-6 h-6 rounded-full bg-white/5 filter blur-[2px]" />
                                            <BlurredText rows={1} maxWidth="120px" className="opacity-40" />
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-6 h-6 rounded-full bg-white/5 filter blur-[2px]" />
                                            <BlurredText rows={2} maxWidth="200px" className="opacity-30" />
                                        </div>
                                    </div>
                                ) : (
                                    <CommentsDisplay
                                        comments={comments}
                                        currentUserId={currentUserId}
                                        onAddComment={handleAddComment}
                                        onEditComment={handleEditComment}
                                        onDeleteComment={handleDeleteComment}
                                        avatarMap={avatarMap}
                                        compact
                                    />
                                )}
                            </div>
                        </div>

                        {/* Author Actions (E2EE/Locked friendly) */}
                        {memory.user_id === currentUserId && (
                            <div className="px-5 pb-8 flex justify-center border-t border-white/5 pt-6">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-[10px] uppercase font-black tracking-[0.2em] text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/10 rounded-full h-10 px-6 transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(); // Changed to call local handleDelete
                                    }}
                                    disabled={isDeleting} // Added disabled state
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                    Delete Memory
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
            <FullScreenImageModal
                src={fullScreenImage}
                images={memory.image_urls}
                currentIndex={currentImageIndex}
                onIndexChange={(idx) => setCurrentImageIndex(idx)}
                onClose={() => setFullScreenImage(null)}
                isEncrypted={memory.is_encrypted}
                iv={memory.iv}
                prefix={coupleId}
                canRevealEncrypted={!effectiveLockedState}
            />
        </Dialog >
    )
}
