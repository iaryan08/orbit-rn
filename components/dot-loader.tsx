import { cn } from "@/lib/utils"

interface DotLoaderProps {
    className?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    color?: 'white' | 'rose' | 'muted'
}

export function DotLoader({ className, size = 'md', color = 'white' }: DotLoaderProps) {
    const sizeClasses = {
        sm: 'gap-1',
        md: 'gap-1.5',
        lg: 'gap-2.5',
        xl: 'gap-4',
    }

    const dotClasses = {
        sm: 'w-1 h-1',
        md: 'w-1.5 h-1.5',
        lg: 'w-2.5 h-2.5',
        xl: 'w-4 h-4',
    }

    const colorClasses = {
        white: 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]',
        rose: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]',
        muted: 'bg-white/20',
    }

    return (
        <div className={cn("flex items-center justify-center h-10 w-full", sizeClasses[size], className)}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes dot-pulse {
                    0%, 100% { transform: scale(0.6); opacity: 0.35; }
                    50% { transform: scale(1.1); opacity: 1; }
                }
                .dot-anim {
                    animation: dot-pulse 1.4s ease-in-out infinite;
                }
            `}} />
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className={cn(
                        "rounded-full dot-anim",
                        dotClasses[size],
                        colorClasses[color]
                    )}
                    style={{ animationDelay: `${i * 0.16}s` }}
                />
            ))}
        </div>
    )
}
