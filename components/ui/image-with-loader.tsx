'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ImageWithLoaderProps {
    src: string
    alt: string
    className?: string
    containerClassName?: string
}

export function ImageWithLoader({
    src,
    alt,
    className,
    containerClassName
}: ImageWithLoaderProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [showLoader, setShowLoader] = useState(false)
    const [currentSrc, setCurrentSrc] = useState(src)

    // Reset loading state when src changes
    useEffect(() => {
        if (src !== currentSrc) {
            setIsLoading(true)
            setShowLoader(false)
            setCurrentSrc(src)
        }
    }, [src, currentSrc])

    useEffect(() => {
        if (!isLoading) {
            setShowLoader(false)
            return
        }
        const timer = window.setTimeout(() => setShowLoader(true), 5)
        return () => window.clearTimeout(timer)
    }, [isLoading])

    return (
        <div className={cn("relative w-full h-full flex items-center justify-center overflow-hidden", containerClassName)}>
            {isLoading && showLoader && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-[2px]">
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s] shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                        <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.15s] shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                        <div className="w-2 h-2 bg-rose-500 rounded-full animate-bounce shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                    </div>
                </div>
            )}
            <img
                src={src}
                alt={alt}
                className={cn("w-full h-full", className, "transition-all duration-500 ease-out", isLoading ? "opacity-0 scale-95 blur-sm" : "opacity-100 scale-100 blur-[0.35px]")}
                onLoad={() => setIsLoading(false)}
                draggable={false}
            />
        </div>
    )
}
