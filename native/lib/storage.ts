// For local development, point to the Next.js local server IP running on your Wi-Fi network.
// e.g., 'http://192.168.1.100:3000'
// Cloudflare's orbit-app-proxy blocks React Native's User-Agent, so we MUST use the Nextjs backend.
// Note: Expo requires the EXPO_PUBLIC_ prefix for env vars to be bundled in release builds.
// PRODUCTION FALLBACK: Use Vercel URL to avoid local network SocketTimeouts
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';
const CDN_BASE = process.env.EXPO_PUBLIC_CDN_URL;

/**
 * Generates a storage URL for assets using the Next.js backend proxy or CDN.
 */
export function getPublicStorageUrl(path: string | null | undefined, bucket: string = 'memories', authToken?: string | null) {
    if (!path || typeof path !== 'string') return null;

    if (path.startsWith('http')) return path;
    if (path.startsWith('data:')) return path;
    if (path.startsWith('file://')) return path;

    const cleanPath = path.replace(/^\/+/, '');
    const finalBucket = cleanPath.startsWith(`${bucket}/`) ? '' : bucket;
    const finalPath = (finalBucket ? `${finalBucket}/${cleanPath}` : cleanPath).replace(/\/\//g, '/');

    // If API_BASE is a local network address, prioritize it for development stability
    const isLocal = API_BASE.includes('192.168.') || API_BASE.includes('10.') || API_BASE.includes('localhost');

    if (isLocal) {
        let url = `${API_BASE}/api/media/view/${finalPath}`;
        if (authToken) {
            url += `?auth=${encodeURIComponent(authToken)}`;
        }
        return url;
    }

    // Best in Class: Use CDN if available for production-like environments
    if (CDN_BASE) {
        return `${CDN_BASE}/${finalPath}${authToken ? `?auth=${encodeURIComponent(authToken)}` : ''}`;
    }

    let url = `${API_BASE}/api/media/view/${finalPath}`;
    if (authToken) {
        url += `?auth=${encodeURIComponent(authToken)}`;
    }

    return url;
}

export function isVideoUrl(path: string | null | undefined): boolean {
    if (!path || typeof path !== 'string') return false;
    const normalized = path.toLowerCase();
    if (normalized.includes('mime=video')) return true;
    return /\.(mp4|mov|m4v|3gp|webm|mkv)(\?|#|$)/i.test(normalized);
}
