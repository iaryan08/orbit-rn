"use client";

import { SectionHeader } from "@/components/section-header";

interface LunaraHeaderProps {
    tab: "dashboard" | "insights" | "partner";
}

export function LunaraHeader({ tab }: LunaraHeaderProps) {
    const title = tab === "dashboard" ? "Discover" : tab === "insights" ? "Discover" : "Partner";
    const label = tab === "dashboard" ? "Lunara Sync" : tab === "insights" ? "Wellness & Intimacy" : "Sync & Support";

    return (
        <SectionHeader
            title={title}
            label={label}
            className="text-center lg:text-left"
        />
    );
}

