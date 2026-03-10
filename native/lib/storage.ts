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

/**
 * Generates a storage URL for assets using the Next.js backend proxy or CDN.
 */
export function getPublicStorageUrl(path: string | null | undefined, bucket: string = 'memories', authToken?: string | null) {
    if (!path || typeof path !== 'string') return null;

    if (path.startsWith('http')) return path;
    if (path.startsWith('data:')) return path;
    if (path.startsWith('file://')) return path;

    // Clean inputs
    const cleanPath = path.replace(/^\/+/, '');

    // Prevent double bucket prefixes (e.g. avatars/avatars/...)
    const startsWithAnyBucket = ['avatars/', 'memories/', 'bucket_list/', 'letters/'].some(p => cleanPath.startsWith(p));
    const finalPath = startsWithAnyBucket ? cleanPath : `${bucket}/${cleanPath}`;
    const cleanFinalPath = finalPath.replace(/\/\//g, '/');

    const apiBase = getApiBase();
    // Use development IP for stability on Wi-Fi
    const isLocal = apiBase.includes('192.168.') || apiBase.includes('10.') || apiBase.includes('localhost');
    const authParam = authToken ? `?auth=${encodeURIComponent(authToken)}` : '';

    if (isLocal || !CDN_BASE) {
        return `${apiBase}/api/media/view/${cleanFinalPath}${authParam}`;
    }

    // Best in Class: Use CDN if available
    return `${CDN_BASE}/${cleanFinalPath}${authParam}`;
}

export function isVideoUrl(path: string | null | undefined): boolean {
    if (!path || typeof path !== 'string') return false;
    const normalized = path.toLowerCase();
    if (normalized.includes('mime=video')) return true;
    return /\.(mp4|mov|m4v|3gp|webm|mkv)(\?|#|$)/i.test(normalized);
}
