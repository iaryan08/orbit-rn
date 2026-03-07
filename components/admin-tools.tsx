'use client'

import { useState } from 'react'
import { Send, Terminal, Link as LinkIcon, ExternalLink } from 'lucide-react'
import { sendNotification } from '@/lib/client/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

interface AdminToolsProps {
    partnerId: string
    userId: string
}

export function AdminTools({ partnerId, userId }: AdminToolsProps) {
    const [message, setMessage] = useState('')
    const [url, setUrl] = useState('/dashboard')
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    const handleSend = async () => {
        if (!message.trim()) return

        setIsLoading(true)
        try {
            const result = await sendNotification({
                recipientId: partnerId,
                actorId: userId,
                type: 'announcement',
                title: 'Admin Notification',
                message: message,
                actionUrl: url
            })

            if (result.success) {
                toast({
                    title: 'Notification sent! 🚀',
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
        <div className="space-y-6">
            <div className="space-y-2">
                <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-rose-400" />
                    Feature Status
                </h3>
                <div className="glass-card p-6">
                    <ul className="grid gap-3">
                        {[
                            { name: 'Heartbeat Sync', status: 'Active', color: 'bg-emerald-500' },
                            { name: 'Live Location', status: 'Active', color: 'bg-emerald-500' },
                            { name: 'Mood Sharing', status: 'Active', color: 'bg-emerald-500' },
                            { name: 'Love Letters', status: 'Active', color: 'bg-emerald-500' },
                            { name: 'Memories', status: 'Active', color: 'bg-emerald-500' },
                            { name: 'Lunara Cycle', status: 'Active', color: 'bg-emerald-500' },
                        ].map((feature) => (
                            <li key={feature.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                                <span className="text-rose-100 font-medium">{feature.name}</span>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${feature.color} shadow-[0_0_8px_rgba(16,185,129,0.5)]`} />
                                    <span className="text-xs uppercase tracking-wider text-white/50">{feature.status}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="space-y-2">
                <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                    <Send className="w-5 h-5 text-rose-400" />
                    Send Notification
                </h3>
                <div className="glass-card p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-rose-200/70">Message</label>
                        <Input
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type your notification message..."
                            className="bg-black/20 border-white/10 focus-visible:ring-rose-500/50"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-rose-200/70 flex items-center gap-2">
                            Action URL <LinkIcon className="w-3 h-3" />
                        </label>
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="/dashboard"
                            className="bg-black/20 border-white/10 focus-visible:ring-rose-500/50 font-mono text-xs"
                        />
                        <p className="text-[10px] text-white/40">
                            The notification will link to this URL when clicked.
                        </p>
                    </div>

                    <Button
                        className="w-full btn-rosy"
                        onClick={handleSend}
                        disabled={isLoading || !message.trim()}
                    >
                        {isLoading ? 'Sending...' : 'Send Notification'}
                    </Button>
                </div>
            </div>

            <div className="flex justify-center pt-8">
                <Link href="/dashboard" className="text-rose-300 hover:text-rose-200 flex items-center gap-2 text-sm transition-colors">
                    <ExternalLink className="w-4 h-4" />
                    Back to Dashboard
                </Link>
            </div>
        </div>
    )
}
