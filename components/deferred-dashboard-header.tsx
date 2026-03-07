'use client'

import dynamic from 'next/dynamic'

const DashboardHeader = dynamic(
    () => import('@/components/dashboard-header').then(mod => mod.DashboardHeader),
    { ssr: false, loading: () => null }
)

interface DeferredDashboardHeaderProps {
    userName: string
    userAvatar?: string | null
    partnerName?: string | null
    daysTogetherCount?: number
    coupleId?: string | null
    partnerId?: string
    unreadCounts?: {
        memories: number
        letters: number
    }
    userId?: string
    user?: any
}

/**
 * Loads the header JS asynchronously (it's large and not needed for LCP).
 * Removed requestIdleCallback — the 1800ms synthetic delay was adding directly
 * to TBT because React was batching state updates during that blocked window.
 * next/dynamic with ssr:false already defers loading to after hydration.
 */
export function DeferredDashboardHeader(props: DeferredDashboardHeaderProps) {
    return <DashboardHeader {...props} />
}
