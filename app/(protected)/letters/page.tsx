"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Heart, Plus, Mail, MailOpen, Lock, Sparkles, Edit2, X, Send, Pin } from "lucide-react";
import { WriteLetterDialog } from "@/components/dialogs/write-letter-dialog";
// import { createClient } from "@/lib/supabase/client"; // REPLACING WITH FIREBASE
import { openLetter } from "@/lib/client/letters";
import { markAsViewed } from "@/lib/client/auth";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { useAppMode } from "@/components/app-mode-context";
import { useAuth } from "@/components/auth-provider";
import { WhisperCard } from "@/components/whisper-card";
import { DecryptedText } from "@/components/e2ee/decrypted-text";
import { EncryptedLockedCard } from "@/components/e2ee/encrypted-locked-card";
import { hasStoredMediaPassphrase } from "@/lib/client/crypto-e2ee";
import { readOfflineCache, writeOfflineCache } from "@/lib/client/offline-cache";
import { cn, normalizeDate } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import { useBackHandler } from "@/components/global-back-handler";
import { LocalDB } from "@/lib/client/local-db";
import { useOrbitStore } from "@/lib/store/global-store";
import { SoftPageLoader } from "@/components/soft-page-loader";
import { fetchPinnedIds, pinContentItem, subscribeToPins, unpinContentItem, type PinDurationOption } from "@/lib/client/pins";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionHeader } from "@/components/section-header";

interface LoveLetter {
    id: string;
    title: string;
    content: string;
    is_encrypted?: boolean;
    encrypted_content?: string;
    iv?: string;
    sender_id: string;
    receiver_id: string;
    unlock_date: string | null;
    unlock_type?: string;
    is_read: boolean;
    read_at?: string;
    created_at: string;
    sender_name?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string | null | undefined): value is string =>
    typeof value === 'string' && UUID_RE.test(value.trim());

export default function LettersPage() {
    const { coupleId, mode } = useAppMode();
    const { user } = useAuth();
    const [selectedLetter, setSelectedLetter] = useState<LoveLetter | null>(null);
    const [editingLetter, setEditingLetter] = useState<LoveLetter | null>(null);
    const [isWriting, setIsWriting] = useState(false);
    const [activeWhisperId, setActiveWhisperId] = useState<string | null>(null);
    const [hiddenWhisperIds, setHiddenWhisperIds] = useState<Set<string>>(new Set());
    const { letters, isInitialized, deleteLetter, upsertLetter, profile, partnerProfile, pinnedLetterIds, setPinnedIds, lettersCount } = useOrbitStore();
    const loading = !isInitialized;
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [pinCandidateLetterId, setPinCandidateLetterId] = useState<string | null>(null);
    const [pinForPartner, setPinForPartner] = useState(true);
    const [pinDuration, setPinDuration] = useState<PinDurationOption>("forever");
    const [isMobileFabVisible, setIsMobileFabVisible] = useState(true);
    const [hasE2EEKey, setHasE2EEKey] = useState<boolean>(() => {
        try {
            return hasStoredMediaPassphrase();
        } catch {
            return false;
        }
    });
    const activeWhisperIdRef = useRef<string | null>(null);
    const deletedLetterIdsRef = useRef<Set<string>>(new Set());
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        activeWhisperIdRef.current = activeWhisperId;

        if (!activeWhisperId) {
            setSelectedLetter(prev => prev && deletedLetterIdsRef.current.has(prev.id) ? null : prev);
        }
    }, [activeWhisperId, coupleId, user]);

    // const supabase = createClient(); // REPLACING WITH FIREBASE
    const isNative = Capacitor.isNativePlatform();

    const markLettersViewedNow = (currentUser: any) => {
        void markAsViewed('letters', currentUser);
    };

    const getHiddenWhispersKey = (uid: string) => `orbit:hidden_whispers:${uid}`;

    const markWhisperHidden = (letterId: string) => {
        setHiddenWhisperIds(prev => {
            if (prev.has(letterId)) return prev;
            const next = new Set(prev);
            next.add(letterId);
            if (typeof window !== "undefined" && user?.uid) { // FIREBASE USES uid
                localStorage.setItem(getHiddenWhispersKey(user.uid), JSON.stringify(Array.from(next)));
            }
            return next;
        });
    };

    useEffect(() => {
        if (!user?.uid || typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(getHiddenWhispersKey(user.uid));
            if (!raw) {
                setHiddenWhisperIds(new Set());
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setHiddenWhisperIds(new Set(parsed.filter((id) => typeof id === "string")));
            }
        } catch {
            setHiddenWhisperIds(new Set());
        }
    }, [user?.uid]);

    useEffect(() => {
        if (typeof window === "undefined") return;
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

    useEffect(() => {
        if (typeof window === "undefined") return;
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

    // Deep linking for notifications: /letters?open=<letterId>
    useEffect(() => {
        const openId = searchParams.get('open');
        if (!openId || letters.length === 0) return;

        const letterToOpen = letters.find((l) => l.id === openId);
        if (!letterToOpen) return;

        setSelectedLetter(letterToOpen);
        if (user && !letterToOpen.is_read && letterToOpen.receiver_id === user.uid) {
            void markAsRead(letterToOpen.id);
        }

        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.delete('open');
        const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
        router.replace(nextUrl, { scroll: false });
    }, [searchParams, letters, user, pathname, router]);

    const toggleLetterPin = async (letterId: string, shareWithPartner: boolean, duration: PinDurationOption = "forever") => {
        if (!coupleId) return;
        // if (!isUuid(letterId)) return;
        const alreadyPinned = pinnedLetterIds.includes(letterId);
        if (alreadyPinned) {
            const res = await unpinContentItem(coupleId, "letter", letterId);
            if (res.data) setPinnedIds("letter", res.data);
            return;
        }

        const res = await pinContentItem(coupleId, "letter", letterId, shareWithPartner, duration);
        if (res.data) setPinnedIds("letter", res.data);
    };

    const requestLetterPin = async (letterId: string) => {
        if (pinnedLetterIds.includes(letterId)) {
            await toggleLetterPin(letterId, true);
            return;
        }
        setPinForPartner(true);
        setPinDuration("forever");
        setPinCandidateLetterId(letterId);
    };

    const sortedLetters = useMemo(() => {
        if (!pinnedLetterIds.length) return letters;

        const letterMap = new Map(letters.map((letter) => [letter.id, letter]));
        const pinned = pinnedLetterIds
            .map((id) => letterMap.get(id))
            .filter(Boolean) as LoveLetter[];

        const unpinned = letters.filter((letter) => !pinnedLetterIds.includes(letter.id));
        return [...pinned, ...unpinned];
    }, [letters, pinnedLetterIds]);

    useEffect(() => {
        // Clear unread dot instantly in UI
        useOrbitStore.getState().setCoreData({ unreadLettersCount: 0 });
        // Mark as viewed on server to sync global variable
        void markAsViewed('letters');

        if (!user) return;
        // markAsRead(user.uid); // THIS LOOKS LIKE A BUG IN ORIGINAL CODE — should mark letter as read, not user.id

        // REALTIME IS HANDLED BY AUTHCONTEXT SNAPSHOTS NOW
    }, [coupleId, user, deleteLetter]);

    const markAsRead = async (letterId: string) => {
        const target = letters.find((l: LoveLetter) => l.id === letterId);
        if (!target || !user) return;
        const isReceiver = target.receiver_id === user.uid;
        if (!isReceiver) return;

        const nowIso = new Date().toISOString();
        upsertLetter({ ...target, is_read: true, read_at: target.read_at || nowIso });

        try {
            // WE NEED TO IMPLEMENT THIS IN FIREBASE
            const result = await openLetter(letterId);

            if (result && result.success && result.read_at) {
                upsertLetter({ ...target, is_read: true, read_at: result.read_at });
                setSelectedLetter(prev =>
                    prev && prev.id === letterId ? { ...prev, is_read: true, read_at: result.read_at } : prev
                );
            }
        } catch (error) {
            console.error("Error marking letter as read:", error);
        }
    };

    const handleWhisperOpen = async (letterId: string) => {
        markWhisperHidden(letterId);
        deletedLetterIdsRef.current.add(letterId);
        await markAsRead(letterId);
    };

    const handleLoadMore = () => {
        if (isFetchingMore || letters.length >= (lettersCount || 0)) return;
        setIsFetchingMore(true);
        const lastLetter = letters[letters.length - 1];
        const lastDate = lastLetter?.created_at;

        window.dispatchEvent(new CustomEvent('orbit:tab-load-more', {
            detail: {
                pathname: '/letters',
                cursor: lastDate,
                done: () => setIsFetchingMore(false)
            }
        }));
    };

    const handleCloseOneTimeAfterRead = async (letterId: string) => {
        if (!user) return;
        const target = letters.find((l: LoveLetter) => l.id === letterId);
        if (!target) return;

        deletedLetterIdsRef.current.add(letterId);

        const shouldDeleteForViewer = target.unlock_type === 'one_time' && target.receiver_id === user.uid;
        if (!shouldDeleteForViewer) return;

        deleteLetter(letterId);
        setSelectedLetter(prev => (prev?.id === letterId ? null : prev));
    };

    useBackHandler(() => {
        if (selectedLetter) {
            void handleCloseOneTimeAfterRead(selectedLetter.id);
            setSelectedLetter(null);
        } else if (isWriting) {
            setIsWriting(false);
        }
    }, !!selectedLetter || isWriting);

    const previewIsReceiver = !!user && !!selectedLetter && selectedLetter.receiver_id === user.uid;
    const previewReceiverName = selectedLetter
        ? (previewIsReceiver
            ? (profile?.display_name || "You")
            : (partnerProfile?.display_name || "Partner"))
        : "";
    const previewDateLabel = previewIsReceiver ? "Received" : "Sent";
    const selectedLetterLocked = !!selectedLetter?.is_encrypted && !hasE2EEKey;

    return (
        <div
            className={cn(
                "max-w-7xl mx-auto space-y-6 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12",
                isNative ? "pt-16" : "",

            )}
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
                <SectionHeader
                    title="Letters"
                    label="Bridge the Distance"
                    count={letters.length}
                    suffix="items"
                    className="mb-0"
                />

                {letters.length > 0 && (
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="hidden md:flex justify-end mb-1">
                        <Button
                            className="btn-fab-rose-pill w-12 h-12 rounded-full"
                            onClick={() => {
                                setEditingLetter(null);
                                setIsWriting(true);
                            }}
                        >
                            <Plus className="w-6 h-6" strokeWidth={2.4} />
                        </Button>
                    </motion.div>
                )}
            </div>

            <WriteLetterDialog
                open={isWriting}
                onOpenChange={setIsWriting}
                editingLetter={editingLetter}
                onSuccess={() => {
                    setEditingLetter(null);
                }}
            />

            {loading ? (
                <SoftPageLoader className="min-h-[50vh]" />
            ) : letters.length === 0 ? (
                <div>
                    <div className="glass-card p-12 md:p-16 border-dashed border-white/5 bg-transparent rounded-2xl flex flex-col items-center text-center">
                        <Mail className="h-12 w-12 text-white/10 mb-6" />
                        <h3 className="text-xl font-serif text-white mb-2">No letters yet</h3>
                        <p className="text-white/30 text-[10px] max-w-xs mb-8 leading-relaxed uppercase tracking-widest font-bold">
                            Your letter box is empty. Start writing heartfelt messages to bridge the distance.
                        </p>
                        <Button onClick={() => setIsWriting(true)} className="bg-white/10 border-white/10 h-12 px-8 rounded-xl">
                            Write Your First Letter
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                        {sortedLetters.map((letter) => {
                            const isReceiver = !!user && letter.receiver_id === user.uid;
                            const isSender = !!user && letter.sender_id === user.uid;
                            const isPinned = pinnedLetterIds.includes(letter.id);
                            const canPin = true; // FIRESTORE IDS
                            const senderLabel =
                                letter.sender_name ||
                                (isSender
                                    ? (profile?.display_name || "You")
                                    : (partnerProfile?.display_name || "Partner"));
                            const dateLabel = isReceiver ? "Received" : "Sent";
                            const isE2EELocked = !!letter.is_encrypted && !hasE2EEKey;

                            if (letter.unlock_type === 'one_time' && (isReceiver || isSender)) {
                                const isHidden = hiddenWhisperIds.has(letter.id) || deletedLetterIdsRef.current.has(letter.id);
                                const canRenderWhisper = activeWhisperId === letter.id || (!isHidden && (!letter.is_read || isSender));
                                if (!canRenderWhisper) return null;
                                return (
                                    <div key={letter.id} >
                                        <WhisperCard
                                            letter={letter}
                                            mode={isSender ? 'sender' : 'receiver'}
                                            onRevealStart={(id) => setActiveWhisperId(id)}
                                            onRevealEnd={(id) => setActiveWhisperId(prev => (prev === id ? null : prev))}
                                            onOpen={handleWhisperOpen}
                                            onCloseAfterReveal={async (id) => {
                                                await handleCloseOneTimeAfterRead(id);
                                            }}
                                        />
                                    </div>
                                )
                            }

                            return (
                                <div key={letter.id} className="h-full orbit-virtual-card">
                                    <div
                                        className={cn(
                                            "group relative min-h-[260px] h-full cursor-pointer overflow-hidden rounded-none border border-white/10 bg-[linear-gradient(165deg,rgba(18,18,22,0.9),rgba(10,10,12,0.84))] flex flex-col justify-between shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20",
                                            isE2EELocked ? "p-0" : "p-6 md:p-7",
                                            isE2EELocked && "border-rose-500/35 [linear-gradient(165deg,rgba(23, 1, 1, 0.9),rgba(20, 4, 4, 0.84))] ",
                                            !letter.is_read && isReceiver ? (
                                                mode === 'moon' ? "ring-2 ring-rose-500/20" : "ring-2 ring-purple-400/20"
                                            ) : ""
                                        )}
                                        onClick={(e) => {
                                            if (isE2EELocked) {
                                                e.stopPropagation();
                                                window.dispatchEvent(new CustomEvent('orbit:restore-key'));
                                                return;
                                            }
                                            setSelectedLetter(letter);
                                            if (!letter.is_read && user && letter.receiver_id === user.uid) markAsRead(letter.id);
                                        }}
                                    >
                                        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white/[0.06] to-transparent" />
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!canPin) return;
                                                void requestLetterPin(letter.id);
                                            }}
                                            className={cn(
                                                "absolute top-4 right-4 z-20 h-8 w-8 rounded-full border flex items-center justify-center transition-colors",
                                                isPinned
                                                    ? "bg-amber-500/20 border-amber-400/50 text-amber-200"
                                                    : "bg-black/30 border-white/15 text-white/45 hover:text-white hover:border-white/35",
                                                !canPin && "opacity-40 cursor-not-allowed hover:text-white/45 hover:border-white/15"
                                            )}
                                            title={!canPin ? "Syncing..." : (isPinned ? "Unpin letter" : "Pin letter")}
                                            disabled={!canPin}
                                        >
                                            <Pin className="w-4 h-4" />
                                        </button>

                                        {isE2EELocked ? (
                                            <EncryptedLockedCard
                                                className="h-full min-h-[260px] border-none bg-transparent shadow-none"
                                                label="Encrypted Letter"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.dispatchEvent(new CustomEvent('orbit:restore-key'));
                                                }}
                                            />
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn(
                                                        "p-2 rounded-lg border",
                                                        !letter.is_read && isReceiver ? (
                                                            mode === 'moon'
                                                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                                                : "bg-purple-400/10 border-purple-400/20 text-purple-400"
                                                        ) :
                                                            !letter.is_read && isSender ? "bg-white/5 border-white/10 text-white/40" :
                                                                "bg-white/5 border-white/10 text-white/20"
                                                    )}>
                                                        {!letter.is_read ? <Mail className={cn("w-3.5 h-3.5", isReceiver && "animate-bounce-slow")} /> : <MailOpen className="w-3.5 h-3.5" />}
                                                    </div>
                                                    <h3 className="text-lg font-serif text-white tracking-tight line-clamp-1">
                                                        {(letter.title || "Untitled Letter").split('(')[0].trim()}
                                                    </h3>
                                                </div>

                                                {letter.is_encrypted ? (
                                                    <div className="text-base text-white/72 line-clamp-3 leading-relaxed font-serif italic">
                                                        <DecryptedText
                                                            id={letter.id}
                                                            ciphertext={letter.encrypted_content}
                                                            iv={letter.iv}
                                                            fallback="[Encrypted Secret]"
                                                            onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                                        />
                                                    </div>
                                                ) : (
                                                    <p className="text-base text-white/72 line-clamp-3 leading-relaxed font-serif italic">
                                                        "{letter.content}"
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {!isE2EELocked && (
                                            <div className="pt-5 border-t border-white/10 flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] uppercase tracking-widest font-black text-white/25 italic">From</span>
                                                    <span className="text-[11px] font-serif text-white/80">{senderLabel}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[9px] uppercase tracking-widest font-black text-white/25 italic">{dateLabel}</span>
                                                    <span className="text-[10px] font-mono text-white/55">{letter.created_at ? format(normalizeDate(letter.created_at), "MMM d, yyyy") : ""}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {letters.length > 0 && letters.length < (lettersCount || 0) && (
                        <div className="flex justify-center pb-20">
                            <Button
                                variant="outline"
                                className="h-12 px-8 rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white"
                                onClick={handleLoadMore}
                                disabled={isFetchingMore}
                            >
                                {isFetchingMore ? "Retrieving..." : "Load Older Letters"}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <Dialog
                open={!!selectedLetter}
                onOpenChange={(open) => {
                    if (!open && selectedLetter) {
                        void handleCloseOneTimeAfterRead(selectedLetter.id);
                    }
                    if (!open) setSelectedLetter(null);
                }}
            >
                <DialogContent
                    onInteractOutside={(e) => e.preventDefault()}
                    showCloseButton={false}
                    className={cn(
                        "w-[90vw] max-w-[90vw] p-0 overflow-hidden rounded-2xl shadow-[inset_0_0_12px_rgba(255,255,255,0.02),0_24px_80px_rgba(0,0,0,1)]",
                        selectedLetterLocked
                            ? "border border-rose-500/35 bg-[linear-gradient(165deg,rgba(60,10,22,0.96),rgba(18,4,10,0.98))]"
                            : "border border-white/10 bg-neutral-950/95"
                    )}
                >
                    <DialogTitle className="sr-only">Love Letter</DialogTitle>
                    <DialogDescription className="sr-only">
                        {selectedLetterLocked
                            ? "Encrypted letter is locked. Restore your key to view content."
                            : "Full letter preview with sender, date, and message content."}
                    </DialogDescription>
                    <div className="relative min-h-[320px] max-h-[85vh] sm:max-h-[80vh] flex flex-col">
                        <button
                            onClick={() => setSelectedLetter(null)}
                            className="absolute top-6 right-6 z-50 p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {selectedLetterLocked ? (
                            <div className="flex-1 min-h-[320px] flex items-center justify-center px-7 py-10 md:px-10 md:py-12">
                                <EncryptedLockedCard
                                    className="w-full h-full min-h-[250px] rounded-2xl"
                                    label="Encrypted Letter"
                                    onClick={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                />
                            </div>
                        ) : (
                            <>
                                <div className="px-6 py-4 md:px-8 md:py-6 bg-transparent flex-none border-b border-white/10 z-10">
                                    <h2 className="text-2xl md:text-3xl font-serif text-rose-100 tracking-tight leading-[1.3] mb-1.5">
                                        {(selectedLetter?.title || "Love Letter").split('(')[0].trim()}
                                    </h2>

                                    <div className="flex flex-wrap items-center gap-2.5 text-[10px] uppercase font-black tracking-widest text-white/40">
                                        <div className="flex items-center gap-1">
                                            <span className="text-white/20">To:</span>
                                            <span className="text-white/65">{previewReceiverName}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-white/20">{previewDateLabel}:</span>
                                            <span className="text-white/55">{selectedLetter?.created_at && format(normalizeDate(selectedLetter.created_at), "MMM d, yyyy")}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-6 py-4 md:px-8 pt-3 flex-1 overflow-y-auto minimal-scrollbar border-b border-white/10">
                                    <div className="whitespace-pre-wrap leading-relaxed text-white/72 font-serif italic text-base md:text-lg pb-8">
                                        {selectedLetter?.is_encrypted ? (
                                            <DecryptedText
                                                id={selectedLetter?.id}
                                                ciphertext={selectedLetter?.encrypted_content}
                                                iv={selectedLetter?.iv}
                                                onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                            />
                                        ) : (
                                            selectedLetter?.content
                                        )}
                                    </div>
                                </div>

                                <div className="p-6 bg-transparent flex items-center justify-start gap-4">
                                    <Heart className="w-4 h-4 text-rose-500" fill="currentColor" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25">With All My Love</span>
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {letters.length > 0 && (
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
                            setEditingLetter(null);
                            setIsWriting(true);
                        }}
                        className="btn-fab-rose-pill w-14 h-14 rounded-full"
                    >
                        <Plus className="w-7 h-7" strokeWidth={2.4} />
                    </Button>
                </div>
            )}

            <AlertDialog open={!!pinCandidateLetterId} onOpenChange={(open) => !open && setPinCandidateLetterId(null)}>
                <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[2rem]">
                    <AlertDialogHeader className="pb-1">
                        <AlertDialogTitle className="text-white">Pin this letter?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            {pinnedLetterIds.length >= 3
                                ? "It will appear at the top of the feed. The oldest pin will be auto-unpinned."
                                : "It will appear at the top of the feed."}
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
                                if (!pinCandidateLetterId) return;
                                await toggleLetterPin(pinCandidateLetterId, pinForPartner, pinDuration);
                                setPinCandidateLetterId(null);
                            }}
                        >
                            Pin Letter
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function LettersBackHandler({ onClose }: { onClose: () => void }) {
    useBackHandler(() => {
        onClose();
        return true;
    }, true);
    return null;
}
