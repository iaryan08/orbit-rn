"use client";

import { Flame } from "lucide-react";
import { useEffect } from "react";

interface IntimacyAlertProps {
    profile?: any;
    partnerProfile?: any;
    couple?: any;
    isInitialized?: boolean;
    milestones?: any;
    cycleLogs?: any[];
    currentDateIST?: string;
    className?: string;
}

export function IntimacyAlert({
    profile,
    partnerProfile,
    couple,
    isInitialized,
    milestones,
    cycleLogs,
    currentDateIST,
    className
}: IntimacyAlertProps) {
    const today = currentDateIST;
    const pId = partnerProfile?.id;

    // Improved finding logic: handle ISO dates and check most recent log if today's is missing
    const pLog = cycleLogs?.find((l: any) => {
        if (l.user_id !== pId) return false;
        const logDate = l.log_date?.split('T')[0];
        return logDate === today;
    });

    const libido = pLog?.sex_drive?.toLowerCase();
    const isHighLibido = libido === 'high' || libido === 'very_high';
    const isVeryHigh = libido === 'very_high';

    useEffect(() => {
        if (!isHighLibido) return;
        if (typeof window === 'undefined' || !window.navigator?.vibrate) return;
        window.navigator.vibrate(isVeryHigh ? 40 : 20);
    }, [isHighLibido, isVeryHigh]);

    if (!isHighLibido) return null;

    const isPartnerMale = profile?.gender === 'female';
    const partnerName = partnerProfile?.first_name || partnerProfile?.display_name || (isPartnerMale ? 'him' : 'her');

    // Custom config based on libido level (Dark, Premium Reds)
    const alertConfig = isVeryHigh
        ? {
            title: "Maximum Passion Alert!",
            description: `You've completely overwhelmed ${partnerName}'s senses today.`,
            bgClass: "bg-gradient-to-br from-[#7a1228] via-[#3d0a14] to-[#0f0205]",
            iconSizeClass: "w-6 h-6",
            borderColor: "border-[#68142a]/30 shadow-xl shadow-rose-950/40",
            badgeBg: "bg-rose-900/40",
            iconBgShadow: "shadow-none",
            flameColor: "text-rose-400",
            shadowColor: ""
        }
        : {
            title: "Intense Passion Alert",
            description: `${partnerName} is feeling a deep physical pull towards you.`,
            bgClass: "bg-gradient-to-br from-[#8c3010] via-[#4a1808] to-[#120502]",
            iconSizeClass: "w-6 h-6",
            borderColor: "border-[#682414]/30 shadow-xl shadow-orange-950/40",
            badgeBg: "bg-orange-900/40",
            iconBgShadow: "shadow-none",
            flameColor: "text-orange-400",
            shadowColor: ""
        };

    return (
        <div
            className={`w-full h-auto min-h-[132px] sm:min-h-[138px] md:min-h-[120px] md:h-full md:flex-1 p-6 ${alertConfig.bgClass} border ${alertConfig.borderColor} flex flex-col md:flex-row items-center justify-center relative overflow-hidden group rounded-none ${className || ''}`}
        >
            <div className={`absolute inset-0 bg-black/10`} />

            <div className="relative z-10 flex w-full items-center gap-4 justify-start text-left">
                <div className="relative shrink-0">
                    <div
                        className="absolute inset-[-45%] rounded-full"
                        style={{
                            background: isVeryHigh
                                ? 'radial-gradient(circle, rgba(244,63,94,0.28) 0%, transparent 72%)'
                                : 'radial-gradient(circle, rgba(251,146,60,0.22) 0%, transparent 72%)'
                        }}
                    />
                    <div className={`p-3 rounded-full ${alertConfig.badgeBg} border ${alertConfig.borderColor} ${alertConfig.iconBgShadow} relative z-10`}>
                        <Flame className={`${alertConfig.iconSizeClass} ${alertConfig.flameColor} drop-shadow-[0_0_4px_currentColor]`} fill="currentColor" />
                    </div>
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-xl font-serif text-white tracking-tight leading-tight">
                        {alertConfig.title}
                    </h3>
                    <p className="text-white/90 italic font-medium text-[12px] sm:text-sm leading-snug break-words">
                        {alertConfig.description}
                    </p>
                </div>
            </div>
        </div>
    );
}
