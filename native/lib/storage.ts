// For local development, point to the Next.js local server IP running on your Wi-Fi network.
// e.g., 'http://192.168.1.100:3000'
// Cloudflare's orbit-app-proxy blocks React Native's User-Agent, so we MUST use the Nextjs backend.
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://10.81.17.146:3000';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(str: string): string {
    let output = '';
    let i = 0;
    str = unescape(encodeURIComponent(str));

    while (i < str.length) {
        const chr1 = str.charCodeAt(i++);
        const chr2 = i < str.length ? str.charCodeAt(i++) : Number.NaN;
        const chr3 = i < str.length ? str.charCodeAt(i++) : Number.NaN;

        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (isNaN(chr2) ? 0 : chr2 >> 4);
        const enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (isNaN(chr3) ? 0 : chr3 >> 6);
        const enc4 = isNaN(chr3) ? 64 : chr3 & 63;

        output += chars.charAt(enc1) + chars.charAt(enc2) +
            (enc3 === 64 ? '=' : chars.charAt(enc3)) +
            (enc4 === 64 ? '=' : chars.charAt(enc4));
    }
    return output;
}

function encodeMediaToken(payload: Record<string, any>): string {
    const jsonStr = JSON.stringify(payload);
    let base64 = encodeBase64(jsonStr);

    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function getPublicStorageUrl(path: string | null | undefined, bucket: string = 'memories', authToken?: string | null) {
    if (!path || typeof path !== 'string') return null;

    if (path.startsWith('http')) return path;
    if (path.startsWith('data:')) return path;

    const cleanPath = path.replace(/^\/+/, '');

    // The Next.js web app proxy expects a Base64 encoded token of {bucket, path}
    try {
        const token = encodeMediaToken({ bucket, path: cleanPath });
        let url = `${API_BASE}/api/media/view/${token}`;
        if (authToken) {
            url += `?auth=${authToken}`;
        }
        return url;
    } catch (e) {
        console.error("Failed to encode media token:", e);
        return `${API_BASE}/api/media/view/${bucket}/${cleanPath}${authToken ? `?auth=${authToken}` : ''}`;
    }
}
