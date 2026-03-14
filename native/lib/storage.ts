// For local development, point to the Next.js local server IP running on your Wi-Fi network.
// e.g., 'http://192.168.1.100:3000'
// Cloudflare's orbit-app-proxy blocks React Native's User-Agent, so we MUST use the Nextjs backend.
// Note: Expo requires the EXPO_PUBLIC_ prefix for env vars to be bundled in release builds.
// PRODUCTION FALLBACK: Use Vercel URL to avoid local network SocketTimeouts
const getApiBase = () => {
    try {
        const { useOrbitStore } = require('./store');
        const debugUrl = useOrbitStore.getState().debugApiUrl;
        return debugUrl || process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
    } catch {
        return process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
    }
};

const CDN_BASE = process.env.EXPO_PUBLIC_CDN_URL;
const STORAGE_URL_CACHE = new Map<string, string>();
const STORAGE_URL_CACHE_MAX = 500;

/**
 * Generates a storage URL for assets using the Next.js backend proxy or CDN.
 */
export function getPublicStorageUrl(path: string | null | undefined, bucket: string = 'memories', authToken?: string | null) {
    if (!path || typeof path !== 'string') return null;

    if (path.startsWith('http')) return path;
    if (path.startsWith('data:')) return path;
    if (path.startsWith('file://')) return path;

    let lastUpdate = 0;
    try {
        const { useOrbitStore } = require('./store');
        lastUpdate = useOrbitStore.getState().lastAvatarUpdate || 0;
    } catch { }

    const cacheKey = `${bucket}|${authToken || ''}|${path}|${bucket === 'avatars' ? lastUpdate : ''}`;
    const cached = STORAGE_URL_CACHE.get(cacheKey);
    if (cached) return cached;

    // Clean inputs
    const cleanPath = path.replace(/^\/+/, '');

    // Prevent double bucket prefixes (e.g. avatars/avatars/...)
    const startsWithAnyBucket = [
        'avatars/',
        'memories/',
        'bucket_list/',
        'letters/',
        'polaroids/',
        'wallpapers/',
    ].some(p => cleanPath.startsWith(p));
    const finalPath = startsWithAnyBucket ? cleanPath : `${bucket}/${cleanPath}`;
    const cleanFinalPath = finalPath.replace(/\/\//g, '/');

    const apiBase = getApiBase();
    const isLocal = apiBase.includes('192.168.') || apiBase.includes('10.') || apiBase.includes('localhost');
    const authParam = authToken ? `auth=${encodeURIComponent(authToken)}` : '';
    const timeParam = (bucket === 'avatars' && lastUpdate) ? `t=${lastUpdate}` : '';
    
    // Combine params
    let query = '';
    if (authParam && timeParam) query = `?${authParam}&${timeParam}`;
    else if (authParam) query = `?${authParam}`;
    else if (timeParam) query = `?${timeParam}`;

    const resolvedUrl = (isLocal || !CDN_BASE)
        ? `${apiBase}/api/media/view/${cleanFinalPath}${query}`
        : `${CDN_BASE}/${cleanFinalPath}${query}`;

    STORAGE_URL_CACHE.set(cacheKey, resolvedUrl);
    if (STORAGE_URL_CACHE.size > STORAGE_URL_CACHE_MAX) {
        const firstKey = STORAGE_URL_CACHE.keys().next().value;
        if (firstKey) STORAGE_URL_CACHE.delete(firstKey);
    }

    return resolvedUrl;
}

export function isVideoUrl(path: string | null | undefined): boolean {
    if (!path || typeof path !== 'string') return false;
    const normalized = path.toLowerCase();
    if (normalized.includes('mime=video')) return true;
    return /\.(mp4|mov|m4v|3gp|webm|mkv)(\?|#|$)/i.test(normalized);
}
