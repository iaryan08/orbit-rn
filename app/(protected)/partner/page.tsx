"use client";

import { useOrbitStore } from '@/lib/store/global-store';
import { useAppMode } from '@/components/app-mode-context';
import { LunaraTabPartner } from '@/components/lunara/lunara-tab-partner';
import { LunaraHeader } from '@/components/lunara/lunara-header';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import { SoftPageLoader } from '@/components/soft-page-loader';


export default function LunaraPartnerPage() {
    const isNative = Capacitor.isNativePlatform();
    const storeState = useOrbitStore();
    const router = useRouter();

    if (!storeState.isInitialized) {
        return <SoftPageLoader className="pt-24 pb-12" />;
    }

    if (!storeState.profile?.couple_id) {
        // Render nothing, redirect handled by layout mostly, or we can push manually
        return null;
    }

    return (
        <div className={cn(
            "max-w-7xl mx-auto space-y-6 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12 px-6 md:px-8",
            isNative ? "pt-16" : ""
        )}>
            <LunaraHeader tab="partner" />
            <div className="min-h-[500px]">
                <LunaraTabPartner data={storeState} />
            </div>
        </div>
    );
}
