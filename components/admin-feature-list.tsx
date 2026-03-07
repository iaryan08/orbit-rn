'use client'

import { useState } from 'react'
import { Send, Terminal } from 'lucide-react'
import { sendNotification } from '@/lib/client/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface AdminFeatureListProps {
    partnerId: string
    userId: string
}

export function AdminFeatureList({ partnerId, userId }: AdminFeatureListProps) {
    const [message, setMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const { toast } = useToast()

    const handleSend = async () => {
        if (!message.trim()) return

        setIsLoading(true)
        try {
            const result = await sendNotification({
                recipientId: partnerId,
                actorId: userId,
                type: 'announcement', // Using generic type
                title: 'Admin Notification',
                message: message,
                actionUrl: '/dashboard'
            })

            if (result.success) {
                toast({
                    title: 'Notification sent!',
                })
                setMessage('')
            } else {
                toast({
                    title: 'Failed to send notification',
                    variant: 'destructive',
                })
            }
        } catch (error) {
            toast({
                title: 'Something went wrong',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="mt-2 text-xs text-rose-200/60">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 hover:text-rose-200 transition-colors uppercase tracking-widest text-[10px]"
            >
                <Terminal className="w-3 h-3" />
                <span>Dev / Features</span>
            </button>

            {isOpen && (
                <div className="mt-2 p-3 bg-black/20 backdrop-blur-sm rounded-lg border border-white/5 space-y-3 max-w-xs animate-in fade-in slide-in-from-top-2">
                    {/* Feature List */}
                    <div className="space-y-1">
                        <h4 className="font-bold text-rose-200 uppercase tracking-wider text-[10px] mb-1">Active Features</h4>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px] text-rose-100/70 ml-1">
                            <li>Real-time Heartbeat Sync</li>
                            <li>Live Location Updates</li>
                            <li>Instant Mood Sharing</li>
                            <li>Love Letter Delivery</li>
                        </ul>
                    </div>

                    {/* Admin Notification */}
                    <div className="space-y-2 border-t border-white/10 pt-2">
                        <h4 className="font-bold text-rose-200 uppercase tracking-wider text-[10px]">Send Notification</h4>
                        <div className="flex gap-2">
                            <Input
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Message..."
                                className="h-7 text-[10px] bg-white/5 border-white/10 focus-visible:ring-rose-500/50"
                            />
                            <Button
                                size="sm"
                                className="h-7 w-7 p-0 bg-rose-500 hover:bg-rose-600"
                                onClick={handleSend}
                                disabled={isLoading || !message.trim()}
                            >
                                <Send className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
