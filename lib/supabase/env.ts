function boolFromEnv(value: string | undefined): boolean | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    return null;
}

/**
 * DETERMINES IF WE SHOULD USE THE CLOUDFLARE PROXY
 * Updated to be "Jio Brave": If a proxy is configured, we USE it by default
 * even on localhost to avoid those red CORS errors.
 */
export function shouldUseCloudflareProxy() {
    const explicit = boolFromEnv(process.env.NEXT_PUBLIC_USE_CF_PROXY);
    if (explicit !== null) return explicit;

    const hasConfiguredProxy =
        !!(process.env.NEXT_PUBLIC_API_BASE_URL || '').trim() ||
        !!(process.env.NEXT_PUBLIC_DB_PROXY_URL || '').trim();

    // Always use proxy in production or if configured, regardless of platform.
    // This fixed the red CORS errors in the browser.
    if (hasConfiguredProxy) return true;

    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
    return isNative || process.env.NODE_ENV === 'production';
}

export function getResolvedDirectSupabaseUrl() {
    const direct = (process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_URL || '').trim();
    const configured = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (direct) return direct;
    if (configured && !configured.includes('workers.dev')) return configured;
    return 'https://buyussagywhwcgxnieui.supabase.co';
}

export function getResolvedSupabaseUrl() {
    const direct = getResolvedDirectSupabaseUrl();
    const dbProxy = (process.env.NEXT_PUBLIC_DB_PROXY_URL || '').trim();
    const useProxy = shouldUseCloudflareProxy();

    if (useProxy && dbProxy) return dbProxy;

    const configured = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (useProxy && configured && configured.includes('workers.dev')) return configured;

    return direct;
}

export function getResolvedSupabasePublishableKey() {
    const publishable = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

    if (anon && !anon.toLowerCase().includes('dummy-key')) return anon;
    if (publishable) return publishable;
    return anon;
}
