'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'

interface AnnouncementModalProps {
    isOpen: boolean
    onClose: () => void
    notification: {
        title: string
        message: string
        metadata?: any
    } | null
}

export function AnnouncementModal({ isOpen, onClose, notification }: AnnouncementModalProps) {
    if (!notification) return null

    // Parse bullet points from message
    const lines = notification.message.split('\n').filter(line => line.trim())
    const bulletPoints = lines.filter(line => line.trim().startsWith('•'))
    const mainMessage = lines.find(line => !line.trim().startsWith('•') && line.length > 20) || ''

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent showCloseButton={false} className="bg-[#0f0510] border-white/10 max-w-[90vw] sm:max-w-md overflow-hidden shadow-none rounded-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-rose-500 to-purple-600" />

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <DialogHeader className="space-y-4 pt-2">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400/20 to-rose-500/20 flex items-center justify-center border border-white/10"
                    >
                        <Sparkles className="w-8 h-8 text-amber-300" />
                    </motion.div>

                    <DialogTitle className="text-2xl font-bold text-center text-white tracking-tight">
                        {notification.title}
                    </DialogTitle>

                    {mainMessage && (
                        <DialogDescription className="text-center text-white/70 text-sm leading-relaxed">
                            {mainMessage}
                        </DialogDescription>
                    )}
                </DialogHeader>

                {bulletPoints.length > 0 && (
                    <div className="space-y-2 py-4">
                        {bulletPoints.map((point, index) => {
                            // Remove the bullet and any leading emoji/title pattern
                            const cleanText = point.replace(/^•\s*/, '').replace(/^[^\w\s]+\s*:?\s*/, '').trim()

                            return (
                                <div
                                    key={index}
                                    className="flex gap-3 items-start"
                                >
                                    <span className="text-white/40 text-xs mt-1">•</span>
                                    <p className="text-sm text-white/80 leading-relaxed flex-1">{cleanText}</p>
                                </div>
                            )
                        })}
                    </div>
                )}

                <Button
                    onClick={onClose}
                    className="w-full btn-rosy h-11 text-xs font-black uppercase tracking-widest mt-2"
                >
                    Got it!
                </Button>
            </DialogContent>
        </Dialog>
    )
}
