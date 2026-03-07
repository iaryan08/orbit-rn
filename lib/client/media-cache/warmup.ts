import { useEffect, useRef } from "react";
import { MediaCacheEngine } from "./engine";
import { hasStoredMediaPassphrase, decryptMediaBlob } from "@/lib/client/crypto-e2ee";
import { getPublicStorageUrl } from "@/lib/storage";
import { Capacitor } from "@capacitor/core";
import { decodeMediaToken } from "@/lib/media-tokens";
import { MediaBlobCache } from "../media-cache";

/**
 * MCE Background Warmup Manager
 * Scans the current list of displayed memories and downloads their media
 * silently in the background, one by one.
 */

// Global queue to prevent multiple component mounts from spawning parallel queues
let isWarmingUp = false;
let warmupQueue: string[] = [];

export function useMediaWarmup(memories: any[]) {
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    const userProfileId = typeof window !== 'undefined' ? localStorage.getItem('orbit:auth:user') ? JSON.parse(localStorage.getItem('orbit:auth:user')!)?.id : null : null;
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        if (!isNative || !userProfileId || !hasStoredMediaPassphrase() || memories.length === 0) return;

        /**
         * The Warmup Task
         */
        const runWarmup = async () => {
            if (isWarmingUp || warmupQueue.length === 0) return;
            isWarmingUp = true;

            const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '').replace(/\/$/, '');

            while (warmupQueue.length > 0) {
                const src = warmupQueue.shift();
                if (!src) continue;

                try {
                    // Extract Identity and Token
                    let effectiveIv = "";
                    let tokenPayload: any = null;
                    let isEncrypted = false;

                    if (src.includes('/api/media/view/')) {
                        const token = src.split('/api/media/view/')[1]?.split('?')[0] || '';
                        if (token) {
                            tokenPayload = decodeMediaToken(token);
                            if (tokenPayload?.enc === '1') isEncrypted = true;
                            if (tokenPayload?.iv) effectiveIv = String(tokenPayload.iv);
                        }
                    } else if (src.includes('enc=1') || /[?&]enc=1(?:&|$)/.test(src)) {
                        isEncrypted = true;
                        try {
                            const params = new URL(src, 'http://x').searchParams;
                            effectiveIv = params.get('iv') || '';
                        } catch { }
                    }

                    if (!isEncrypted) continue;

                    // Unified Cache Key
                    const cacheKey = MediaBlobCache.generateKey(src, effectiveIv, tokenPayload?.path || "");

                    // 1. Check RAM cache first
                    if (MediaBlobCache.get(cacheKey) || MediaBlobCache.getPromise(cacheKey)) continue;

                    // 2. Check Disk cache
                    const existing = await MediaCacheEngine.readBlob(userProfileId, cacheKey);
                    if (existing) {
                        // Optimistically populate RAM cache from disk
                        const objectUrl = URL.createObjectURL(existing.blob);
                        MediaBlobCache.setPromise(cacheKey, Promise.resolve(objectUrl));
                        continue;
                    }

                    // 3. Download it
                    let targetUrl = src;
                    if (tokenPayload?.path) {
                        targetUrl = getPublicStorageUrl(tokenPayload.path, tokenPayload.bucket || 'memories', 'none') || src;
                    }

                    // Native MUST use absolute proxy URL
                    if (targetUrl.startsWith('/')) {
                        targetUrl = `${apiBase}${targetUrl}`;
                    }

                    const decryptionTask = (async () => {
                        const res = await fetch(targetUrl);
                        if (!res.ok) throw new Error("Fetch failed");

                        const blob = await res.blob();
                        const serverDecrypted = res.headers.get('x-orbit-media-decrypted') === '1';
                        let decryptedBlob: Blob = blob;

                        if (!serverDecrypted) {
                            let fileId = tokenPayload?.path || "";
                            if (!fileId) {
                                try {
                                    const urlObj = new URL(src, window.location.origin);
                                    fileId = urlObj.pathname.replace(/^\/api\/media\/view\//, "").replace(/^\/+/g, "");
                                } catch {
                                    fileId = src.replace(/^\/+/g, "");
                                }
                            }
                            const baseSalt = String(fileId).split('/').pop()?.split('?')[0] || fileId;
                            const result = await decryptMediaBlob(blob, baseSalt, effectiveIv, blob.type || 'application/octet-stream');
                            if (result) decryptedBlob = result;
                        }

                        // Persistent Disk write
                        await MediaCacheEngine.writeBlob(userProfileId, cacheKey, decryptedBlob, src);

                        return URL.createObjectURL(decryptedBlob);
                    })();

                    MediaBlobCache.setPromise(cacheKey, decryptionTask);

                    // Throttle the loop slightly
                    await new Promise(r => setTimeout(r, 800));

                } catch (e) {
                    console.warn("[Warmup] Failed to precache:", src);
                }
            }

            isWarmingUp = false;
        };

        // Enqueue visible/upcoming images
        // We only warm up images that are on the screen or just below it
        const enqueueMemory = (memory: any) => {
            if (memory.image_urls && memory.image_urls.length > 0) {
                const src = memory.image_urls[0];
                if (!warmupQueue.includes(src)) {
                    warmupQueue.push(src);
                    if (!isWarmingUp) runWarmup();
                }
            }
        };

        const observedElements = document.querySelectorAll('.orbit-media-reveal');

        observerRef.current = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Try to map DOM node to memory ID
                    const img = entry.target as HTMLImageElement;
                    if (img.src && !img.src.startsWith('blob:')) {
                        if (!warmupQueue.includes(img.src)) {
                            warmupQueue.push(img.src);
                            if (!isWarmingUp) runWarmup();
                        }
                    }
                }
            });
        }, { rootMargin: '800px' }); // Pre-fetch 800px ahead

        observedElements.forEach(el => observerRef.current?.observe(el));

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };

    }, [memories, isNative, userProfileId]);
}
