// Request deduplication utility to prevent duplicate API calls
// Useful for free-tier optimization on Vercel & Supabase

type PendingRequest = {
    promise: Promise<any>
    timestamp: number
}

const pendingRequests = new Map<string, PendingRequest>()
const CACHE_DURATION = 30000 // 30s - dedup window covers tab switches, re-renders, and hot mounts

/**
 * Deduplicates API requests by caching in-flight requests
 * If the same request is made while one is pending, returns the existing promise
 * @param key - Unique identifier for the request
 * @param fetcher - Function that returns a promise
 * @returns The result of the fetch operation
 */
export async function dedupedFetch<T>(
    key: string,
    fetcher: () => Promise<T>
): Promise<T> {
    const now = Date.now()
    const existing = pendingRequests.get(key)

    // If there's a pending request and it's recent, return it
    if (existing && now - existing.timestamp < CACHE_DURATION) {
        return existing.promise
    }

    // Create new request
    const promise = fetcher().finally(() => {
        // Clean up after request completes
        setTimeout(() => {
            const current = pendingRequests.get(key)
            if (current && current.promise === promise) {
                pendingRequests.delete(key)
            }
        }, CACHE_DURATION)
    })

    pendingRequests.set(key, { promise, timestamp: now })
    return promise
}

/**
 * Clears all pending requests (useful for testing or forced refresh)
 */
export function clearPendingRequests() {
    pendingRequests.clear()
}
