'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const ConnectionSync = dynamic(() => import('@/components/connection-sync').then(mod => mod.ConnectionSync), {
    ssr: false
})

export function DeferredConnectionSync({ coupleId, userId, partnerId }: { coupleId: string; userId: string; partnerId?: string | null }) {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        const run = () => setReady(true)
        const idle = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined

        if (idle) {
            const id = idle(run, { timeout: 3000 })
            return () => {
                const cancel = (window as any).cancelIdleCallback as ((idleId: number) => void) | undefined
                if (cancel) cancel(id)
            }
        }

        const timer = window.setTimeout(run, 1200)
        return () => window.clearTimeout(timer)
    }, [])

    if (!ready) return null
    return <ConnectionSync coupleId={coupleId} userId={userId} partnerId={partnerId} />
}
