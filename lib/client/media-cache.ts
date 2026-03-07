"use client";

/**
 * High-Performance Client-Side Media Cache
 * 
 * This singleton stores ObjectURLs for decrypted media to prevent redundant
 * re-fetches and re-decryptions as the user navigates between a Card, 
 * a Modal, and Fullscreen views.
 */

// Key format: "src|iv|salt"
const blobCache = new Map<string, string>();
const promiseCache = new Map<string, Promise<string>>();

// To prevent RAM explosion on long scrolls, we enforce a strict max item limit.
// 50 images * ~2MB decrypted blob = ~100MB RAM max footprint, very safe for native.
const MAX_CACHE_ITEMS = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.() ? 40 : 100;

function enforceCacheLimit() {
    if (blobCache.size > MAX_CACHE_ITEMS) {
        // Map iterates in insertion order, so the first item is the oldest.
        const firstKey = blobCache.keys().next().value;
        if (firstKey) {
            const url = blobCache.get(firstKey);
            if (url) URL.revokeObjectURL(url);
            blobCache.delete(firstKey);
            promiseCache.delete(firstKey);
        }
    }
}

export const MediaBlobCache = {
    get: (key: string) => blobCache.get(key),

    getPromise: (key: string) => promiseCache.get(key),

    setPromise: (key: string, promise: Promise<string>) => {
        promiseCache.set(key, promise);
        promise.then(url => {
            blobCache.set(key, url);
            enforceCacheLimit();
            // We keep the promise in case another component 
            // requests the same key before the first one finishes.
        }).catch(() => {
            promiseCache.delete(key);
        });
    },

    /**
     * Generate a unique key for an encoded resource.
     * We prioritize salt (the file path) and iv because they are the 
     * stable identities for E2EE content, unlike the proxy URL which might change.
     */
    generateKey: (src: string, iv?: string, salt?: string) => {
        if (salt || src.includes('/api/media/view/')) {
            const cleanSalt = (salt || "").replace(/^\/+/, '').split('?')[0];
            const cleanIv = (iv || "").trim();
            // If we have a salt but no IV, the key is still unique to the file
            return `e2ee|${cleanSalt}|${cleanIv}`;
        }
        return `plain|${src}`;
    },

    /**
     * Clear specific or all cache entries.
     */
    clear: () => {
        blobCache.forEach(url => URL.revokeObjectURL(url));
        blobCache.clear();
        promiseCache.clear();
    }
};

// Expose to window for debugging if needed
if (typeof window !== 'undefined') {
    (window as any).__mediaCache = MediaBlobCache;
}
