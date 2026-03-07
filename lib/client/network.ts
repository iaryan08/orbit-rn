/**
 * Custom Network Layer for Orbit
 */

import { Capacitor } from '@capacitor/core';
import { dedupedFetch } from '@/lib/dedup-fetch';

const BACKEND_MODE_KEY = 'orbit:backend_mode';
export type BackendMode = 'vercel' | 'offline';

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
    private static mode: BackendMode = 'vercel';

    static getMode(): BackendMode {
        return this.mode;
    }

    static setMode(newMode: BackendMode) {
        this.mode = newMode;
        console.log(`[Connectivity] Backend mode set: ${newMode}`);
    }

    static async checkHealth(): Promise<boolean> {
        const vercelUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || '').replace(/\/$/, '');
        const url = `${vercelUrl}/api/health`;

        try {
            const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
            return res.ok || res.status === 401;
        } catch {
            return false;
        }
    }

    static async autoDiscover() {
        this.setMode('vercel');
    }
}

/**
 * CORE FETCH ENGINE
 */
export async function orbitFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isGet = (init?.method || 'GET').toUpperCase() === 'GET';
    const rawUrlString = input.toString();

    const executeRequest = async (): Promise<Response> => {
        const dbProxyUrl = (process.env.NEXT_PUBLIC_DB_PROXY_URL || '').trim();
        const appProxyUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || dbProxyUrl || '').trim();

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

        // Focus on primary Vercel/Firebase backend
        try {
            const res = await tryNetworkCall(rawUrlString, 20000);
            if (res.ok || [401, 403, 404, 406].includes(res.status)) return res;
            return res;
        } catch (e) {
            console.warn(`[Network] Primary fetch failed: ${e}`);
            throw e;
        }
    };

    if (isGet) return dedupedFetch(rawUrlString, executeRequest);
    return executeRequest();
}
