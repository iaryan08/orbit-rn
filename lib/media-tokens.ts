export function encodeMediaToken(payload: Record<string, any>): string {
    const json = JSON.stringify(payload);
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(json, 'utf8').toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export function decodeMediaToken(token: string): Record<string, any> | null {
    if (!token) return null;
    try {
        const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
        if (typeof Buffer !== 'undefined') {
            const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
            const json = Buffer.from(padded, 'base64').toString('utf8');
            return JSON.parse(json);
        }

        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const json = new TextDecoder().decode(bytes);
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}
