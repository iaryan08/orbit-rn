"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Heart, Calendar, Sparkles, Send, Lock, Infinity, ShieldAlert, Key, FileUp } from "lucide-react";
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
import { encryptText, hasStoredMediaPassphrase, importRecoveryKit as restoreKey, isE2EEEnabled } from "@/lib/client/crypto-e2ee";
import { sendLetter as sendLetterAction, updateLetter } from "@/lib/client/letters";
import { refreshDashboard } from "@/lib/client/auth";
import { getTodayIST, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useBackHandler } from '../global-back-handler';
import { useViewport } from "@/contexts/viewport-context";
import { useOrbitStore } from "@/lib/store/global-store";

interface EditingLetter {
    id: string;
    title: string;
    content: string;
    unlock_date: string | null;
}

interface WriteLetterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingLetter?: EditingLetter | null;
    onSuccess?: () => void;
    defaultWhisper?: boolean;
}

const LETTER_TITLE_MAX_LENGTH = 70;

export function WriteLetterDialog({ open, onOpenChange, editingLetter, onSuccess, defaultWhisper = false }: WriteLetterDialogProps) {
    const router = useRouter();
    const { toast } = useToast();

    const [newLetter, setNewLetter] = useState({
        title: "",
        content: "",
        unlock_date: "",
    });
    const [isOneTime, setIsOneTime] = useState(defaultWhisper);
    const [generating, setGenerating] = useState(false);
    const [sending, setSending] = useState(false);
    const hasStoredKey = typeof window !== 'undefined'
        ? (() => { try { return hasStoredMediaPassphrase() && isE2EEEnabled(); } catch { return false; } })()
        : false;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { isKeyboardVisible: isTyping } = useViewport();
    const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const formScrollRef = useRef<HTMLDivElement | null>(null);
    const messageMinHeightRef = useRef<number>(220);

    const scrollFieldIntoForm = (element: HTMLElement | null) => {
        const container = formScrollRef.current;
        if (!container || !element) return;
        const cRect = container.getBoundingClientRect();
        const eRect = element.getBoundingClientRect();
        const pad = 14;
        if (eRect.bottom > cRect.bottom - pad) {
            container.scrollTop += eRect.bottom - cRect.bottom + pad;
        } else if (eRect.top < cRect.top + pad) {
            container.scrollTop -= cRect.top - eRect.top + pad;
        }
    };

    // Reset form when dialog opens/closes or editing letter changes
    useEffect(() => {
        if (open) {
            setIsOneTime(defaultWhisper);
            if (editingLetter) {
                setNewLetter({
                    title: editingLetter.title,
                    content: editingLetter.content,
                    unlock_date: editingLetter.unlock_date ? editingLetter.unlock_date.split('T')[0] : "",
                });
            } else {
                setNewLetter({ title: "", content: "", unlock_date: "" });
            }
        }
    }, [open, editingLetter, defaultWhisper]);


    useBackHandler(() => {
        onOpenChange(false);
    }, open);

    const handleSendLetter = async () => {
        const hasKey = hasStoredMediaPassphrase() && isE2EEEnabled();

        setSending(true);
        try {
            const normalizedTitle = newLetter.title.trim();
            if (normalizedTitle.length > LETTER_TITLE_MAX_LENGTH) {
                toast({
                    title: `Title exceeds ${LETTER_TITLE_MAX_LENGTH} characters`,
                    variant: "destructive",
                });
                return;
            }

            let e2eeData = { is_encrypted: false, encrypted_content: undefined as string | undefined, iv: undefined as string | undefined };
            const textId = editingLetter?.id || crypto.randomUUID();

            if (hasKey) {
                try {
                    const encrypted = await encryptText(textId, newLetter.content);
                    e2eeData = {
                        is_encrypted: true,
                        encrypted_content: encrypted.ciphertextB64,
                        iv: encrypted.ivB64
                    };
                } catch (err) {
                    console.error("[WriteLetter] Encryption failed:", err);
                    toast({ title: "Encryption failed", description: "Could not secure your letter.", variant: "destructive" });
                    return;
                }
            }

            if (editingLetter) {
                const res = await updateLetter(editingLetter.id, {
                    title: hasKey ? "Encrypted Content" : normalizedTitle,
                    content: hasKey ? "Encrypted Content" : newLetter.content,
                    unlock_date: newLetter.unlock_date || null,
                    ...e2eeData
                });
                if (res.error) throw new Error(res.error);
                toast({ title: "Letter updated ", variant: "success" });
            } else {
                const res = await sendLetterAction({
                    id: textId, // Pass the pre-generated UUID
                    title: hasKey ? "Encrypted Content" : normalizedTitle,
                    content: hasKey ? "Encrypted Content" : newLetter.content,
                    unlock_date: newLetter.unlock_date || null,
                    isOneTime: isOneTime,
                    ...e2eeData
                });

                if (res.error) throw new Error(res.error);

                // Optimistic UI update
                if (res.data) {
                    useOrbitStore.getState().upsertLetter(res.data);
                }

                toast({
                    title: isOneTime ? "Whisper Sent" : (newLetter.unlock_date ? "Letter Scheduled" : "Letter Sent!"),
                });
            }

            setNewLetter({ title: "", content: "", unlock_date: "" });
            onOpenChange(false);
            onSuccess?.();
            router.refresh();
            await refreshDashboard();
        } catch (error: any) {
            toast({
                title: "Failed to send letter",
                variant: "destructive",
            });
        } finally {
            setSending(false);
        }
    };

    const generateAILetter = async () => {
        setGenerating(true);
        try {
            const response = await fetch("/api/generate-letter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: newLetter.title || "a romantic love letter" }),
            });

            if (response.ok) {
                const data = await response.json();
                setNewLetter(prev => ({ ...prev, content: data.content }));
            }
        } catch (error) {
            console.error("Error generating letter:", error);
        } finally {
            setGenerating(false);
        }
    };

    const syncMessageTextareaHeight = () => {
        const el = messageTextareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(340, Math.max(120, el.scrollHeight));
        el.style.height = `${next}px`;
    };

    useEffect(() => {
        syncMessageTextareaHeight();
    }, [open]);


    useEffect(() => {
        if (!open || !isTyping) return;
        const active = document.activeElement as HTMLElement | null;
        if (active && formScrollRef.current?.contains(active)) {
            requestAnimationFrame(() => scrollFieldIntoForm(active));
        }
    }, [isTyping, open]);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className={cn(
                        "w-[90vw] sm:w-[calc(100%-1.5rem)] sm:max-w-[560px] lg:max-w-[760px] grid grid-rows-[auto,minmax(0,1fr),auto] border border-white/20 text-white rounded-3xl p-0 gap-0 overflow-hidden backdrop-blur-md shadow-[0_24px_100px_rgba(0,0,0,1)]",
                        isOneTime
                            ? "bg-neutral-950/95"
                            : "bg-neutral-950/95"
                    )}
                    style={{
                        width: 'min(calc(var(--app-width-stable, 100vw) - 1rem), 760px)',
                        height: 'min(820px, calc(var(--app-height-stable, 100vh) - 0.8rem))',
                        maxHeight: 'calc(var(--app-height-stable, 100vh) - 0.8rem)'
                    }}
                >
                    <DialogHeader className="px-5 sm:px-6 lg:px-5 pt-4 pb-3 border-b border-white/10 bg-black/20 shrink-0 z-20">
                        <DialogTitle className={cn(
                            "flex items-center gap-3 font-serif text-2xl sm:text-[2rem] lg:text-[1.75rem] break-words min-w-0 w-full overflow-hidden",
                            isOneTime ? 'text-rose-100' : 'text-rose-100'
                        )}>
                            {isOneTime ? (
                                <Lock className="h-5 w-5 sm:h-6 sm:w-6 text-rose-400 fill-rose-400/20 shrink-0" />
                            ) : (
                                <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-rose-400 fill-rose-400 shrink-0" />
                            )}
                            <span className="break-words">
                                {editingLetter ? "Edit Love Letter" : (isOneTime ? "Send Secret Whisper" : "Write a Love Letter")}
                            </span>
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            Write a heartfelt message to your partner.
                        </DialogDescription>
                    </DialogHeader>

                    <div
                        ref={formScrollRef}
                        data-slot="letter-form-scroll"
                        className={cn(
                            "space-y-4 mt-0 flex flex-col min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 lg:px-5 pt-4 scrollbar-hide transition-all duration-300",
                            isTyping ? "pb-8" : "pb-6"
                        )}
                    >
                        {!hasStoredKey && (
                            <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4 space-y-2">
                                <Label htmlFor="letter-title" className="text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">Title</Label>
                                <Input
                                    id="letter-title"
                                    placeholder={isOneTime ? "Top Secret..." : "My Dearest..."}
                                    value={newLetter.title}
                                    maxLength={LETTER_TITLE_MAX_LENGTH}
                                    onChange={(e) => setNewLetter(prev => ({ ...prev, title: e.target.value.slice(0, LETTER_TITLE_MAX_LENGTH) }))}
                                    onFocus={(e) => requestAnimationFrame(() => scrollFieldIntoForm(e.target))}
                                    className="text-white placeholder:text-white/45 border-white/20 bg-black/28 focus-visible:ring-white/30"
                                    activeBorderClassName="bg-rose-500/80"
                                />
                            </div>
                        )}

                        <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="letter-content" className="text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">Your Message <span className="text-rose-400">*</span></Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={generateAILetter}
                                    disabled={generating}
                                    className="text-[10px] text-rose-100 font-bold uppercase tracking-wider bg-rose-500/20 hover:bg-rose-500/30 h-7 px-3 border border-rose-400/30 rounded-full active:scale-95 transition-all"
                                >
                                    <Sparkles className="h-3 w-3 mr-1 text-rose-300" />
                                    {generating ? "Writing..." : "AI Assist"}
                                </Button>
                            </div>
                            <Textarea
                                ref={messageTextareaRef}
                                id="letter-content"
                                placeholder={isOneTime ? "Write a secret message..." : "Pour your heart out..."}
                                value={newLetter.content}
                                onChange={(e) => setNewLetter(prev => ({ ...prev, content: e.target.value }))}
                                onInput={syncMessageTextareaHeight}
                                onFocus={(e) => requestAnimationFrame(() => scrollFieldIntoForm(e.target))}
                                rows={3}
                                className={cn(
                                    "text-white placeholder:text-white/45 mt-1.5 border-white/20 bg-black/28 focus-visible:ring-white/30 resize-none overflow-y-auto minimal-scrollbar min-h-[120px] max-h-[280px] lg:max-h-[340px]"
                                )}
                                activeBorderClassName="bg-rose-500/80"
                            />
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4 space-y-2 min-h-[112px] shrink-0 relative z-10">
                            <Label htmlFor="letter-scheduled" className="flex items-center gap-2 text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">
                                <Calendar className="h-3.5 w-3.5" />
                                {isOneTime ? "Delivery" : "Schedule Delivery"}
                            </Label>
                            {!isOneTime ? (
                                <Input
                                    id="letter-scheduled"
                                    type="date"
                                    value={newLetter.unlock_date}
                                    onChange={(e) => setNewLetter(prev => ({ ...prev, unlock_date: e.target.value }))}
                                    min={getTodayIST()}
                                    className="mt-1 text-white border-white/20 bg-black/28 focus-visible:ring-white/30 [color-scheme:dark]"
                                />
                            ) : (
                                <div className="mt-1 h-10 rounded-md border border-white/20 bg-black/28 px-3 flex items-center text-xs text-white/55 font-medium">
                                    One-time view enabled
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        data-slot="dialog-footer"
                        className="px-5 py-4 sm:p-5 lg:px-5 lg:py-4 border-t border-white/10 bg-black/35 shrink-0 z-20"
                    >
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center rounded-full border border-white/20 bg-black/28 p-1 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsOneTime(false)}
                                    className={`h-7 w-8 rounded-full inline-flex items-center justify-center transition-colors ${!isOneTime ? "bg-white/10 text-rose-200" : "text-white/40 hover:text-white/70"
                                        }`}
                                    aria-label="Standard mode"
                                    title="Standard mode"
                                >
                                    <Infinity className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsOneTime(true)}
                                    className={`h-7 w-8 rounded-full inline-flex items-center justify-center transition-colors ${isOneTime ? "bg-rose-500/20 text-rose-200" : "text-white/40 hover:text-white/70"
                                        }`}
                                    aria-label="One-time view mode"
                                    title="One-time view mode"
                                >
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] font-extrabold leading-none">
                                        1
                                    </span>
                                </button>
                            </div>
                            <Button onClick={() => handleSendLetter()} className={cn(
                                "flex-1 gap-2 h-12 lg:h-11 rounded-full text-base lg:text-[1.05rem] font-bold transition-all active:scale-95",
                                isOneTime ? 'bg-rose-600 hover:bg-rose-700' : ''
                            )} variant={isOneTime ? "default" : "rosy"} disabled={!newLetter.content || sending}>
                                {isOneTime ? (
                                    <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-current text-[10px] font-extrabold leading-none">
                                        1
                                    </span>
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                                {sending ? "Sending..." : editingLetter ? "Save Changes" : (isOneTime ? "Send Secret" : "Send with Love")}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
