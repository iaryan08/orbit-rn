const CACHE_PREFIX = 'orbit:cache:v1'
const CACHE_SCHEMA_VERSION = 1;
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function makeKey(key: string) {
  return `${CACHE_PREFIX}:${key}`
}

type CacheEnvelope<T> = { _v: number; _at: number; data: T };

export function readOfflineCache<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(makeKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw);
    // Versioned envelope: check TTL
    if (parsed && typeof parsed === 'object' && '_v' in parsed && '_at' in parsed) {
      const wrapped = parsed as CacheEnvelope<T>;
      if (Date.now() - wrapped._at > ttlMs) {
        // Stale: remove and return null so caller re-fetches
        localStorage.removeItem(makeKey(key));
        return null;
      }
      return wrapped.data;
    }
    // Legacy shape (no envelope) — return as-is for backward compat
    return parsed as T;
  } catch {
    return null
  }
}

export function writeOfflineCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    const envelope: CacheEnvelope<T> = { _v: CACHE_SCHEMA_VERSION, _at: Date.now(), data: value };
    localStorage.setItem(makeKey(key), JSON.stringify(envelope))
  } catch {
    // Ignore quota / serialization failures
  }
}

export function deleteOfflineCache(key: string) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(makeKey(key))
  } catch {
    // noop
  }
}
