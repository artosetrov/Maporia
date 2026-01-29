/**
 * In-memory request cache with TTL and pending request deduplication.
 * Used by useStableFetch for request-level caching.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export const requestCache = {
  get<T>(key: string): T | null {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  },

  set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    cache.set(key, { data, expiresAt: Date.now() + ttl });
  },

  getPending<T>(key: string): Promise<T> | undefined {
    return pending.get(key) as Promise<T> | undefined;
  },

  setPending(key: string, promise: Promise<unknown>): void {
    pending.set(key, promise);
    promise.finally(() => pending.delete(key));
  },

  invalidate(key: string): void {
    cache.delete(key);
  },
};
