'use client'

import { Heart } from 'lucide-react'

export function OrbitLoading() {
    return (
        <div className="fixed inset-0 z-[100] bg-black">
            <div className="relative h-full w-full flex flex-col items-center justify-center px-6">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Heart className="h-11 w-11 sm:h-12 sm:w-12 md:h-14 md:w-14 text-rose-500/60 heart-outline-pulse" strokeWidth={2.2} />
                </div>
                <div className="w-full max-w-[860px] space-y-4 opacity-55">
                    <div className="h-6 w-52 rounded-full bg-white/8 animate-pulse" />
                    <div className="h-28 w-full rounded-3xl bg-white/6 border border-white/5 animate-pulse" />
                    <div className="h-4 w-80 rounded-full bg-white/6 animate-pulse" />
                    <div className="h-20 w-full rounded-3xl bg-white/5 border border-white/5 animate-pulse" />
                </div>
                <div className="mt-8 text-[11px] uppercase tracking-[0.36em] font-black text-rose-100/45 animate-pulse">
                    Entering Orbit
                </div>
            </div>
        </div>
    )
}
