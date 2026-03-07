'use client'

import { useOrbitStore } from '@/lib/store/global-store'
import { PartnerOnlineDot } from './partner-online-dot'

export function PartnerNamePresence({
    hasPartner,
    partnerProfile,
    coupleId,
    userId,
}: {
    hasPartner: boolean
    partnerProfile: any
    coupleId?: string | null
    userId?: string | null
}) {
    if (!hasPartner) {
        return (
            <p className="text-rose-100/60 text-[10px] md:text-[12px] tracking-[0.1em] font-medium whitespace-nowrap">
                Waiting for partner
            </p>
        )
    }

    const getPartnerDisplayName = useOrbitStore(state => state.getPartnerDisplayName);
    const partnerName = getPartnerDisplayName();

    return (
        <div className="flex flex-col items-center md:items-start text-center md:text-left w-full">
            <div className="text-rose-100/60 text-[10px] md:text-[12px] tracking-[0.1em] font-medium whitespace-nowrap flex flex-row items-baseline">
                <span className="font-serif italic mr-1.5 text-[11px] md:text-[13px] relative top-[2px]">Connected with</span>
                <span className="font-serif italic text-[18px] md:text-[22px] text-rose-100 tracking-[0.1em] leading-none mb-[-2px]">
                    {partnerName}
                </span>
            </div>
        </div>
    )
}
