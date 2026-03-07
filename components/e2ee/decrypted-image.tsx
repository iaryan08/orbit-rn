"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decryptMediaBlob, hasStoredMediaPassphrase } from "@/lib/client/crypto-e2ee";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { decodeMediaToken } from "@/lib/media-tokens";
import { buildPrivateMediaUrl, getPublicStorageUrl, isVideoUrl } from "@/lib/storage";
import { EncryptedLockedCard } from "./encrypted-locked-card";
import { getCachedAccessToken } from "@/lib/client/get-user";
import { MediaBlobCache } from "@/lib/client/media-cache";
import { MediaCacheEngine } from "@/lib/client/media-cache/engine";
import { DotLoader } from "@/components/ui/dot-loader";
import { useOrbitStore } from "@/lib/store/global-store";
import { orbitFetch } from "@/lib/client/network";
import { FEATURES } from "@/lib/client/feature-flags";


const MEDIA_FAIL_COOLDOWN_MS = 45000;
const recentMediaFailures = new Map<string, number>();
const plainMediaInFlight = new Map<string, Promise<Blob | null>>();

interface DecryptedImageProps {
    src?: string | null;
    alt: string;
    className?: string;
    fill?: boolean;
    sizes?: string;
    priority?: boolean;
    quality?: number;
    draggable?: boolean;
    isEncrypted?: boolean;
    iv?: string;
    prefix?: string | null;
    onNeedRestore?: () => void;
    onStatusChange?: (status: 'loading' | 'success' | 'locked' | 'decrypt_error' | 'fetch_error' | 'unencrypted') => void;
    width?: number;
    height?: number;
    loadingSize?: 'sm' | 'md' | 'lg' | 'xl';
    bucket?: string;
    onClick?: (e: React.MouseEvent) => void;
}

/** Rendered when FEATURES.E2EE_ENABLED is false — plain proxied image, zero decrypt overhead */
function PlainDecryptedImage({ src, alt, className, fill, sizes, priority, quality, draggable, width, height, prefix, bucket }: DecryptedImageProps) {
    if (!src) return <div className={cn("bg-neutral-900/10", className)} />;
    const resolvedSrc = getPublicStorageUrl(src, bucket || 'memories', 'md', prefix);
    if (!resolvedSrc) return <div className={cn("bg-neutral-900/10", className)} />;

    if (isVideoUrl(src)) {
        return <video src={resolvedSrc} className={className} autoPlay loop muted playsInline />;
    }
    if (fill) {
        return <Image src={resolvedSrc} alt={alt} fill className={className} sizes={sizes} priority={priority} quality={quality} draggable={draggable} unoptimized />;
    }
    return <Image src={resolvedSrc} alt={alt} className={className} width={width || 800} height={height || 600} sizes={sizes} priority={priority} quality={quality} draggable={draggable} unoptimized />;
}

export function DecryptedImage(props: DecryptedImageProps) {
    // When E2EE is disabled, delegate to the plain renderer (no hooks violation)
    if (!FEATURES.E2EE_ENABLED) return <PlainDecryptedImage {...props} />;

    // Destructure for use in the full decrypt pipeline below
    const { src, alt, className, fill, sizes, priority, quality, draggable, isEncrypted, iv, prefix, onNeedRestore, onStatusChange, width, height, loadingSize = 'md', bucket } = props;

    const isNativeRuntime = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    const currentUserId = useOrbitStore((state: any) => state.profile?.id);
    const sanitizeMediaToken = (token: string) => token.replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const nativeAccessToken = useMemo(() => {
        if (!isNativeRuntime) return null;
        return getCachedAccessToken();
    }, [isNativeRuntime]);
    const tokenPayload = useMemo(() => {

        if (!src || typeof src !== 'string' || !src.includes('/api/media/view/')) return null;
        const token = sanitizeMediaToken(src.split('/api/media/view/')[1]?.split('?')[0] || '');
        if (!token) return null;
        return decodeMediaToken(token);
    }, [src]);

    const isEncryptedExplicit = useMemo(() => {
        if (!src || typeof src !== 'string') return false;
        if (tokenPayload && Object.prototype.hasOwnProperty.call(tokenPayload, 'enc')) {
            return tokenPayload.enc === '1';
        }
        if (src.includes('enc=1') || /[?&]enc=1(?:&|$)/.test(src)) return true;
        return !!isEncrypted;
    }, [isEncrypted, src, tokenPayload]);

    // ─────────────────────────────────────────────────────────────────────────────
    // NEW: Sync Cache Initialization (Zero-Flicker UX)
    // ─────────────────────────────────────────────────────────────────────────────
    const effectiveIv = useMemo(() => {
        if (iv) return iv;
        if (tokenPayload?.iv) return String(tokenPayload.iv);
        // Fallback: extract from URL params if string contains it
        if (typeof src === 'string' && src.includes('iv=')) {
            try { return new URL(src, 'http://x').searchParams.get('iv') || ''; } catch { return ''; }
        }
        return '';
    }, [iv, tokenPayload, src]);

    const cacheKey = useMemo(() => {
        if (!src) return "";
        return MediaBlobCache.generateKey(src, effectiveIv, tokenPayload?.path || "");
    }, [src, effectiveIv, tokenPayload]);

    const [status, setStatus] = useState<'loading' | 'success' | 'locked' | 'decrypt_error' | 'fetch_error' | 'unencrypted'>(() => {
        if (!src) return 'fetch_error';
        const cached = cacheKey ? MediaBlobCache.get(cacheKey) : null;
        if (cached) return 'success';
        return isEncryptedExplicit ? 'loading' : 'unencrypted';
    });

    const [decryptedSrc, setDecryptedSrc] = useState<string>(() => {
        if (!cacheKey) return '';
        return MediaBlobCache.get(cacheKey) || '';
    });

    const [unencryptedSrc, setUnencryptedSrc] = useState<string>('');
    const [plainCachedSrc, setPlainCachedSrc] = useState<string>('');
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const isVideo = useMemo(() => isVideoUrl(src), [src]);
    const [plainAttempt, setPlainAttempt] = useState(0);
    const [isVisible, setIsVisible] = useState(priority || false);
    const [showLoader, setShowLoader] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const blobRef = useRef<string | null>(null);

    // Reset loading state when src changes
    useEffect(() => {
        setIsImageLoaded(false);
    }, [src]);

    // Intersection Observer fallback: Only load when visible (unless priority=true)
    useEffect(() => {
        if (priority || isVisible) return;

        // 1.5s fallback to force load even if IntersectionObserver fails
        const fallback = setTimeout(() => {
            if (!isVisible) setIsVisible(true);
        }, 1500);

        if (!containerRef.current) return () => clearTimeout(fallback);

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                clearTimeout(fallback);
                setIsVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '250px', threshold: 0 });

        observer.observe(containerRef.current);
        return () => {
            observer.disconnect();
            clearTimeout(fallback);
        };
    }, [priority, isVisible]);

    useEffect(() => {
        onStatusChange?.(status);

        // DELAYED LOADER: only show if loading persists (prevents flash for disk/RAM cache)
        let timer: any = null;
        if (status === 'loading' && !isImageLoaded) {
            timer = setTimeout(() => setShowLoader(true), 75);
        } else if (status === 'success' && !isImageLoaded) {
            // Even in success state, we might wait for the img element to paint. 
            // 75ms allows native IndexedDB (which takes ~15-30ms) to resolve without causing screen flicker.
            timer = setTimeout(() => setShowLoader(true), 75);
        } else {
            setShowLoader(false);
        }

        return () => timer && clearTimeout(timer);
    }, [status, isImageLoaded, onStatusChange]);

    const directUrl = useMemo(() => {
        if (!src || typeof src !== 'string') return null;

        if (tokenPayload?.path) {
            if (tokenPayload.enc === '1') return src; // Keep proxy for E2EE content

            // Process through global getPublicStorageUrl which knows to maintain 
            // the proxy for sensitive buckets like 'memories'.
            return getPublicStorageUrl(tokenPayload.path, tokenPayload.bucket || 'memories', 'none', prefix || undefined) || src;
        }

        // Bare path or absolute URL: use global getPublicStorageUrl
        return getPublicStorageUrl(src, bucket || 'memories', 'none', prefix || undefined) || src;
    }, [src, tokenPayload, prefix, bucket]);

    const plainCandidates = useMemo(() => {
        if (!src) return [];
        const base = (directUrl || src).trim();
        const values: string[] = [base];
        const isApiRoute = /^\/api\/media\/view(?:\/|\?|$)/.test(src);
        const isAbsApiRoute = /https?:\/\/.+\/api\/media\/view(?:\/|\?|$)/.test(src);

        const pushUnique = (value: string) => {
            if (!value) return;
            if (!values.includes(value)) values.push(value);
        };

        // For web, API route can be a useful fallback when direct CDN/storage flakes.
        if (!isNativeRuntime && src !== base && isApiRoute) {
            pushUnique(src);
        }

        // On native: if the primary URL is CDN (which may 404 for old images),
        // fall back to the CF-proxy media route (absolute URL) which proxies from Supabase storage.
        if (isNativeRuntime) {
            const apiBase = (
                process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || ''
            ).replace(/\/$/, '');

            if (base.includes('workers.dev') && !isAbsApiRoute) {
                // CDN URL — extract bucket/path and build a CF-proxy media URL
                try {
                    const u = new URL(base);
                    const parts = u.pathname.replace(/^\//, '').split('/');
                    if (parts.length >= 2) {
                        const fbBucket = parts[0];
                        const fbPath = parts.slice(1).join('/');
                        const proxyUrl = buildPrivateMediaUrl(fbBucket, fbPath);
                        // buildPrivateMediaUrl already returns absolute on native
                        pushUnique(proxyUrl);
                    }
                } catch { /* ignore */ }
            } else if (isApiRoute && !isAbsApiRoute) {
                // Relative /api/... URL — make it absolute via CF proxy
                pushUnique(`${apiBase}${src.startsWith('/') ? '' : '/'}${src}`);
            }
        }

        // Legacy plain paths (e.g. "123.webp"): add same-origin media API fallback.
        if (!isApiRoute && !isAbsApiRoute && !/^https?:\/\//i.test(src) && !src.startsWith('/')) {
            let path = src;
            if (prefix && !path.includes('/')) path = `${prefix}/${path}`;
            if (!isNativeRuntime) {
                // Relative API route works on web only
                const apiFallback = buildPrivateMediaUrl('memories', path);
                pushUnique(apiFallback);
            } else {
                // On native, buildPrivateMediaUrl already returns absolute CF proxy URL
                pushUnique(buildPrivateMediaUrl('memories', path));
            }
        }

        return values;
    }, [src, directUrl, isNativeRuntime, prefix]);

    useEffect(() => {
        if (!src) return;
        setPlainAttempt(0);
        setPlainCachedSrc('');
        setUnencryptedSrc(plainCandidates[0] || directUrl || src);
    }, [src, directUrl, plainCandidates]);

    const plainVersionTag = useMemo(() => {
        if (!src) return '';
        try {
            return new URL(src, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').searchParams.get('t') || '';
        } catch {
            return '';
        }
    }, [src]);

    const plainPersistentCacheKey = useMemo(() => {
        if (!src) return '';
        if (tokenPayload?.path) {
            const bucketName = String(tokenPayload.bucket || bucket || 'memories');
            return `plain:${bucketName}:${String(tokenPayload.path)}:v=${plainVersionTag || '0'}`;
        }
        const basis = String((directUrl || src || '').split('#')[0] || '').trim();
        if (!basis) return '';
        return `plain:${basis}:v=${plainVersionTag || '0'}`;
    }, [src, tokenPayload, bucket, directUrl, plainVersionTag]);

    useEffect(() => {
        if (!isNativeRuntime) return;
        if (!currentUserId || !isVisible || !src || isEncryptedExplicit || isVideo) return;
        if (!plainPersistentCacheKey) return;

        let isMounted = true;
        let localBlobUrl: string | null = null;

        const getBlobOnce = async (key: string, url: string): Promise<Blob | null> => {
            const existing = plainMediaInFlight.get(key);
            if (existing) return existing;

            const p = (async () => {
                try {
                    const response = await orbitFetch(url, {
                        cache: 'force-cache',
                        ...(nativeAccessToken
                            ? { headers: { Authorization: `Bearer ${nativeAccessToken}` } }
                            : {}),
                    });
                    if (!response.ok) return null;
                    return await response.blob();
                } catch {
                    return null;
                } finally {
                    plainMediaInFlight.delete(key);
                }
            })();

            plainMediaInFlight.set(key, p);
            return p;
        };

        const run = async () => {
            const cached = await MediaCacheEngine.readBlob(currentUserId, plainPersistentCacheKey);
            if (cached?.blob) {
                localBlobUrl = URL.createObjectURL(cached.blob);
                if (!isMounted) return;
                setPlainCachedSrc(localBlobUrl);
                return;
            }

            const fetchUrl = unencryptedSrc || plainCandidates[0] || directUrl || src;
            if (!fetchUrl) return;

            const fetchedBlob = await getBlobOnce(plainPersistentCacheKey, fetchUrl);
            if (!fetchedBlob || !fetchedBlob.size) return;

            await MediaCacheEngine.writeBlob(
                currentUserId,
                plainPersistentCacheKey,
                fetchedBlob,
                fetchUrl,
                plainVersionTag || undefined
            );

            localBlobUrl = URL.createObjectURL(fetchedBlob);
            if (!isMounted) return;
            setPlainCachedSrc(localBlobUrl);
        };

        run();

        return () => {
            isMounted = false;
            if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
        };
    }, [
        isNativeRuntime,
        currentUserId,
        isVisible,
        src,
        isEncryptedExplicit,
        isVideo,
        plainPersistentCacheKey,
        unencryptedSrc,
        plainCandidates,
        directUrl,
        nativeAccessToken,
        plainVersionTag
    ]);

    // For encrypted media, prefer direct public object fetch + local decrypt.
    const encryptedFetchUrl = useMemo(() => {
        if (!isEncryptedExplicit) return null;
        if (!tokenPayload?.path) {
            return getPublicStorageUrl(src, bucket || 'memories', 'none', prefix || undefined);
        }
        return getPublicStorageUrl(tokenPayload.path, tokenPayload.bucket || bucket || 'memories', 'none', prefix || undefined);
    }, [isEncryptedExplicit, tokenPayload, src, prefix, bucket]);

    useEffect(() => {
        let isMounted = true;

        async function attemptDecryption() {
            if (!isVisible || !src) {
                if (!src && isMounted) setStatus('fetch_error');
                return;
            }

            // ─────────────────────────────────────────────────────────────────────────────
            // 1. GLOBAL CACHE CHECK: Stop the "Loading on each step" UX nightmare
            // ─────────────────────────────────────────────────────────────────────────────
            const currentCacheKey = MediaBlobCache.generateKey(src, effectiveIv, tokenPayload?.path || "");

            // 1. Check persistent MCE (Media Cache Engine) first!
            if (currentUserId) {
                const storedBlobData = await MediaCacheEngine.readBlob(currentUserId, currentCacheKey);
                if (storedBlobData && isMounted) {
                    const objectUrl = URL.createObjectURL(storedBlobData.blob);
                    // Also store in memory fast-cache for instant re-renders during the same session
                    MediaBlobCache.setPromise(currentCacheKey, Promise.resolve(objectUrl));
                    setDecryptedSrc(objectUrl);
                    setStatus('success');
                    return;
                }
            }

            // 2. Check volatile RAM cache (if another component is currently fetching it)
            const cachedUrl = MediaBlobCache.get(currentCacheKey);
            if (cachedUrl) {
                if (isMounted) {
                    setDecryptedSrc(cachedUrl);
                    setStatus('success');
                }
                return;
            }

            // 3. Only wait for a pending promise if we haven't already checked the blobCache
            const pendingPromise = MediaBlobCache.getPromise(currentCacheKey);
            if (pendingPromise) {
                try {
                    const resultUrl = await pendingPromise;
                    if (isMounted) {
                        setDecryptedSrc(resultUrl);
                        setStatus('success');
                    }
                    return;
                } catch {
                    // if pending failed, we'll try ourselves below
                }
            }

            const failKey = String(encryptedFetchUrl || src || '');
            const lastFailureAt = recentMediaFailures.get(failKey) || 0;
            if (lastFailureAt && Date.now() - lastFailureAt < MEDIA_FAIL_COOLDOWN_MS) {
                if (isMounted) setStatus('fetch_error');
                return;
            }

            // Quick check if not encrypted
            if (!isEncryptedExplicit) {
                if (isMounted) setStatus('unencrypted');
                return;
            }

            if (!hasStoredMediaPassphrase()) {
                if (isMounted) setStatus('locked');
                return;
            }

            // Define the decryption task as a promise to store in MediaBlobCache
            const decryptionTask = (async () => {
                // Local vars for salt and IV
                let ivB64 = iv || '';
                let mime = 'application/octet-stream';
                let fileId = "";

                let response: Response | null = null;
                let permanent4xx = false;

                const isProxy = src.includes('/api/media/view/');
                const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '').replace(/\/$/, '');
                const forceAbs = (url: string) => (isNativeRuntime && url.startsWith('/') && !url.startsWith('//')) ? `${apiBase}${url}` : url;

                const absSrc = forceAbs(src);
                const absFetchUrl = encryptedFetchUrl ? forceAbs(encryptedFetchUrl) : null;

                const orderedCandidates = isProxy
                    ? [absSrc, src]
                    : (isNativeRuntime ? [absFetchUrl, absSrc, encryptedFetchUrl, src] : [src, encryptedFetchUrl]);

                const candidates = orderedCandidates.filter((u, i, arr): u is string =>
                    !!u && arr.indexOf(u) === i && (u.startsWith('http') || u.startsWith('/'))
                ).map(u => forceAbs(u));

                for (const candidate of candidates) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

                        const fetchOptions = (cacheMode: RequestCache): RequestInit => ({
                            cache: cacheMode,
                            signal: controller.signal,
                            ...(isNativeRuntime && nativeAccessToken
                                ? { headers: { 'Authorization': `Bearer ${nativeAccessToken}` } }
                                : {}),
                        });

                        for (const cacheMode of (isNativeRuntime ? (['no-store', 'default'] as const) : (['default'] as const))) {
                            try {
                                const res = await orbitFetch(candidate, fetchOptions(cacheMode));
                                clearTimeout(timeoutId);
                                if (res.ok) {
                                    response = res;
                                    break;
                                }
                                if (res.status >= 400 && res.status < 500) {
                                    permanent4xx = true;
                                    break;
                                }
                            } catch (e) {
                                // inner fetch fail, try next cacheMode or candidate
                            }
                        }
                        clearTimeout(timeoutId);
                        if (response || permanent4xx) break;
                    } catch { /* next candidate */ }
                }

                if (!response) throw new Error("Fetch failed");

                const blob = await response.blob();
                const serverDecrypted = response.headers.get('x-orbit-media-decrypted') === '1';

                ivB64 = iv || '';
                mime = blob.type || 'application/octet-stream';

                if (tokenPayload?.path) {
                    fileId = String(tokenPayload.path);
                    if (tokenPayload.iv) ivB64 = String(tokenPayload.iv);
                    if (tokenPayload.mime) mime = String(tokenPayload.mime);
                } else {
                    try {
                        const urlObj = new URL(src, window.location.origin);
                        fileId = urlObj.pathname.replace(/^\/api\/media\/view\//, "").replace(/^\/+/g, "");
                        const params = urlObj.searchParams;
                        if (params.get('iv')) ivB64 = params.get('iv')!;
                        if (params.get('mime')) mime = params.get('mime')!;
                    } catch {
                        fileId = src.replace(/^\/+/g, "");
                    }
                }

                if (!fileId) throw new Error("No fileId");

                let decryptedBlob: Blob = blob;
                if (!serverDecrypted) {
                    const fullSalt = fileId;
                    const baseSalt = String(fullSalt).split('/').pop()?.split('?')[0] || fullSalt;
                    const saltCandidates = Array.from(new Set([fullSalt, baseSalt])).filter(Boolean);

                    let success = false;
                    for (const salt of saltCandidates) {
                        try {
                            const result = await decryptMediaBlob(blob, salt, ivB64, mime);
                            if (result) {
                                decryptedBlob = result;
                                success = true;
                                break;
                            }
                        } catch { /* next salt */ }
                    }
                    if (!success) throw new Error("Decryption failed");
                }

                if (currentUserId) {
                    // Write to persistent encrypted disk storage so we never download it again
                    await MediaCacheEngine.writeBlob(currentUserId, currentCacheKey, decryptedBlob, String(src));
                }

                return URL.createObjectURL(decryptedBlob);
            })();

            // Store the promise so other components can join the race
            MediaBlobCache.setPromise(currentCacheKey, decryptionTask);

            try {
                const objectUrl = await decryptionTask;
                if (isMounted) {
                    setDecryptedSrc(objectUrl);
                    setStatus('success');
                }
            } catch (err) {
                if (src) recentMediaFailures.set(String(encryptedFetchUrl || src), Date.now());
                if (isMounted) setStatus('decrypt_error');
            }
        }

        if (isEncryptedExplicit) {
            setStatus('loading');
        }

        // Minor debounce for non-priority images to prioritize visible UI stability
        const timeout = !priority ? setTimeout(attemptDecryption, 10) : (attemptDecryption(), null);

        return () => {
            isMounted = false;
            if (timeout) clearTimeout(timeout);

            // Only aggressively revoke if we explicitly own this blob and we are native
            // Since MediaBlobCache shares blobs, we'll let the LRU cache (if implemented) handle it,
            // or just clean up on full unmount if safe. We will rely on browser garbage collection
            // for the Blob itself, but the ObjectURL needs revocation eventually.
        };
    }, [src, isEncryptedExplicit, effectiveIv, encryptedFetchUrl, tokenPayload, isNativeRuntime, isVisible, priority]);

    if (!src) return <div className={cn("bg-neutral-900/10", className)} />;

    // Visual loading state: either decryption is happening, or decryption is done but the browser hasn't rendered the image yet
    const isActuallyLoading = showLoader && (status === 'loading' || (status === 'success' && !isImageLoaded && !isVideo) || (status === 'unencrypted' && !isImageLoaded && !isVideo));

    const renderLoader = () => (
        <div className={cn("bg-black absolute inset-0 z-50 flex items-center justify-center overflow-hidden", isActuallyLoading ? "opacity-100" : "opacity-0 pointer-events-none transition-opacity duration-300")}>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes orbit-loading-pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.7; }
                }
                .loading-pulse-anim {
                    animation: orbit-loading-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite !important;
                }
            `}} />
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent opacity-20 loading-pulse-anim" />
            <DotLoader size={loadingSize} color="rose" />
        </div>
    );

    if (status === 'locked' || status === 'decrypt_error' || status === 'fetch_error') {
        let titleLabel = "Media Locked";
        let subtextLabel = "END-TO-END ENCRYPTED";

        if (status === 'locked') {
            titleLabel = "Key Required";
            subtextLabel = "Please upload your privacy key";
        } else if (status === 'decrypt_error') {
            titleLabel = "Intruder Alert! 🚨";
            subtextLabel = "Oops! Just kidding. Try your luck again 🤞";
        } else if (status === 'fetch_error') {
            titleLabel = "Network Error";
            subtextLabel = "Could not load media from server";
        }

        return (
            <div className={cn("relative overflow-hidden group", className)}>
                <EncryptedLockedCard
                    className="w-full h-full"
                    label={titleLabel}
                    subtext={subtextLabel}
                    icon={status === 'fetch_error' ? 'alert' : 'lock'}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Only prompt restore key for locked or decrypt_error
                        if ((status === 'locked' || status === 'decrypt_error') && onNeedRestore) {
                            onNeedRestore();
                        }
                    }}
                />
            </div>
        );
    }

    const nonEncryptedSrc =
        plainCachedSrc ||
        unencryptedSrc ||
        plainCandidates[Math.min(plainAttempt, Math.max(0, plainCandidates.length - 1))] ||
        directUrl ||
        src;
    const isFill = fill ?? (!width && !height);

    return (
        <div ref={containerRef} onClick={props.onClick} className={cn("relative overflow-hidden bg-neutral-950/20 group", className)}>
            {isActuallyLoading && renderLoader()}

            {status === 'unencrypted' ? (
                isVideo ? (
                    <video
                        src={nonEncryptedSrc}
                        className={cn("w-full h-full object-cover orbit-media-reveal", className?.includes('object-contain') && 'object-contain', isImageLoaded ? "opacity-100" : "opacity-0")}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        style={{ pointerEvents: 'auto' }}
                        onLoadedData={() => setIsImageLoaded(true)}
                    />
                ) : (
                    <img
                        src={nonEncryptedSrc}
                        alt={alt}
                        className={cn("w-full h-full object-cover orbit-media-reveal transition-opacity duration-500", className?.includes('object-contain') && 'object-contain', isImageLoaded ? "opacity-100" : "opacity-0")}
                        draggable={draggable}
                        loading={priority ? "eager" : "lazy"}
                        decoding="async"
                        onLoad={() => setIsImageLoaded(true)}
                        style={{ pointerEvents: draggable ? 'auto' : 'none' }}
                        onError={() => {
                            setIsImageLoaded(true); // Release loader on error
                            const failKey = String(nonEncryptedSrc || src || '');
                            recentMediaFailures.set(failKey, Date.now());
                            const nextAttempt = plainAttempt + 1;
                            if (nextAttempt < plainCandidates.length) {
                                setPlainAttempt(nextAttempt);
                                setUnencryptedSrc(plainCandidates[nextAttempt]);
                            }
                        }}
                    />
                )
            ) : status === 'success' ? (
                isVideo ? (
                    <video
                        src={decryptedSrc}
                        className={cn("w-full h-full object-cover orbit-media-reveal", className?.includes('object-contain') && 'object-contain', isImageLoaded ? "opacity-100" : "opacity-0")}
                        controls={!fill}
                        autoPlay={fill}
                        muted={fill}
                        loop={fill}
                        playsInline
                        style={{ pointerEvents: 'auto' }}
                        onLoadedData={() => setIsImageLoaded(true)}
                    />
                ) : (
                    <Image
                        src={decryptedSrc}
                        alt={alt}
                        className={cn("orbit-media-reveal transition-opacity duration-500", className, isImageLoaded ? "opacity-100" : "opacity-0")}
                        fill={isFill}
                        {...(isFill ? {} : { width, height })}
                        sizes={sizes}
                        priority={priority}
                        quality={quality}
                        draggable={draggable}
                        onLoad={() => setIsImageLoaded(true)}
                        unoptimized
                        style={{ pointerEvents: draggable ? 'auto' : 'none' }}
                    />
                )
            ) : null}
        </div>
    );
}
