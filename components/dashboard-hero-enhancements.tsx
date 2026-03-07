'use client'

import { QuickCreateButtons } from '@/components/quick-create-buttons'
import { WeatherBadge } from '@/components/weather-badge'
import { MapPin } from 'lucide-react'

/**
 * No longer deferred — renders immediately.
 * The requestIdleCallback delay was causing CLS (content jumping in after 1-3s)
 * and contributing to LCP by holding back layout.
 */
export function DashboardHeroEnhancements({
    hasPartner,
    partnerProfile,
    coupleId,
    userLatitude
}: {
    hasPartner: boolean
    partnerProfile: any
    coupleId?: string | null
    userLatitude?: number | null
}) {
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                {hasPartner && partnerProfile && (
                    <WeatherBadge
                        lat={partnerProfile.latitude}
                        lon={partnerProfile.longitude}
                        city={partnerProfile.city || partnerProfile.display_name}
                    />
                )}
            </div>
            <QuickCreateButtons />
        </div>
    )
}
