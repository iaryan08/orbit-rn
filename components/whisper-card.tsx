'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, Sparkles, Eye, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useBackHandler } from '@/components/global-back-handler'
import { DecryptedText } from './e2ee/decrypted-text'

interface WhisperCardProps {
    letter: any
    onOpen: (id: string) => Promise<void> | void
    onCloseAfterReveal?: (id: string) => Promise<void> | void
    onRevealStart?: (id: string) => void
    onRevealEnd?: (id: string) => void
    mode?: 'receiver' | 'sender'
}

export function WhisperCard({ letter, onOpen, onCloseAfterReveal, onRevealStart, onRevealEnd, mode = 'receiver' }: WhisperCardProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [content, setContent] = useState<string | null>(null)
    const [isRevealing, setIsRevealing] = useState(false)

    const handleReveal = async () => {
        if (isRevealing) return
        setIsRevealing(true)
        onRevealStart?.(letter.id)
        setContent(letter.content)
        setIsOpen(true)
        try {
            await onOpen(letter.id)
        } finally {
            setIsRevealing(false)
        }
    }

    const handleClose = async () => {
        setIsOpen(false)
        try {
            if (content) {
                await onCloseAfterReveal?.(letter.id)
            }
        } finally {
            onRevealEnd?.(letter.id)
        }
    }

    useBackHandler(() => {
        if (isOpen) {
            handleClose();
            // Returning empty (void/true) tells the global handler that we consumed this event.
            return;
        }
    }, isOpen);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={mode === 'receiver' ? { scale: 1.01 } : undefined}
                onClick={mode === 'receiver' ? handleReveal : undefined}
                className={cn(
                    "group relative min-h-[260px] h-full overflow-hidden rounded-[22px] border shadow-[0_20px_45px_rgba(0,0,0,0.45)] transition-all duration-300",
                    mode === 'receiver'
                        ? "cursor-pointer border-white/15 bg-[linear-gradient(165deg,rgba(255,255,255,0.98),rgba(243,238,230,0.95))] hover:-translate-y-1 hover:border-rose-300/50"
                        : "cursor-default border-white/10 bg-[linear-gradient(165deg,rgba(22,22,28,0.92),rgba(10,10,12,0.86))]"
                )}
            >
                <div
                    className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 h-20",
                        mode === 'receiver'
                            ? "bg-gradient-to-b from-black/5 to-transparent"
                            : "bg-gradient-to-b from-white/[0.06] to-transparent"
                    )}
                />

                {/* Content Overlay */}
                <div className="relative z-10 p-6 flex flex-col items-center text-center gap-4">
                    <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300",
                        mode === 'receiver'
                            ? "bg-black/5 border-black/10 text-rose-500 group-hover:bg-rose-100"
                            : "bg-white/5 border-white/10 text-white/20"
                    )}>
                        {mode === 'receiver' && isRevealing ? (
                            <Sparkles className="w-6 h-6 animate-spin-slow" />
                        ) : (
                            <Lock className="w-6 h-6" />
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <h3 className={cn(
                            "text-lg font-serif",
                            mode === 'receiver' ? "text-zinc-900" : "text-white/90"
                        )}>
                            {mode === 'sender' ? 'Whisper Sent' : 'Private Whisper'}
                        </h3>
                        <div className="flex flex-col items-center gap-2">
                            <div className={cn(
                                "px-2 py-0.5 rounded-full",
                                mode === 'receiver' ? "bg-black/5" : "bg-rose-500/10"
                            )}>
                                <span className={cn(
                                    "text-[7px] font-black uppercase tracking-widest",
                                    mode === 'receiver' ? "text-zinc-600" : "text-rose-300"
                                )}>
                                    {mode === 'sender' ? 'Waiting to be opened' : 'Self-destructs on view'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>

            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent
                    onInteractOutside={(e) => e.preventDefault()}
                    showCloseButton={false}
                    className="w-[90vw] max-w-[90vw] bg-zinc-950 border-white/5 p-0 overflow-hidden rounded-2xl"
                >
                    <DialogTitle className="sr-only">Secret Whisper</DialogTitle>
                    <DialogDescription className="sr-only">
                        One-time private whisper message preview.
                    </DialogDescription>
                    <div className="relative min-h-[300px] max-h-[85vh] sm:max-h-[80vh] flex flex-col">
                        <button
                            onClick={handleClose}
                            className="absolute top-6 right-6 z-50 w-10 h-10 rounded-xl bg-white/5 text-white flex items-center justify-center hover:bg-white/10 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="p-8 flex-1 flex flex-col items-center justify-center space-y-6">
                            <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                                <Eye className="w-4 h-4 text-rose-400" />
                            </div>

                            <div className="space-y-4 text-center px-4">
                                <p className="text-base md:text-lg font-serif leading-relaxed text-white italic">
                                    {letter.is_encrypted ? (
                                        <DecryptedText
                                            id={letter.id}
                                            ciphertext={letter.encrypted_content}
                                            iv={letter.iv}
                                            onNeedRestore={() => window.dispatchEvent(new CustomEvent('orbit:restore-key'))}
                                        />
                                    ) : (
                                        `"${content}"`
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-black/40 border-t border-white/5 text-center">
                            <p className="text-[7px] text-rose-500/60 uppercase tracking-widest font-black">
                                {mode === 'sender' ? 'Vanishes after partner views' : 'Closing erases this whisper permanently'}
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
