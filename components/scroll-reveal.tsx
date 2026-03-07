'use client'

import { ReactNode } from 'react'

interface ScrollRevealProps {
    children: ReactNode
    delay?: number
    className?: string
    once?: boolean
}

export function ScrollReveal({
    children,
    delay = 0,
    className = "",
    once = true
}: ScrollRevealProps) {
    return (
        <div className={className}>
            {children}
        </div>
    )
}
