import { createBrowserClient } from '@supabase/ssr'
import { orbitFetch } from '@/lib/client/network'
import { getResolvedSupabasePublishableKey, getResolvedSupabaseUrl, getResolvedDirectSupabaseUrl } from '@/lib/supabase/env'

let client: ReturnType<typeof createBrowserClient> | undefined
let directClient: ReturnType<typeof createBrowserClient> | undefined

const isStorageAvailable = () => {
  if (typeof window === 'undefined') return false;
  try {
    const key = '__ls_test__';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const memoryStorage: Record<string, string> = {};
const safeStorage = {
  getItem: (key: string) => {
    try {
      return isStorageAvailable() ? localStorage.getItem(key) : memoryStorage[key] || null;
    } catch { return memoryStorage[key] || null; }
  },
  setItem: (key: string, value: string) => {
    try {
      if (isStorageAvailable()) localStorage.setItem(key, value);
      else memoryStorage[key] = value;
    } catch { memoryStorage[key] = value; }
  },
  removeItem: (key: string) => {
    try {
      if (isStorageAvailable()) localStorage.removeItem(key);
      else delete memoryStorage[key];
    } catch { delete memoryStorage[key]; }
  }
};

// Global Lock Shim for browsers that deadlock on NavigatorLock (Chrome / Private Windows)
if (typeof window !== 'undefined') {
  try {
    const locks = (window.navigator as any).locks;
    if (locks && typeof locks.acquire === 'function') {
      try {
        const originalAcquire = locks.acquire.bind(locks);
        locks.acquire = async (name: string, options: any, callback?: any) => {
          const cb = typeof options === 'function' ? options : callback;
          // If it's a Supabase lock, bypass it instantly to prevent 10s hangs
          const lockName = String(name || '');
          if (lockName.includes('supabase') || lockName.includes('auth') || lockName.includes('sb-')) {
            return await cb();
          }
          return await originalAcquire(name, options, callback);
        };
        locks.acquire.isNoop = true;
      } catch (bindErr) {
        // Fallback for extremely restricted environments
        locks.acquire = async (_n: any, _o: any, c: any) => {
          const cb = typeof _o === 'function' ? _o : c;
          return await cb();
        };
      }
    }
  } catch (e) {
    console.warn('[Bypass] Failed to shim locks:', e);
  }
}

export function createClient() {
  if (client) return client

  const resolvedSupabaseUrl = getResolvedSupabaseUrl()
  const resolvedPublishableKey = getResolvedSupabasePublishableKey()
  // Always use the direct Supabase URL for realtime WebSockets.
  // CF Workers free tier does not tunnel WebSocket upgrades, so using the
  // proxy URL for WS will fail silently. HTTP requests still go through orbitFetch/proxy.
  const directSupabaseUrl = getResolvedDirectSupabaseUrl()

  client = createBrowserClient(
    resolvedSupabaseUrl,
    resolvedPublishableKey,
    {
      realtime: {
        params: {
          apikey: resolvedPublishableKey
        },
        // Force realtime to connect directly to Supabase, bypassing the CF proxy
        ...(directSupabaseUrl ? { url: `${directSupabaseUrl.replace(/^https?:\/\//, 'wss://')}/realtime/v1` } : {})
      },
      global: {
        fetch: orbitFetch
      },
      auth: {
        persistSession: true,
        storage: safeStorage,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        lock: async (name: string, _timeout: number, callback: () => Promise<any>) => {
          return await callback();
        }
      }
    }
  )
  return client
}

/**
 * Creates a SUPABASE client that bypasses the proxy/orbitFetch layer.
 * Essential for Realtime/WebSockets to avoid Cloudflare/Vercel timeouts.
 */
export function createDirectClient() {
  if (directClient) return directClient

  const directUrl = getResolvedDirectSupabaseUrl()
  const resolvedPublishableKey = getResolvedSupabasePublishableKey()

  directClient = createBrowserClient(
    directUrl,
    resolvedPublishableKey,
    {
      auth: {
        persistSession: false, // Don't track session for this auxiliary client
        storage: safeStorage,
      },
      realtime: {
        params: {
          apikey: resolvedPublishableKey
        }
      }
    }
  )
  return directClient
}
