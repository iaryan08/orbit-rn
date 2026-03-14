'use client'

import { useEffect, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { Maximize2, Download, Heart, Check, Trash2 } from "lucide-react"
import { auth, db } from "@/lib/firebase/client"
import {
    collection,
    query,
    where,
    onSnapshot,
    QuerySnapshot,
    DocumentData,
    doc
} from "firebase/firestore"
import { Keyboard } from '@capacitor/keyboard'
import { useBackHandler } from './global-back-handler'
import {
    getPolaroidComments,
    addPolaroidComment,
    updatePolaroidComment,
    deletePolaroidComment
} from "@/lib/client/reactions-comments"
import { CommentsDisplay } from "./comments-display"
import { useToast } from "@/hooks/use-toast"
import { FullScreenImageModal } from "./full-screen-image-modal"
import { cn } from "@/lib/utils"
import { DecryptedImage } from "./e2ee/decrypted-image"
import { isEncryptedMediaUrl, downloadMedia } from "@/lib/client/crypto-e2ee"
import { savePolaroidToMemories, deletePolaroid } from "@/lib/client/polaroids"
import { useOrbitStore } from "@/lib/store/global-store"
import { getPublicStorageUrl } from "@/lib/storage"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string | null | undefined): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());

interface PolaroidData {
    id: string
    image_url: string
    caption?: string
    created_at: string
}

interface PolaroidDetailModalProps {
    polaroid: PolaroidData | null
    title: string
    isOpen: boolean
    onClose: () => void
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

export function PolaroidDetailModal({ polaroid, title, isOpen, onClose }: PolaroidDetailModalProps) {
    const [comments, setComments] = useState<CommentData[]>([])
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const { toast } = useToast()
    const [isSavingToMemories, setIsSavingToMemories] = useState(false)
    const [hasBeenSaved, setHasBeenSaved] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const user = auth.currentUser
    const currentUserId = user?.uid || ''
    const { profile, partnerProfile } = useOrbitStore()
    const coupleId = profile?.couple_id

    const avatarMap: Record<string, string | null> = {}
    if (profile?.id && profile.avatar_url) {
        avatarMap[profile.id] = getPublicStorageUrl(profile.avatar_url, 'avatars')
    }
    if (partnerProfile?.id && partnerProfile.avatar_url) {
        avatarMap[partnerProfile.id] = getPublicStorageUrl(partnerProfile.avatar_url, 'avatars')
    }

    const fetchComments = useCallback(async () => {
        if (!polaroid?.id) return
        const commentsRes = await getPolaroidComments(polaroid.id)
        if (commentsRes.data) {
            const formatted = commentsRes.data.map((c: any) => ({
                ...c,
                profiles: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) || { display_name: 'User', avatar_url: null }
            }))
            setComments(formatted as any)
        }
    }, [polaroid])

    useEffect(() => {
        if (!coupleId || !polaroid?.id || !isOpen) return
        fetchComments()

        // Firestore real-time listener for comments
        const q = query(
            collection(db, 'couples', coupleId, 'polaroid_comments'),
            where('polaroid_id', '==', polaroid.id)
        )

        const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const subcollectionComments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                profiles: (doc.data() as any).profiles || { display_name: 'User', avatar_url: null }
            }))

            // Orbit Integration: Merge with native-style embedded comments if they exist
            const embeddedComments = (polaroid as any)?.comments || [];
            const allCommentsRaw = [...subcollectionComments, ...embeddedComments];

            // Filter out duplicates by ID
            const uniqueComments = Array.from(new Map(allCommentsRaw.map(c => [c.id, c])).values());

            // Map profiles for embedded comments using existing context if possible
            const formatted = uniqueComments.map(c => ({
                ...c,
                profiles: (c as any).profiles || { 
                    display_name: (c as any).user_name || 'User', 
                    avatar_url: (c as any).user_avatar_url || null 
                }
            }));

            // Client-side sort: latest on top
            formatted.sort((a: any, b: any) =>
                new Date((b as any).created_at).getTime() - new Date((a as any).created_at).getTime()
            );

            setComments(formatted as any)
        }, (err: Error) => {
            console.warn('[PolaroidComments] Listener error:', err)
        })

        return () => unsub()
    }, [polaroid, isOpen, fetchComments])

    useBackHandler(() => {
        if (fullScreenImage) setFullScreenImage(null)
        else onClose()
    }, isOpen)

    const triggerHaptic = () => {
        if (typeof window !== 'undefined' && window.navigator?.vibrate) window.navigator.vibrate(10)
    }

    const handleDownload = async () => {
        if (!polaroid?.image_url) return;
        setIsDownloading(true);
        triggerHaptic();
        try {
            const resolved = getPublicStorageUrl(polaroid.image_url, 'memories') || polaroid.image_url;
            await downloadMedia(resolved, `orbit-${Date.now()}.jpg`);
            toast({ title: "Saved to gallery" });
        } catch (e) {
            toast({ title: "Download failed", variant: "destructive" });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSaveToMemories = async () => {
        if (!polaroid || !profile) return;
        setIsSavingToMemories(true);
        triggerHaptic();
        try {
            const res = await savePolaroidToMemories(polaroid, profile, partnerProfile);
            if (res.success) {
                setHasBeenSaved(true);
                toast({ title: "Moved to Memory Box 💖" });
            }
        } catch (e: any) {
            toast({ title: "Failed to save", variant: "destructive" });
        } finally {
            setIsSavingToMemories(false);
        }
    };

    const handleDelete = async () => {
        if (!polaroid || isDeleting) return;
        setIsDeleting(true);
        triggerHaptic();
        try {
            const res = await deletePolaroid(polaroid.id);
            if (res.success) {
                toast({ title: "Polaroid deleted" });
                onClose();
            } else {
                toast({ title: res.error || "Failed to delete", variant: "destructive" });
            }
        } catch (e: any) {
            toast({ title: "An error occurred", variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    if (!polaroid) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="p-0 overflow-hidden border border-white/20 bg-[#0b060d]/95 backdrop-blur-md sm:max-w-[440px] w-[92vw] h-auto flex flex-col rounded-2xl shadow-2xl translate-x-[-50%] -translate-y-1/2">
                <DialogTitle className="sr-only">Polaroid</DialogTitle>
                <DialogDescription className="sr-only">Details</DialogDescription>

                {/* Hero Image */}
                <div className="relative w-full aspect-square flex-shrink-0 bg-neutral-900/50 overflow-hidden">
                    <DecryptedImage
                        src={polaroid.image_url}
                        alt={title}
                        className="object-cover w-full h-full cursor-zoom-in"
                        isEncrypted={isEncryptedMediaUrl(polaroid.image_url)}
                        onClick={() => {
                            const resolved = getPublicStorageUrl(polaroid.image_url, 'memories') || polaroid.image_url;
                            setFullScreenImage(resolved);
                        }}
                    />
                    <button
                        onClick={() => {
                            const resolved = getPublicStorageUrl(polaroid.image_url, 'memories') || polaroid.image_url;
                            setFullScreenImage(resolved);
                        }}
                        className="absolute top-4 right-4 p-2 rounded-full bg-black/40 backdrop-blur-md text-white/70 hover:text-white"
                    >
                        <Maximize2 className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[40vh] minimal-scrollbar">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h2 className="text-lg font-serif text-white/90 leading-tight">{title}</h2>
                            <p className="text-[10px] text-rose-300/40 uppercase tracking-widest font-bold">
                                {(() => {
                                    const d = new Date(polaroid.created_at);
                                    return !isNaN(d.getTime())
                                        ? formatDistanceToNow(d, { addSuffix: true })
                                        : "Just now";
                                })()}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/50 active:scale-90 transition-transform"
                            >
                                <Download className={cn("h-4 w-4", isDownloading && "animate-bounce")} />
                            </button>
                            <button
                                onClick={handleSaveToMemories}
                                disabled={isSavingToMemories || hasBeenSaved}
                                className={cn(
                                    "px-3 py-2 rounded-full flex items-center gap-2 transition-all active:scale-95",
                                    hasBeenSaved ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 hover:bg-rose-500/10 text-white/50 hover:text-rose-400"
                                )}
                            >
                                {hasBeenSaved ? <Check className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
                            </button>

                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="p-2.5 rounded-full bg-white/5 hover:bg-rose-500/10 text-white/50 hover:text-rose-400 active:scale-90 transition-transform"
                            >
                                <Trash2 className={cn("h-4 w-4", isDeleting && "animate-pulse")} />
                            </button>
                        </div>
                    </div>

                    {polaroid.caption && (
                        <p className="text-xs text-white/40 leading-relaxed font-light italic">"{polaroid.caption}"</p>
                    )}

                    <div className="space-y-4 pt-2">
                        <h3 className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">Reactions</h3>
                        <CommentsDisplay
                            comments={comments}
                            currentUserId={currentUserId}
                            onAddComment={async (c) => { await addPolaroidComment(polaroid.id, c); fetchComments(); }}
                            onEditComment={async (id, c) => { await updatePolaroidComment(id, c); fetchComments(); }}
                            onDeleteComment={async (id) => { await deletePolaroidComment(id); fetchComments(); }}
                            avatarMap={avatarMap}
                            compact
                        />
                    </div>
                </div>
            </DialogContent>

            <FullScreenImageModal
                src={fullScreenImage}
                images={fullScreenImage ? [fullScreenImage] : []}
                currentIndex={0}
                onClose={() => setFullScreenImage(null)}
                isEncrypted={!!(fullScreenImage && isEncryptedMediaUrl(fullScreenImage))}
            />
        </Dialog>
    )
}
