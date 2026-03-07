"use client";

import { cn } from "@/lib/utils";

interface BlurredTextProps {
    className?: string;
    rows?: number;
    maxWidth?: string;
}

export function BlurredText({ className, rows = 1, maxWidth = "100%" }: BlurredTextProps) {
    return (
        <div className={cn("space-y-2 py-1", className)} style={{ maxWidth }}>
            {Array.from({ length: rows }).map((_, i) => (
                <div
                    key={i}
                    className={cn(
                        "h-[1em] bg-white/10 rounded-full filter blur-[6px] select-none pointer-events-none",
                        // Vary widths for a more "natural" look
                        rows > 1 && i === rows - 1 ? "w-[60%]" : "w-full"
                    )}
                    aria-hidden="true"
                />
            ))}
        </div>
    );
}

export function BlurredTitle({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                "h-[1.5em] w-[80%] bg-white/20 rounded-lg filter blur-[8px] select-none pointer-events-none mb-2",
                className
            )}
            aria-hidden="true"
        />
    );
}
