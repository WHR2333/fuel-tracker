// In-memory API response cache with stale-while-revalidate.
//
// Usage:
//   const data = await cachedFetch("vehicles", () => api.list(), 30);
//   // First call: fetches from API, caches for 30s
//   // Second call within 30s: returns cache instantly (0ms)
//   // After 30s: returns stale cache + revalidates in background
//
// Cache is invalidated via invalidate("vehicles") when mutations occur.

interface CacheEntry {
  data: unknown;
  fetchedAt: number;   // Date.now() when cached
  ttl: number;         // seconds
  inflight: Promise<unknown> | null;
}

const store = new Map<string, CacheEntry>();

/**
 * Fetch with cache. Returns cached data if available and fresh.
 * If stale, returns cached data immediately and revalidates in background.
 * If no cache, waits for the fetch.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const entry = store.get(key);
  const now = Date.now();

  // Fresh cache — return immediately.
  if (entry && (now - entry.fetchedAt) < ttlSeconds * 1000) {
    return entry.data as T;
  }

  // Stale cache — return stale data, revalidate in background.
  if (entry) {
    // Only start one background revalidation at a time.
    if (!entry.inflight) {
      entry.inflight = fetcher().then((fresh) => {
        store.set(key, { data: fresh, fetchedAt: Date.now(), ttl: ttlSeconds, inflight: null });
        return fresh;
      }).catch(() => {
        // Revalidation failed — keep stale data, allow retry next time.
        if (entry) entry.inflight = null;
      });
    }
    return entry.data as T;
  }

  // No cache at all — fetch and wait.
  const data = await fetcher();
  store.set(key, { data, fetchedAt: Date.now(), ttl: ttlSeconds, inflight: null });
  return data;
}

/**
 * Invalidate one or more cache keys. Supports prefix matching:
 *   invalidate("records")  → clears "records" and "records:v123" etc.
 */
export function invalidate(...keys: string[]): void {
  for (const key of keys) {
    // Exact match.
    store.delete(key);
    // Prefix match for scoped keys like "records:v123".
    for (const k of store.keys()) {
      if (k.startsWith(key + ":") || k.startsWith(key + "/")) {
        store.delete(k);
      }
    }
  }
}

/** Clear everything (e.g. on logout). */
export function invalidateAll(): void {
  store.clear();
}
