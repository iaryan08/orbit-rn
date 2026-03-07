'use client'

import React from 'react'
import NextTopLoader from 'nextjs-toploader'
import { useAppMode } from './app-mode-context'

export function AmbientTopLoader() {
    const { mode } = useAppMode()

    // Use theme colors for the progress bar
    const color = mode === 'moon'
        ? '#fb7185' // Rose-400 for Moon
        : '#a855f7' // Purple-500 for Lunara

    return (
        <NextTopLoader
            color={color}
            initialPosition={0.08}
            crawlSpeed={200}
            height={3}
            crawl={true}
            showSpinner={false}
            easing="ease"
            speed={200}
            shadow={`0 0 10px ${color}, 0 0 5px ${color}`}
            zIndex={1600}
            showAtBottom={false}
        />
    )
}
