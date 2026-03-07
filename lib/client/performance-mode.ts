'use client'

export type PerformanceMode = 'default' | 'lite'

function getStoredMode(): PerformanceMode {
    if (typeof window === 'undefined') return 'default'
    const raw = localStorage.getItem('orbit:perf_mode')
    return raw === 'lite' ? 'lite' : 'default'
}

export function detectPerformanceMode(): PerformanceMode {
    if (typeof window === 'undefined') return 'default'
    return getStoredMode()
}

export function applyPerformanceMode() {
    if (typeof document === 'undefined') return 'default' as PerformanceMode
    const mode = detectPerformanceMode()
    document.documentElement.setAttribute('data-performance', mode)
    if (mode === 'lite') {
        document.documentElement.classList.add('perf-lite')
        document.body.classList.add('perf-lite')
    } else {
        document.documentElement.classList.remove('perf-lite')
        document.body.classList.remove('perf-lite')
    }
    return mode
}

export function setPerformanceMode(mode: PerformanceMode) {
    if (typeof window === 'undefined') return mode
    localStorage.setItem('orbit:perf_mode', mode)
    return applyPerformanceMode()
}
