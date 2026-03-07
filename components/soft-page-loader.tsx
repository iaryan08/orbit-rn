'use client'

import { cn } from '@/lib/utils'

export function SoftPageLoader({
    className,
    label = 'Entering Orbit'
}: {
    className?: string
    label?: string
}) {
    return (
        <div className={cn("w-full min-h-[52vh] flex items-center justify-center px-6", className)}>
            <div className="w-full max-w-3xl space-y-4 opacity-60">
                <div className="h-5 w-44 rounded-full bg-white/8 animate-pulse" />
                <div className="h-24 w-full rounded-3xl border border-white/5 bg-white/6 animate-pulse" />
                <div className="h-4 w-64 rounded-full bg-white/7 animate-pulse" />
                <div className="h-16 w-full rounded-2xl border border-white/5 bg-white/5 animate-pulse" />
                <p className="pt-2 text-[10px] uppercase tracking-[0.34em] font-black text-white/30">{label}</p>
            </div>
        </div>
    )
}

