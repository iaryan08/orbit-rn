/**
 * Custom Network Layer for Orbit
 */

import { Capacitor } from '@capacitor/core';
import { dedupedFetch } from '@/lib/dedup-fetch';
import {
    getResolvedDirectSupabaseUrl,
    getResolvedSupabasePublishableKey,
    shouldUseCloudflareProxy
} from '@/lib/supabase/env';

const BACKEND_MODE_KEY = 'orbit:backend_mode';
export type BackendMode = 'supabase' | 'vercel' | 'offline';

const isNativeRuntime = () =>
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform();

/**
 * CONCURRENCY MANAGEMENT
 */
class RequestQueue {
    private concurrency: number;
    private activeCount = 0;
    private queue: (() => void)[] = [];

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    async enqueue(): Promise<void> {
        if (this.activeCount < this.concurrency) {
            this.activeCount++;
            return Promise.resolve();
        }
        return new Promise(resolve => {
            this.queue.push(resolve);
        });
    }

    dequeue() {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next();
        } else {
            this.activeCount--;
        }
    }
}

const apiRequestQueue = new RequestQueue(isNativeRuntime() ? 5 : 10);
const mediaRequestQueue = new RequestQueue(isNativeRuntime() ? 3 : 6);

/**
 * BACKEND CONNECTIVITY CONFIGURATION
 */
export class ConnectivityManager {
    // FORCE: Default to Vercel/Proxy if we are on a restricted network (proxy is configured)
    private static mode: BackendMode = (() => {
        if (typeof window === 'undefined') return 'supabase';
        const stored = localStorage.getItem(BACKEND_MODE_KEY) as BackendMode;
        if (stored) return stored;

        // If the user has a proxy set up, use it by default to avoid CORS errors instantly.
        return (shouldUseCloudflareProxy()) ? 'vercel' : (isNativeRuntime() ? 'vercel' : 'supabase');
    })();

    private static lastAutoDiscover = 0;
    private static supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    private static vercelUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '').replace(/\/$/, '');

    static getMode(): BackendMode {
        return this.mode;
    }

    static setMode(newMode: BackendMode) {
        const forceProxy = shouldUseCloudflareProxy();

        if (typeof window !== 'undefined') {
            const host = window.location.hostname;
            const isLocalOrigin = host === 'localhost' || host === '127.0.0.1';

            // Allow manual override only if we aren't being blocked by Jio (hence forceProxy check)
            if (!forceProxy && !isNativeRuntime() && isLocalOrigin) {
                newMode = 'supabase';
            }
        }

        if (this.mode === newMode) return;
        this.mode = newMode;
        if (typeof window !== 'undefined') {
            localStorage.setItem(BACKEND_MODE_KEY, newMode);
        }
        console.log(`[Connectivity] Backend mode set: ${newMode}`);
    }

    static async checkHealth(mode: 'supabase' | 'vercel'): Promise<boolean> {
        const url = mode === 'supabase'
            ? `${this.supabaseUrl}/rest/v1/`
            : `${this.vercelUrl}/api/health`;

        try {
            const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
            return res.ok || res.status === 401;
        } catch {
            return false;
        }
    }

    static async autoDiscover(force = false) {
        if (shouldUseCloudflareProxy()) {
            this.setMode('vercel');
            return;
        }

        const now = Date.now();
        if (!force && now - this.lastAutoDiscover < 30000) return;
        this.lastAutoDiscover = now;

        if (await this.checkHealth('supabase')) {
            this.setMode('supabase');
        } else if (await this.checkHealth('vercel')) {
            this.setMode('vercel');
        }
    }
}

/**
 * CORE FETCH ENGINE
 */
export async function orbitFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isGet = (init?.method || 'GET').toUpperCase() === 'GET';
    const rawUrlString = input.toString();
    const useProxy = shouldUseCloudflareProxy();

    const executeRequest = async (): Promise<Response> => {
        const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const dbProxyUrl = (process.env.NEXT_PUBLIC_DB_PROXY_URL || '').trim();
        const appProxyUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || dbProxyUrl || '').trim();

        const isSupabaseResource = rawUrlString.includes('/rest/v1/') || rawUrlString.includes('/auth/v1/') || rawUrlString.includes('/storage/v1/');

        // --- AUTH ATTACHMENT (Firebase ID Token) ---
        let headers = new Headers(init?.headers);
        try {
            const { auth } = await import('@/lib/firebase/client');
            const user = auth.currentUser;
            if (user) {
                const token = await user.getIdToken();
                if (token) headers.set('Authorization', `Bearer ${token}`);
            }
        } catch { /* Fallback to existing headers or none */ }

        // If it's a Supabase-bound resource, we still need the anon key for PostgREST
        if (isSupabaseResource) {
            const key = getResolvedSupabasePublishableKey();
            if (key && !headers.has('apikey')) headers.set('apikey', key);
        }

        let targetUrl = rawUrlString;
        if (useProxy && isSupabaseResource && !rawUrlString.includes('workers.dev')) {
            try {
                const url = new URL(rawUrlString);
                targetUrl = (dbProxyUrl || appProxyUrl).replace(/\/$/, '') + url.pathname + url.search;
            } catch { }
        }

        const tryNetworkCall = async (url: string, timeoutMs: number): Promise<Response> => {
            const isMedia = url.includes('/storage/v1/') || url.includes('/api/media/');
            const queue = isMedia ? mediaRequestQueue : apiRequestQueue;

            await queue.enqueue();
            const controller = new AbortController();
            const actualTimeout = isMedia ? 40000 : timeoutMs;
            const timer = setTimeout(() => controller.abort('OrbitTimeout'), actualTimeout);

            try {
                const res = await fetch(url, { ...init, signal: controller.signal, headers });
                clearTimeout(timer);
                return res;
            } finally {
                queue.dequeue();
            }
        };

        const mode = ConnectivityManager.getMode();

        // TIER 1: Try Proxy (workers.dev)
        if (useProxy || mode === 'vercel') {
            try {
                const res = await tryNetworkCall(targetUrl, 12000);
                // 2xx are good. 4xx/5xx from the API itself are returned. 
                // Only "network errors" or "blocks" trigger the next tier.
                if (res.ok || [401, 403, 404, 406].includes(res.status)) return res;
            } catch (e) {
                console.warn(`[Network] Tier 1 (Proxy) failed: ${e}. Falling back to Tier 2.`);
            }
        }

        // TIER 2: Try Vercel Direct (Relative or Absolute)
        // If targetUrl was a worker but it failed, try the Vercel path directly.
        if (isSupabaseResource && targetUrl !== rawUrlString) {
            try {
                // If on native, we need the full Vercel URL. If on web, we can use absolute path from origin.
                const vercelBase = (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : window.location.origin);
                const url = new URL(rawUrlString);
                const vercelUrl = vercelBase.replace(/\/$/, '') + '/api/proxy' + url.pathname + url.search;

                const res = await tryNetworkCall(vercelUrl, 15000);
                if (res.ok || [401, 403, 404, 406].includes(res.status)) return res;
            } catch (e) {
                console.warn(`[Network] Tier 2 (Vercel) failed: ${e}. Falling back to Tier 3.`);
            }
        }

        // TIER 3: Direct Supabase / Final Fallback
        return tryNetworkCall(rawUrlString, 15000);
    };

    if (isGet) return dedupedFetch(rawUrlString, executeRequest);
    return executeRequest();
}
