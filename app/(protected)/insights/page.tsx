"use client";
import { useEffect, useState } from 'react';
import { LunaraTabInsights } from '@/components/lunara/lunara-tab-insights';
import { LunaraHeader } from '@/components/lunara/lunara-header';
import { useRouter } from 'next/navigation';
// import { createClient } from '@/lib/supabase/client'; // FIREBASE
import { useOrbitStore } from '@/lib/store/global-store';
import { useAppMode } from '@/components/app-mode-context';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';
import { SoftPageLoader } from '@/components/soft-page-loader';

export default function LunaraInsightsPage() {
    const isNative = Capacitor.isNativePlatform();
    const { profile, isInitialized } = useOrbitStore();
    const router = useRouter();

    useEffect(() => {
        if (isInitialized && !profile?.couple_id) {
            router.replace('/dashboard');
        }
    }, [isInitialized, profile?.couple_id, router]);

    if (!isInitialized) {
        return <SoftPageLoader className="pt-24 pb-12" />;
    }

    if (!profile?.couple_id) return null;

    return (
        <div className={cn(
            "max-w-7xl mx-auto space-y-6 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12 px-6 md:px-8",
            isNative ? "pt-16" : ""
        )}>
            <LunaraHeader tab="insights" />
            <div className="min-h-[500px]">
                <LunaraTabInsights coupleId={profile.couple_id} />
            </div>
        </div>
    );
}
