'use client'

import { useOrbitStore } from '@/lib/store/global-store'
import { SharedBucketList } from '@/components/shared-bucket-list'
import { OnThisDay } from '@/components/on-this-day'
import { DailyContent as DailyContentUI } from '@/components/daily-content'
import { getTodayIST } from '@/lib/utils'

function hasContent(value: unknown) {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
}

function getValidOnThisDay(data: { memories: any[]; milestones: any[] }) {
    const today = getTodayIST()
    const [, todayMonth, todayDay] = today.split('-').map(Number)

    const normalizeDate = (value: any): Date | null => {
        if (!value) return null
        const raw = String(value)
        const parsed = raw.includes('T') ? new Date(raw) : new Date(`${raw}T12:00:00`)
        if (Number.isNaN(parsed.getTime())) return null
        return parsed
    }

    const isSameMonthDay = (value: any) => {
        const dt = normalizeDate(value)
        if (!dt) return false
        return (dt.getMonth() + 1) === todayMonth && dt.getDate() === todayDay
    }

    const memories = (data.memories || []).filter((m: any) =>
        (hasContent(m?.title) || hasContent(m?.description) || hasContent(m?.image_urls)) &&
        isSameMonthDay(m?.memory_date || m?.created_at)
    )

    // Milestones might be a Record (from consolidated) or an Array (from individual fallback)
    const milestoneSource = Array.isArray(data.milestones)
        ? data.milestones
        : Object.values(data.milestones || {})

    const milestones = milestoneSource.filter((m: any) =>
        (hasContent(m?.category) || hasContent(m?.content_user1) || hasContent(m?.content_user2)) &&
        (isSameMonthDay(m?.milestone_date) || isSameMonthDay(m?.date_user1) || isSameMonthDay(m?.date_user2))
    )

    return { memories, milestones }
}

export function BucketListWrapper({ coupleId }: { coupleId: string }) {
    const bucketList = useOrbitStore(state => state.bucketList)

    return (
        <div className="h-full lg:col-span-2">
            <SharedBucketList initialItems={bucketList} />
        </div>
    )
}

export function OnThisDayWrapper({ coupleId, partnerName, daysTogether = 0 }: { coupleId: string, partnerName: string, daysTogether?: number }) {
    const memories = useOrbitStore(state => state.memories)
    const milestonesRecord = useOrbitStore(state => state.milestones)

    // Ensure milestones is always an array for getValidOnThisDay
    const milestonesArray = Array.isArray(milestonesRecord)
        ? milestonesRecord
        : Object.values(milestonesRecord || {})

    const filtered = getValidOnThisDay({ memories, milestones: milestonesArray })

    return (
        <div className="h-full lg:col-span-2">
            <OnThisDay
                memories={filtered.memories}
                milestones={filtered.milestones}
                partnerName={partnerName}
                daysTogether={daysTogether}
                coupleId={coupleId}
            />
        </div>
    )
}

export function CoupleMomentsWrapper({ coupleId, partnerName, daysTogether = 0 }: { coupleId: string, partnerName: string, daysTogether?: number }) {
    const memories = useOrbitStore(state => state.memories)
    const milestonesRecord = useOrbitStore(state => state.milestones)
    const bucketList = useOrbitStore(state => state.bucketList)

    const milestonesArray = Array.isArray(milestonesRecord)
        ? milestonesRecord
        : Object.values(milestonesRecord || {})

    const onThisDay = getValidOnThisDay({ memories, milestones: milestonesArray })

    return (
        <>
            <div className="h-full lg:col-span-2">
                <OnThisDay
                    memories={onThisDay.memories}
                    milestones={onThisDay.milestones}
                    partnerName={partnerName}
                    daysTogether={daysTogether}
                    coupleId={coupleId}
                />
            </div>
            <div className="h-full lg:col-span-2">
                <SharedBucketList initialItems={bucketList} />
            </div>
        </>
    )
}

export function DailyContentWrapper() {
    return (
        <div className="lg:col-span-2 h-full">
            <DailyContentUI />
        </div>
    )
}

export function DashboardSkeleton({ className }: { className?: string }) {
    return (
        <div className={`rounded-3xl bg-white/5 animate-pulse overflow-hidden relative ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/[0.02]" />
            <div className="p-6 space-y-4">
                <div className="h-4 w-1/3 bg-white/10 rounded-full" />
                <div className="h-8 w-2/3 bg-white/10 rounded-full" />
                <div className="h-32 w-full bg-white/5 rounded-2xl" />
            </div>
        </div>
    )
}
