'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

const NotificationBell = dynamic(
    () => import('@/components/notification-bell').then(mod => mod.NotificationBell),
    { ssr: false }
)

export function DeferredNotificationBell({ className }: { className?: string }) {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        setReady(true)
    }, [])

    if (!ready) {
        return (
            <div className={cn('relative text-purple-200/70', className)}>
                <Bell className="w-5 h-5" />
            </div>
        )
    }

    return <NotificationBell className={className} />
}
