import { encodeMediaToken, decodeMediaToken } from "@/lib/media-tokens"
import { orbitFetch } from "@/lib/client/network"

// ── URL Resolution Cache ─────────────────────────────────────────────────────
const URL_CACHE_MAX = 200;
const urlCache = new Map<string, string | null>();

export function invalidateStorageUrlCache(path?: string | null) {
    if (!path) {
        urlCache.clear();
    } else {
        for (const key of urlCache.keys()) {
            if (key.startsWith(path)) urlCache.delete(key);
        }
    }
}

export function buildPrivateMediaUrl(bucket: string, path: string, params: Record<string, string> = {}) {
    const payload = {
        bucket,
        path,
        ...params
    }
    const token = encodeMediaToken(payload)
    const relPath = `/api/media/view/${token}`

    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
        const apiBase = (
            process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || ''
        ).replace(/\/$/, '')
        return `${apiBase}${relPath}`
    }

    return relPath
}

export function extractFilePathFromStorageUrl(value: string | null | undefined, bucket: string = 'memories') {
    if (!value) return null
    if (value.startsWith('/api/media/view/')) {
        const token = value.split('/api/media/view/')[1]?.split('?')[0] || ''
        const payload = decodeMediaToken(token)
        if (payload?.path) return payload.path
    }

    if (value.includes('/storage/v1/object/')) {
        const parts = value.split(`/storage/v1/object/public/${bucket}/`)
        if (parts.length > 1) return parts[1].split('?')[0]
    }

    const rx = new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/([^?]+)`, 'i')
    const match = value.match(rx)
    if (match?.[1]) {
        try {
            return decodeURIComponent(match[1])
        } catch {
            return match[1]
        }
    }

    if (!value.includes('://') && !value.startsWith('/') && !value.startsWith('data:') && !value.startsWith('blob:')) {
        return value.split('?')[0]
    }

    return null
}

export function getPublicStorageUrl(
    path: string | null | undefined,
    bucket: string = 'memories',
    optimizeSize: 'sm' | 'md' | 'lg' | 'none' = 'md',
    prefix?: string | null
) {
    const cacheKey = `${String(path)}|${bucket}|${optimizeSize}|${String(prefix ?? '')}|${typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() ? 'native' : 'web'}`;
    if (urlCache.has(cacheKey)) return urlCache.get(cacheKey) ?? null;

    const result = _resolvePublicStorageUrl(path, bucket, optimizeSize, prefix);

    if (urlCache.size >= URL_CACHE_MAX) {
        const firstKey = urlCache.keys().next().value;
        if (firstKey) urlCache.delete(firstKey);
    }
    urlCache.set(cacheKey, result);
    return result;
}

function _resolvePublicStorageUrl(
    path: string | null | undefined,
    bucket: string = 'memories',
    optimizeSize: 'sm' | 'md' | 'lg' | 'none' = 'md',
    prefix?: string | null
) {
    if (!path) return null
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '').replace(/\/$/, '');
    const forceAbs = (url: string) => (isNative && url.startsWith('/')) ? `${apiBase}${url}` : url;

    const normalizeBucketPath = (value: string, bucketName: string = bucket) => {
        let normalized = value;
        try { normalized = decodeURIComponent(normalized); } catch { }
        normalized = normalized.split('?')[0].split('#')[0];
        normalized = normalized.replace(/\\/g, '/').replace(/^\/+/, '');
        if (normalized.toLowerCase().startsWith(`${bucketName.toLowerCase()}/`)) {
            normalized = normalized.slice(bucketName.length + 1);
        }
        return normalized;
    }

    const deriveFallbackPrefix = () => {
        if (prefix) return String(prefix).trim();
        if (typeof window === 'undefined') return '';
        try {
            const fromStore = (window as any).__ORBIT_COUPLE_ID__;
            if (typeof fromStore === 'string' && fromStore.trim()) return fromStore.trim();
            const fromStorage = localStorage.getItem('orbit:cached_couple_id');
            if (typeof fromStorage === 'string' && fromStorage.trim()) return fromStorage.trim();
        } catch { }
        return '';
    }

    // 1. Resolve basic path
    let cleanPath = path
    if (/^https?:\/\//i.test(path)) {
        if (path.includes('/api/media/view/')) return path;
        const extracted = extractFilePathFromStorageUrl(path, bucket);
        if (extracted) cleanPath = extracted;
        else return path;
    }

    // 2. Tokenized URLs
    if (path.startsWith('/api/media/view/')) {
        const token = path.split('/api/media/view/')[1]?.split('?')[0] || ''
        const payload = decodeMediaToken(token)
        if (payload?.enc === '1') return forceAbs(path);
        if (payload?.path) {
            cleanPath = normalizeBucketPath(payload.path, String(payload.bucket || bucket));
        } else {
            return forceAbs(path);
        }
    }

    // 3. Fallback prefix
    const fallbackPrefix = deriveFallbackPrefix();
    if (fallbackPrefix && !cleanPath.includes('/') && !path.startsWith('http') && !path.startsWith('/') && !path.startsWith('data:') && !path.startsWith('blob:')) {
        cleanPath = `${fallbackPrefix}/${cleanPath}`
    }

    // 4. Force proxy for ALL buckets (user confirmed all are private)
    const urlParams: Record<string, string> = {};
    try {
        const searchSource = path.includes('?') ? path.split('?')[1] : '';
        if (searchSource) {
            const sp = new URLSearchParams(searchSource);
            if (sp.has('iv')) urlParams.iv = sp.get('iv')!;
            if (sp.has('mime')) urlParams.mime = sp.get('mime')!;
            if (sp.has('enc')) urlParams.enc = sp.get('enc')!;
        }
    } catch { }

    const normalizedClean = normalizeBucketPath(cleanPath, bucket);
    let finalUrl = buildPrivateMediaUrl(bucket, normalizedClean, urlParams);

    // Append auth token on client so <img> tags work
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('orbit_active_session');
        if (token) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `auth=${token}`;
        }
    }

    return finalUrl;
}

export function isVideoUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    if (url.includes('/api/media/view/')) {
        try {
            const token = url.split('/api/media/view/')[1]?.split('?')[0] || '';
            const payload = decodeMediaToken(token);
            if (payload?.path) return isVideoUrl(payload.path);
            if (payload?.mime?.startsWith('video/')) return true;
        } catch { }
    }
    if (url.includes('mime=video')) return true;
    const clean = url.split('?')[0].split('#')[0];
    return /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(clean);
}

export async function uploadToR2(file: Blob | File, bucket: string, path: string, contentType?: string) {
    const cleanPath = path.replace(/^\//, '');
    const inferredContentType = contentType || file.type || 'application/octet-stream';
    const isBrowser = typeof window !== 'undefined';
    const isNativeRuntime = isBrowser && !!(window as any).Capacitor?.isNativePlatform?.();

    if (isBrowser && !isNativeRuntime) {
        const form = new FormData();
        form.append('bucket', bucket);
        form.append('path', cleanPath);
        form.append('contentType', inferredContentType);
        form.append('file', file);
        const res = await orbitFetch('/api/media/upload', { method: 'POST', body: form, cache: 'no-store' });
        if (res.ok) return { success: true, path: cleanPath };
        throw new Error('Upload failed');
    }

    const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL;
    const uploadSecret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
    if (!uploadUrl || !uploadSecret) throw new Error('R2 not configured');

    const r2Url = `${uploadUrl.replace(/\/$/, '')}/${bucket}/${cleanPath}`;
    const res = await fetch(r2Url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${uploadSecret}`, 'Content-Type': inferredContentType },
        body: file,
        cache: 'no-store'
    });

    if (res.ok) return { success: true, path: cleanPath };
    throw new Error('R2 upload failed');
}

export async function deleteFromR2(bucket: string, path: string) {
    const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL;
    const uploadSecret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
    if (!uploadUrl || !uploadSecret) return;
    const r2Url = `${uploadUrl.replace(/\/$/, '')}/${bucket}/${path.replace(/^\//, '')}`;
    try {
        await fetch(r2Url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${uploadSecret}` } });
    } catch { }
}
