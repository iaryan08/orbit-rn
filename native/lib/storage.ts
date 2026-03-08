// For local development, point to the Next.js local server IP running on your Wi-Fi network.
// e.g., 'http://192.168.1.100:3000'
// Cloudflare's orbit-app-proxy blocks React Native's User-Agent, so we MUST use the Nextjs backend.
// Note: Expo requires the EXPO_PUBLIC_ prefix for env vars to be bundled in release builds.
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://orbit-rn-beta.vercel.app';

/**
 * Generates a storage URL for assets using the Next.js backend proxy.
 * Standard query parameters are much more robust across React Native environments
 * than manual Base64 encoding which often requires polyfills for TextEncoder/Buffer.
 */
export function getPublicStorageUrl(path: string | null | undefined, bucket: string = 'memories', authToken?: string | null) {
    if (!path || typeof path !== 'string') return null;

    if (path.startsWith('http')) return path;
    if (path.startsWith('data:')) return path;

    const cleanPath = path.replace(/^\/+/, '');
    const finalBucket = cleanPath.startsWith(`${bucket}/`) ? '' : bucket;
    const finalPath = finalBucket ? `${finalBucket}/${cleanPath}` : cleanPath;

    let url = `${API_BASE}/api/media/view/${finalPath.replace(/\/\//g, '/')}`;

    if (authToken) {
        url += `?auth=${encodeURIComponent(authToken)}`;
    }

    return url;
}
